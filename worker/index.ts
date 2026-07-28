import type { Env } from './types';
import { requireAccessIdentity } from './auth/access';
import { allowedOrigin, applySecurityHeaders } from './middleware/security';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request, env);
    if (request.headers.get('Origin') && !origin) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return applySecurityHeaders(new Response(null, { status: 204 }), origin);

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return applySecurityHeaders(new Response('Not found', { status: 404 }), origin);
    }
    if (url.pathname === '/api/health') {
      try { await requireAccessIdentity(request, env); } catch (response) { return applySecurityHeaders(response as Response, origin); }
      return applySecurityHeaders(Response.json({ ok: true }), origin);
    }
    return applySecurityHeaders(new Response('Not found', { status: 404 }), origin);
  }
};
