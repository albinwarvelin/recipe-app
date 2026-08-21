import { z } from 'zod';
import { error, MAX_TAG_JSON_BYTES, readBoundedStream, readJson } from '../http';
import { requirePublicRemoteImageUrl, UnsafeRemoteUrlError } from '../import-security';

const MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const supportedContentTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const requestSchema = z.object({ url: z.string().trim().min(1).max(2_000) }).strict();
type ImageImportEnv = Pick<Env, 'PRODUCTION_HOSTNAME'>;

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

export function detectedImageContentType(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])) return 'image/png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brands = ascii(bytes, 8, Math.min(bytes.length - 8, 32));
    if (/(heic|heix|hevc|hevx)/.test(brands)) return 'image/heic';
    if (/(mif1|msf1|heif)/.test(brands)) return 'image/heif';
  }
  return null;
}

async function fetchRemoteImage(value: string, env: ImageImportEnv, fetcher: typeof fetch): Promise<Response> {
  let current = value;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const url = await requirePublicRemoteImageUrl(current, env.PRODUCTION_HOSTNAME, fetcher);
    let response: Response;
    try {
      response = await fetcher(url, {
        method: 'GET',
        headers: { Accept: 'image/webp,image/png,image/jpeg,image/heic,image/heif' },
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error('REMOTE_FETCH_FAILED');
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('Location');
      await response.body?.cancel();
      if (!location || redirects === MAX_REDIRECTS) throw new Error('REMOTE_REDIRECT_FAILED');
      current = new URL(location, url).toString();
      continue;
    }
    return response;
  }
  throw new Error('REMOTE_REDIRECT_FAILED');
}

export async function importImageRoute(request: Request, env: ImageImportEnv, id: string, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'POST') return error('METHOD_NOT_ALLOWED', 'Method is not supported for this route.', 405, id);
  const value = await readJson(request, id, MAX_TAG_JSON_BYTES);
  if (value instanceof Response) return value;
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) return error('VALIDATION_ERROR', 'A valid image URL is required.', 422, id);

  let remote: Response;
  try {
    remote = await fetchRemoteImage(parsed.data.url, env, fetcher);
  } catch (cause) {
    if (cause instanceof UnsafeRemoteUrlError) return error('UNSAFE_IMAGE_URL', 'The image URL is not allowed.', 422, id);
    return error('REMOTE_IMAGE_UNAVAILABLE', 'The remote image could not be downloaded.', 422, id);
  }
  if (!remote.ok) {
    await remote.body?.cancel();
    return error('REMOTE_IMAGE_UNAVAILABLE', 'The remote image could not be downloaded.', 422, id);
  }
  const declaredType = remote.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() ?? '';
  if (!supportedContentTypes.has(declaredType)) {
    await remote.body?.cancel();
    return error('UNSUPPORTED_IMAGE_TYPE', 'The remote resource is not a supported image.', 415, id);
  }
  const declaredLength = Number(remote.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_IMAGE_BYTES) {
    await remote.body?.cancel();
    return error('REMOTE_IMAGE_TOO_LARGE', 'The remote image exceeds the 20 MB limit.', 413, id);
  }
  let body: ArrayBuffer | null;
  try { body = await readBoundedStream(remote.body, MAX_REMOTE_IMAGE_BYTES); }
  catch { return error('REMOTE_IMAGE_UNAVAILABLE', 'The remote image could not be downloaded.', 422, id); }
  if (body === null) return error('REMOTE_IMAGE_TOO_LARGE', 'The remote image exceeds the 20 MB limit.', 413, id);
  const detectedType = detectedImageContentType(body);
  if (!detectedType || detectedType !== declaredType) return error('INVALID_IMAGE', 'The remote resource is not a valid supported image.', 422, id);

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': detectedType,
      'Content-Length': String(body.byteLength),
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-ID': id,
    },
  });
}
