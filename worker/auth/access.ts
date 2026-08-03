import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AuthIdentity } from '../types';

const ACCESS_TOKEN_HEADER = 'Cf-Access-Jwt-Assertion';
const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function authResponse(status: 401 | 403, requestId?: string): Response {
  return Response.json(
    {
      error: {
        code: status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
        message: status === 401 ? 'Authentication is required.' : 'The authenticated identity is not allowed.',
        ...(requestId ? { requestId } : {}),
      },
    },
    { status }
  );
}

export function audienceForRequest(request: Request, env: Env): string | undefined {
  const hostname = new URL(request.url).hostname.toLowerCase();
  const productionHostname = env.PRODUCTION_HOSTNAME.trim().toLowerCase();
  if (hostname === productionHostname) return env.ACCESS_PRODUCTION_AUDIENCE;
  if (hostname.endsWith(`-${productionHostname}`)) return env.ACCESS_PREVIEW_AUDIENCE;
  return undefined;
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

export function isApprovedEmail(email: string, configuredEmails: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  return configuredEmails
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalizedEmail);
}

export async function requireAccessIdentity(request: Request, env: Env, requestId?: string): Promise<AuthIdentity> {
  const token = request.headers.get(ACCESS_TOKEN_HEADER);
  if (!token) throw authResponse(401, requestId);

  let issuer: string;
  try {
    issuer = issuerFromEnvironment(env);
  } catch {
    throw authResponse(403, requestId);
  }

  const audience = audienceForRequest(request, env);
  if (!audience) throw authResponse(403, requestId);

  try {
    let jwks = jwksByIssuer.get(issuer);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      jwksByIssuer.set(issuer, jwks);
    }
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience,
      algorithms: ['RS256'],
      clockTolerance: 5,
    });

    const email = claimEmail(payload);
    const subject = typeof payload.sub === 'string' ? payload.sub : undefined;
    if (!email || !subject || !isApprovedEmail(email, env.APPROVED_EMAILS)) throw authResponse(403, requestId);

    return { email, subject, audience: audiences(payload) };
  } catch (error) {
    if (error instanceof Response) throw error;
    throw authResponse(403, requestId);
  }
}
