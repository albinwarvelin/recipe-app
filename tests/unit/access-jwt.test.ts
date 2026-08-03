import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { audienceForRequest, requireAccessIdentity } from '../../worker/auth/access';

const issuer = 'https://access-test.example.com';
const audience = 'recipe-app-audience';
const keyId = 'test-access-key';

let privateKey: CryptoKey;

const env = {
  ASSETS: {} as Fetcher,
  DB: {} as D1Database,
  ACCESS_TEAM_DOMAIN: issuer,
  ACCESS_PRODUCTION_AUDIENCE: audience,
  ACCESS_PREVIEW_AUDIENCE: 'preview-audience',
  PRODUCTION_HOSTNAME: 'recipes.example',
  APPROVED_EMAILS: 'owner@example.com,alternate-owner@example.com',
  ALLOWED_ORIGINS: 'http://localhost:5173',
} satisfies Env;

async function accessToken(options: {
  email: string;
  tokenAudience?: string;
  notBefore?: string;
}): Promise<string> {
  let token = new SignJWT({ email: options.email })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setIssuer(issuer)
    .setAudience(options.tokenAudience ?? audience)
    .setSubject('access-user-id')
    .setIssuedAt()
    .setExpirationTime('5m');
  if (options.notBefore) token = token.setNotBefore(options.notBefore);
  return token.sign(privateKey);
}

function authenticatedRequest(token: string): Request {
  return new Request('https://recipes.example/api/session', {
    headers: { 'Cf-Access-Jwt-Assertion': token },
  });
}

async function expectForbidden(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
    throw new Error('Expected authentication to be rejected');
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(403);
  }
}

beforeAll(async () => {
  const keyPair = await generateKeyPair('RS256');
  privateKey = keyPair.privateKey;
  const publicJwk = await exportJWK(keyPair.publicKey);
  const jwks = { keys: [{ ...publicJwk, kid: keyId, alg: 'RS256', use: 'sig' }] };

  vi.stubGlobal('fetch', vi.fn(async () => Response.json(jwks)));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('Cloudflare Access JWT validation', () => {
  it('accepts a signed token for an alternate approved email', async () => {
    const token = await accessToken({ email: 'alternate-owner@example.com' });
    const identity = await requireAccessIdentity(authenticatedRequest(token), env);
    expect(identity.email).toBe('alternate-owner@example.com');
    expect(identity.subject).toBe('access-user-id');
  });

  it('rejects a valid token for an email outside the backend allowlist', async () => {
    const token = await accessToken({ email: 'attacker@example.com' });
    await expectForbidden(requireAccessIdentity(authenticatedRequest(token), env));
  });

  it('rejects a token issued for another Access application audience', async () => {
    const token = await accessToken({ email: 'owner@example.com', tokenAudience: 'other-application' });
    await expectForbidden(requireAccessIdentity(authenticatedRequest(token), env));
  });

  it('rejects a token whose not-before time is in the future', async () => {
    const token = await accessToken({ email: 'owner@example.com', notBefore: '10m' });
    await expectForbidden(requireAccessIdentity(authenticatedRequest(token), env));
  });

  it('selects preview and production audiences by exact host shape', () => {
    expect(audienceForRequest(new Request('https://recipes.example/api/session'), env)).toBe(audience);
    expect(audienceForRequest(new Request('https://version-recipes.example/api/session'), env)).toBe('preview-audience');
    expect(audienceForRequest(new Request('https://recipes.example.attacker.test/api/session'), env)).toBeUndefined();
  });
});
