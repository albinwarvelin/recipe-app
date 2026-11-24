import { imageLimits, imageObjectKey, jpegDimensions, type ImageVariant } from '../../shared/images';
import { getImage } from '../data/images';
import { error, json, readBoundedBody } from '../http';
import { findProcessedOperation, processedOperationStatement, requestFingerprint } from '../idempotency';

const MAX_UPLOAD_BYTES = imageLimits.fullBytes + imageLimits.thumbnailBytes + 4096;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function operationId(request: Request, id: string): string | Response {
  const value = request.headers.get('Idempotency-Key');
  if (!value) return error('IDEMPOTENCY_KEY_REQUIRED', 'A stable UUID Idempotency-Key is required.', 400, id);
  return uuidPattern.test(value) ? value : error('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be a UUID.', 422, id);
}

async function sha256(body: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', body)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function uploadImage(request: Request, env: Env, id: string, imageId: string): Promise<Response> {
  const key = operationId(request, id);
  if (key instanceof Response) return key;
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'multipart/form-data') {
    return error('UNSUPPORTED_IMAGE_TYPE', 'Expected a JPEG cover and thumbnail as multipart/form-data.', 415, id);
  }
  if (Number(request.headers.get('Content-Length') ?? '0') > MAX_UPLOAD_BYTES) return error('PAYLOAD_TOO_LARGE', 'The image upload is too large.', 413, id);
  const body = await readBoundedBody(request, MAX_UPLOAD_BYTES);
  if (body === null) return error('PAYLOAD_TOO_LARGE', 'The image upload is too large.', 413, id);
  let form: FormData;
  try { form = await new Response(body, { headers: { 'Content-Type': request.headers.get('Content-Type')! } }).formData(); }
  catch { return error('INVALID_IMAGE', 'The image upload could not be read.', 422, id); }
  const full = form.get('full');
  const thumbnail = form.get('thumbnail');
  if ([...form.keys()].length !== 2 || !full || !thumbnail || typeof full === 'string' || typeof thumbnail === 'string'
    || full.type !== 'image/jpeg' || thumbnail.type !== 'image/jpeg') {
    return error('UNSUPPORTED_IMAGE_TYPE', 'Exactly one JPEG cover and one JPEG thumbnail are required.', 415, id);
  }
  if (full.size > imageLimits.fullBytes || thumbnail.size > imageLimits.thumbnailBytes) return error('PAYLOAD_TOO_LARGE', 'An image exceeds its size limit.', 413, id);
  const fullBody = await full.arrayBuffer();
  const thumbnailBody = await thumbnail.arrayBuffer();
  const dimensions = jpegDimensions(fullBody);
  const small = jpegDimensions(thumbnailBody);
  if (!dimensions || !small || Math.max(dimensions.width, dimensions.height) > imageLimits.fullDimension
    || Math.max(small.width, small.height) > imageLimits.thumbnailDimension) {
    return error('INVALID_IMAGE', 'The cover or thumbnail is not a supported JPEG within the dimension limits.', 422, id);
  }
  const scale = Math.min(1, imageLimits.thumbnailDimension / Math.max(dimensions.width, dimensions.height));
  if (Math.abs(small.width - Math.round(dimensions.width * scale)) > 1 || Math.abs(small.height - Math.round(dimensions.height * scale)) > 1) {
    return error('INVALID_IMAGE_DIMENSIONS', 'The thumbnail dimensions do not match the cover.', 422, id);
  }
  const fullChecksum = await sha256(fullBody);
  const thumbnailChecksum = await sha256(thumbnailBody);
  // The immutable image ID identifies the complete pair, not just the cover.
  const checksum = await sha256(new TextEncoder().encode(`${fullChecksum}:${thumbnailChecksum}`).buffer as ArrayBuffer);
  const path = `/api/images/${imageId}`;
  const fingerprint = await requestFingerprint('PUT', path, { checksum });
  const processed = await findProcessedOperation(env.DB, key);
  if (processed) {
    if (processed.method !== 'PUT' || processed.path !== path || processed.request_hash !== fingerprint) return error('IDEMPOTENCY_KEY_REUSE', 'That Idempotency-Key was already used for a different request.', 409, id);
    const response = json(JSON.parse(processed.response_json) as unknown, processed.response_status, id);
    response.headers.set('Idempotency-Replayed', 'true');
    return response;
  }
  const existing = await getImage(env.DB, imageId, true);
  if (existing && existing.checksum_sha256 !== checksum) return error('IMAGE_ID_REUSE', 'That image identifier already belongs to different content.', 409, id);
  const now = new Date().toISOString();
  const responseBody = { image: { id: imageId, content_type: 'image/jpeg', ...dimensions, byte_size: full.size, created_at: existing?.created_at ?? now } };
  // Reserve the immutable ID atomically before writing R2. A reserved row is
  // inactive until both objects exist; competing content cannot overwrite it.
  await env.DB.prepare('INSERT INTO recipe_images (id, object_key, content_type, width, height, byte_size, checksum_sha256, created_at, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) ON CONFLICT(id) DO NOTHING')
    .bind(imageId, imageObjectKey(imageId, 'full'), 'image/jpeg', dimensions.width, dimensions.height, full.size, checksum, now).run();
  const reserved = await getImage(env.DB, imageId, true);
  if (reserved?.checksum_sha256 !== checksum) return error('IMAGE_ID_REUSE', 'That image identifier already belongs to different content.', 409, id);
  // Keep the reservation and any completed part if interrupted. Retrying the
  // immutable pair is safe; deleting partial objects could race another retry.
  for (const [variant, bytes, digest] of [['full', fullBody, fullChecksum], ['thumbnail', thumbnailBody, thumbnailChecksum]] as const) {
    await env.IMAGES.put(imageObjectKey(imageId, variant), bytes, {
      httpMetadata: { contentType: 'image/jpeg', cacheControl: 'private, max-age=86400' }, sha256: digest,
    });
  }
  await env.DB.batch([
    env.DB.prepare('UPDATE recipe_images SET deleted_at = NULL WHERE id = ?1').bind(imageId),
    processedOperationStatement(env.DB, key, 'PUT', path, fingerprint, existing ? 200 : 201, responseBody, now),
  ]);
  return json(responseBody, existing ? 200 : 201, id);
}

async function serveImage(request: Request, env: Env, id: string, imageId: string, variant: ImageVariant): Promise<Response> {
  const image = await getImage(env.DB, imageId);
  if (!image) return error('NOT_FOUND', 'Image was not found.', 404, id);
  const object = await env.IMAGES.get(imageObjectKey(imageId, variant), { onlyIf: request.headers });
  if (!object) return error('NOT_FOUND', 'Image was not found.', 404, id);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', 'image/jpeg');
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
    if (processed.method !== 'DELETE' || processed.path !== path || processed.request_hash !== fingerprint) return error('IDEMPOTENCY_KEY_REUSE', 'That Idempotency-Key was already used for a different request.', 409, id);
    const response = json(JSON.parse(processed.response_json) as unknown, processed.response_status, id);
    response.headers.set('Idempotency-Replayed', 'true');
    return response;
  }
  const image = await getImage(env.DB, imageId, true);
  if (!image) return error('NOT_FOUND', 'Image was not found.', 404, id);
  const inUse = await env.DB.prepare('SELECT 1 AS found FROM recipes WHERE image_key = ?1 AND deleted_at IS NULL LIMIT 1').bind(imageId).first();
  if (inUse) return error('IMAGE_IN_USE', 'The image is still attached to a recipe.', 409, id);
  // Remove both objects before acknowledging deletion, so a retry also repairs
  // an interrupted delete without leaving orphaned variants behind.
  await env.IMAGES.delete([imageObjectKey(imageId, 'full'), imageObjectKey(imageId, 'thumbnail')]);
  const now = new Date().toISOString();
  const responseBody = { deleted: true, id: imageId };
  await env.DB.batch([
    env.DB.prepare('UPDATE recipe_images SET deleted_at = ?1 WHERE id = ?2').bind(now, imageId),
    processedOperationStatement(env.DB, key, 'DELETE', path, fingerprint, 200, responseBody, now),
  ]);
  return json(responseBody, 200, id);
}

export async function imageRoute(request: Request, env: Env, id: string): Promise<Response> {
  const match = new URL(request.url).pathname.match(/^\/api\/images\/([^/]+)(?:\/(full|thumbnail))?$/);
  if (!match || !uuidPattern.test(match[1])) return error('NOT_FOUND', 'Image route was not found.', 404, id);
  if (request.method === 'GET' && match[2]) return serveImage(request, env, id, match[1], match[2] as ImageVariant);
  if (request.method === 'PUT' && !match[2]) return uploadImage(request, env, id, match[1]);
  if (request.method === 'DELETE' && !match[2]) return deleteImage(request, env, id, match[1]);
  return error('METHOD_NOT_ALLOWED', 'Method is not supported for this route.', 405, id);
}
