import { requireAccessIdentity } from './auth/access';
import { error, json, requestId } from './http';
import { allowedOrigin, applySecurityHeaders } from './middleware/security';
import { recipeRoute } from './routes/recipes';
import { imageRoute } from './routes/images';
import { importImageRoute } from './routes/import-image';
import { syncRoute } from './routes/sync';
import { tagRoute } from './routes/tags';
import { ingredientRoute } from './routes/ingredients';

async function handleRequest(request: Request, env: Env, id: string): Promise<Response> {
  const origin = allowedOrigin(request, env);
  if (request.headers.get('Origin') && !origin) {
    return applySecurityHeaders(error('FORBIDDEN_ORIGIN', 'Origin is not allowed.', 403, id));
  }
  if (request.method === 'OPTIONS') return applySecurityHeaders(new Response(null, { status: 204 }), origin);

  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) {
    if (env.ASSETS) {
      const response = applySecurityHeaders(await env.ASSETS.fetch(request), origin);
      response.headers.set('X-Recipe-App-Asset', '1');
      return response;
    }
    return applySecurityHeaders(error('NOT_FOUND', 'Route was not found.', 404, id), origin);
  }

  let identity;
  try {
    identity = await requireAccessIdentity(request, env, id);
  } catch (response) {
    if (response instanceof Response) return applySecurityHeaders(response, origin);
    throw response;
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    if (!origin || request.headers.get('X-Requested-With') !== 'RecipeApp') {
      return applySecurityHeaders(error('CSRF_CHECK_FAILED', 'A same-origin request marker is required.', 403, id), origin);
    }
  }

  let response: Response;
  if (url.pathname === '/api/session') {
    response = json({ authenticated: true, identity: { email: identity.email } }, 200, id);
  } else if (url.pathname === '/api/health') {
    response = json({ ok: true }, 200, id);
  } else if (url.pathname === '/api/recipes' || url.pathname.startsWith('/api/recipes/')) {
    response = await recipeRoute(request, env, id);
  } else if (url.pathname === '/api/tags') {
    response = await tagRoute(request, env, id);
  } else if (url.pathname === '/api/ingredients') {
    response = await ingredientRoute(request, env, id);
  } else if (url.pathname === '/api/import/image') {
    if (request.method !== 'POST') {
      response = await importImageRoute(request, env, id);
    } else {
      const rateLimit = await env.IMPORT_RATE_LIMITER.limit({ key: identity.email });
      response = rateLimit.success
        ? await importImageRoute(request, env, id)
        : error('RATE_LIMITED', 'Too many image import attempts. Try again later.', 429, id);
    }
  } else if (url.pathname.startsWith('/api/images/')) {
    response = await imageRoute(request, env, id);
  } else if (url.pathname === '/api/sync' || url.pathname === '/api/sync/changes') {
    response = await syncRoute(request, env, id);
  } else {
    response = error('NOT_FOUND', 'Route was not found.', 404, id);
  }
  if (!(request.method === 'GET' && url.pathname.startsWith('/api/images/'))) response.headers.set('Cache-Control', 'no-store');
  return applySecurityHeaders(response, origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = requestId(request);
    const startedAt = Date.now();
    let status = 500;
    try {
      const response = await handleRequest(request, env, id);
      status = response.status;
      return response;
    } catch (cause) {
      console.error(JSON.stringify({ event: 'unhandled_request_error', requestId: id, method: request.method, route: new URL(request.url).pathname, error: cause instanceof Error ? cause.name : 'UnknownError' }));
      return applySecurityHeaders(error('INTERNAL_ERROR', 'The request could not be completed.', 500, id));
    } finally {
      console.log(JSON.stringify({ event: 'request_complete', requestId: id, method: request.method, route: new URL(request.url).pathname, status, durationMs: Date.now() - startedAt }));
    }
  },
} satisfies ExportedHandler<Env>;
