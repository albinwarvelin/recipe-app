export function requestId(request: Request): string {
  return request.headers.get('X-Request-ID') ?? crypto.randomUUID();
}

export function json<T>(body: T, status = 200, id?: string): Response {
  const response = Response.json(body, { status });
  if (id) response.headers.set('X-Request-ID', id);
  return response;
}

export type ErrorStatus = 400 | 401 | 403 | 404 | 405 | 409 | 413 | 415 | 422 | 429 | 500;

export const MAX_RECIPE_JSON_BYTES = 1024 * 1024;
export const MAX_SYNC_JSON_BYTES = 5 * 1024 * 1024;
export const MAX_TAG_JSON_BYTES = 16 * 1024;

export function error(code: string, message: string, status: ErrorStatus, id: string, details?: unknown): Response {
  return json({ error: { code, message, requestId: id, ...(details === undefined ? {} : { details }) } }, status, id);
}

export async function readBoundedStream(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<ArrayBuffer | null> {
  if (!body) return new ArrayBuffer(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

export function readBoundedBody(request: Request, maxBytes: number): Promise<ArrayBuffer | null> {
  return readBoundedStream(request.body, maxBytes);
}

export async function readJson(request: Request, id: string, maxBytes: number): Promise<unknown | Response> {
  const contentType = request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') return error('UNSUPPORTED_MEDIA_TYPE', 'Expected application/json.', 415, id);
  const contentLength = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return error('PAYLOAD_TOO_LARGE', 'Request body is too large.', 413, id);
  const body = await readBoundedBody(request, maxBytes);
  if (body === null) return error('PAYLOAD_TOO_LARGE', 'Request body is too large.', 413, id);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
    return JSON.parse(text) as unknown;
  } catch {
    return error('INVALID_JSON', 'The request body is not valid JSON.', 400, id);
  }
}
