import type { Env } from './types';
import { requireAccessIdentity } from './auth/access';
import { allowedOrigin, applySecurityHeaders } from './middleware/security';
import { requestId, error } from './http';
import { recipeRoute } from './routes/recipes';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = requestId(request);
    const origin = allowedOrigin(request, env);
    if (request.headers.get('Origin') && !origin) return applySecurityHeaders(error('FORBIDDEN_ORIGIN', 'Origin is not allowed.', 403, id));
    if (request.method === 'OPTIONS') return applySecurityHeaders(new Response(null, { status: 204 }), origin);

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      if (env.ASSETS) return applySecurityHeaders(await env.ASSETS.fetch(request), origin);
      return applySecurityHeaders(error('NOT_FOUND', 'Route was not found.', 404, id), origin);
    }
    let identity;
    try { identity = await requireAccessIdentity(request, env); } catch (response) { return applySecurityHeaders(response as Response, origin); }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      if (!origin || request.headers.get('X-Requested-With') !== 'RecipeApp') return applySecurityHeaders(error('CSRF_CHECK_FAILED', 'A same-origin request marker is required.', 403, id), origin);
    }
    if (url.pathname === '/api/health') return applySecurityHeaders(Response.json({ ok: true, owner: identity.email }, { headers: { 'X-Request-ID': id } }), origin);
    if (url.pathname === '/api/recipes' || url.pathname.startsWith('/api/recipes/')) return applySecurityHeaders(await recipeRoute(request, env, id), origin);
    return applySecurityHeaders(error('NOT_FOUND', 'Route was not found.', 404, id), origin);
  }
};
