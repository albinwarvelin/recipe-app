import { getImage } from '../data/images';
import { error, json, readBoundedBody } from '../http';
import { findProcessedOperation, processedOperationStatement, requestFingerprint } from '../idempotency';

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function imageIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/api\/images\/([^/]+)$/);
  return match?.[1];
}

function operationId(request: Request, id: string): string | Response {
  const value = request.headers.get('Idempotency-Key');
  if (!value) return error('IDEMPOTENCY_KEY_REQUIRED', 'A stable UUID Idempotency-Key is required.', 400, id);
  return uuidPattern.test(value) ? value : error('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be a UUID.', 422, id);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function uint24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

export function webpDimensions(buffer: ArrayBuffer): { width: number; height: number } | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(bytes, 12, 4);
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return { width: uint24(bytes, 24) + 1, height: uint24(bytes, 27) + 1 };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
    };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    };
  }
  return null;
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function uploadImage(request: Request, env: Env, id: string, imageId: string): Promise<Response> {
  const key = operationId(request, id);
  if (key instanceof Response) return key;
  if (request.headers.get('Content-Type')?.split(';')[0].toLowerCase() !== 'image/webp') {
    return error('UNSUPPORTED_IMAGE_TYPE', 'The uploaded image must be WebP.', 415, id);
  }
  const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
  if (declaredLength > MAX_IMAGE_BYTES) return error('PAYLOAD_TOO_LARGE', 'The image exceeds the 6 MB limit.', 413, id);
  const body = await readBoundedBody(request, MAX_IMAGE_BYTES);
  if (body === null) return error('PAYLOAD_TOO_LARGE', 'The image exceeds the 6 MB limit.', 413, id);
  if (body.byteLength === 0) return error('INVALID_IMAGE', 'The image is empty.', 422, id);
  const dimensions = webpDimensions(body);
  if (!dimensions || dimensions.width > 4096 || dimensions.height > 4096) {
    return error('INVALID_IMAGE', 'The file is not a supported WebP image.', 422, id);
  }
  const suppliedWidth = Number(request.headers.get('X-Image-Width'));
  const suppliedHeight = Number(request.headers.get('X-Image-Height'));
  if (suppliedWidth !== dimensions.width || suppliedHeight !== dimensions.height) {
    return error('INVALID_IMAGE_DIMENSIONS', 'The image dimensions do not match its contents.', 422, id);
  }

  const checksum = hex(await crypto.subtle.digest('SHA-256', body));
  const fingerprint = await requestFingerprint('PUT', `/api/images/${imageId}`, { checksum, ...dimensions, byte_size: body.byteLength });
  const processed = await findProcessedOperation(env.DB, key);
  if (processed) {
    if (processed.method !== 'PUT' || processed.path !== `/api/images/${imageId}` || processed.request_hash !== fingerprint) {
      return error('IDEMPOTENCY_KEY_REUSE', 'That Idempotency-Key was already used for a different request.', 409, id);
    }
    const response = json(JSON.parse(processed.response_json) as unknown, processed.response_status, id);
    response.headers.set('Idempotency-Replayed', 'true');
    return response;
  }
  const existing = await getImage(env.DB, imageId, true);
  if (existing && existing.checksum_sha256 !== checksum) {
    return error('IMAGE_ID_REUSE', 'That image identifier already belongs to different content.', 409, id);
  }

  const objectKey = `covers/${imageId}.webp`;
  const now = new Date().toISOString();
  await env.IMAGES.put(objectKey, body, {
    httpMetadata: { contentType: 'image/webp', cacheControl: 'private, max-age=86400' },
    customMetadata: { imageId, width: String(dimensions.width), height: String(dimensions.height) },
    sha256: checksum,
  });
  const responseBody = { image: { id: imageId, content_type: 'image/webp', ...dimensions, byte_size: body.byteLength, created_at: existing?.created_at ?? now } };
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO recipe_images (id, object_key, content_type, width, height, byte_size, checksum_sha256, created_at, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL) ON CONFLICT(id) DO UPDATE SET deleted_at = NULL').bind(imageId, objectKey, 'image/webp', dimensions.width, dimensions.height, body.byteLength, checksum, existing?.created_at ?? now),
      processedOperationStatement(env.DB, key, 'PUT', `/api/images/${imageId}`, fingerprint, existing ? 200 : 201, responseBody, now),
    ]);
  } catch (cause) {
    if (!existing) await env.IMAGES.delete(objectKey);
    throw cause;
  }
  return json(responseBody, existing ? 200 : 201, id);
}

async function serveImage(request: Request, env: Env, id: string, imageId: string): Promise<Response> {
  const image = await getImage(env.DB, imageId);
  if (!image) return error('NOT_FOUND', 'Image was not found.', 404, id);
  const object = await env.IMAGES.get(image.object_key, { onlyIf: request.headers });
  if (!object) return error('NOT_FOUND', 'Image was not found.', 404, id);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'private, max-age=86400');
  headers.set('Content-Disposition', 'inline');
  headers.set('X-Request-ID', id);
  if (!('body' in object)) return new Response(null, { status: 304, headers });
  return new Response(object.body, { status: 200, headers });
}

async function deleteImage(request: Request, env: Env, id: string, imageId: string): Promise<Response> {
  const key = operationId(request, id);
  if (key instanceof Response) return key;
  const path = `/api/images/${imageId}`;
  const fingerprint = await requestFingerprint('DELETE', path, null);
  const processed = await findProcessedOperation(env.DB, key);
  if (processed) {
    if (processed.method !== 'DELETE' || processed.path !== path || processed.request_hash !== fingerprint) {
      return error('IDEMPOTENCY_KEY_REUSE', 'That Idempotency-Key was already used for a different request.', 409, id);
    }
    const response = json(JSON.parse(processed.response_json) as unknown, processed.response_status, id);
    response.headers.set('Idempotency-Replayed', 'true');
    return response;
  }
  const image = await getImage(env.DB, imageId, true);
  if (!image) return error('NOT_FOUND', 'Image was not found.', 404, id);
  const inUse = await env.DB.prepare('SELECT 1 AS found FROM recipes WHERE image_key = ?1 AND deleted_at IS NULL LIMIT 1').bind(imageId).first();
  if (inUse) return error('IMAGE_IN_USE', 'The image is still attached to a recipe.', 409, id);
  const now = new Date().toISOString();
  const responseBody = { deleted: true, id: imageId };
  await env.DB.batch([
    env.DB.prepare('UPDATE recipe_images SET deleted_at = ?1 WHERE id = ?2').bind(now, imageId),
    processedOperationStatement(env.DB, key, 'DELETE', path, fingerprint, 200, responseBody, now),
  ]);
  await env.IMAGES.delete(image.object_key);
  return json(responseBody, 200, id);
}

export async function imageRoute(request: Request, env: Env, id: string): Promise<Response> {
  const imageId = imageIdFromPath(new URL(request.url).pathname);
  if (!imageId || !uuidPattern.test(imageId)) return error('NOT_FOUND', 'Image route was not found.', 404, id);
  if (request.method === 'GET') return serveImage(request, env, id, imageId);
  if (request.method === 'PUT') return uploadImage(request, env, id, imageId);
  if (request.method === 'DELETE') return deleteImage(request, env, id, imageId);
  return error('METHOD_NOT_ALLOWED', 'Method is not supported for this route.', 405, id);
}
