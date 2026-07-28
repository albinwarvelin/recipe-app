import type { Env } from '../types';

export interface AuthIdentity {
  email: string;
  subject: string;
}

export async function requireAccessIdentity(request: Request, env: Env): Promise<AuthIdentity> {
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!assertion) throw new Response('Unauthorized', { status: 401 });

  // Milestone 1 seam: cryptographic JWT validation belongs here before production data routes ship.
  // This intentionally fails closed until issuer, audience, signature, exp, nbf, and owner claims
  // are validated against Cloudflare Access JWKS.
  void env;
  void assertion;
  throw new Response('Unauthorized', { status: 401 });
}
