import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AuthIdentity, Env } from '../types';

const ACCESS_TOKEN_HEADER = 'Cf-Access-Jwt-Assertion';
const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function authResponse(status: 401 | 403): Response {
  return Response.json(
    {
      error: {
        code: status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
        message: status === 401 ? 'Authentication is required.' : 'The authenticated identity is not allowed.',
      },
    },
    { status }
  );
}

function issuerFromEnvironment(env: Env): string {
  const value = env.ACCESS_TEAM_DOMAIN.trim().replace(/\/+$/, '');
  const issuer = new URL(value);
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.pathname !== '/') {
    throw new Error('Invalid Access team domain configuration');
  }
  return issuer.toString().replace(/\/$/, '');
}

function claimEmail(payload: JWTPayload): string | undefined {
  return typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : undefined;
}

function audiences(payload: JWTPayload): string[] {
  if (typeof payload.aud === 'string') return [payload.aud];
  return Array.isArray(payload.aud) && payload.aud.every((value) => typeof value === 'string')
    ? payload.aud
    : [];
}

export async function requireAccessIdentity(request: Request, env: Env): Promise<AuthIdentity> {
  const token = request.headers.get(ACCESS_TOKEN_HEADER);
  if (!token) throw authResponse(401);

  let issuer: string;
  try {
    issuer = issuerFromEnvironment(env);
  } catch {
    throw authResponse(403);
  }

  try {
    let jwks = jwksByIssuer.get(issuer);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      jwksByIssuer.set(issuer, jwks);
    }
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: env.ACCESS_AUDIENCE,
      algorithms: ['RS256'],
      clockTolerance: 5,
    });

    const email = claimEmail(payload);
    const subject = typeof payload.sub === 'string' ? payload.sub : undefined;
    if (!email || !subject || email !== env.OWNER_EMAIL.trim().toLowerCase()) throw authResponse(403);

    return { email, subject, audience: audiences(payload) };
  } catch (error) {
    if (error instanceof Response) throw error;
    throw authResponse(403);
  }
}
