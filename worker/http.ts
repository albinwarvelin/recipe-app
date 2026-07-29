export function requestId(request: Request): string {
  return request.headers.get('X-Request-ID') ?? crypto.randomUUID();
}

export function json<T>(body: T, status = 200, id?: string): Response {
  const response = Response.json(body, { status });
  if (id) response.headers.set('X-Request-ID', id);
  return response;
}

export function error(code: string, message: string, status: 400 | 401 | 403 | 404 | 405 | 409 | 413 | 422 | 429, id: string): Response {
  return json({ error: { code, message, requestId: id } }, status, id);
}

export async function readJson(request: Request, id: string): Promise<unknown | Response> {
  const contentType = request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') return error('UNSUPPORTED_MEDIA_TYPE', 'Expected application/json.', 400, id);
  const contentLength = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > 100_000) return error('PAYLOAD_TOO_LARGE', 'Request body is too large.', 413, id);
  try { return await request.json(); } catch { return error('INVALID_JSON', 'The request body is not valid JSON.', 400, id); }
}
