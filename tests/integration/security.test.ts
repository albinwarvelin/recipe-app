import { describe, expect, it } from 'vitest';
import worker from '../../worker/index';
import { applySecurityHeaders } from '../../worker/middleware/security';

const env = {
  ASSETS: {} as Fetcher,
  DB: {} as D1Database,
  IMAGES: {} as R2Bucket,
  IMPORT_RATE_LIMITER: {} as RateLimit,
  ACCESS_TEAM_DOMAIN: 'https://team.example.com',
  ACCESS_PRODUCTION_AUDIENCE: 'production-audience',
  ACCESS_PREVIEW_AUDIENCE: 'preview-audience',
  PRODUCTION_HOSTNAME: 'recipes.example',
  APPROVED_EMAILS: 'owner@example.com,alternate-owner@example.com',
  ALLOWED_ORIGINS: 'http://localhost:5173'
} satisfies Env;

describe('API security boundary', () => {
  it('permits local WASM image codecs while keeping evaluated JavaScript blocked', () => {
    const policy = applySecurityHeaders(new Response()).headers.get('Content-Security-Policy')!;
    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("'unsafe-inline'");
  });
  it('rejects an unauthenticated API request', async () => {
    const response = await worker.fetch(new Request('https://recipes.example/api/session'), env);
    expect(response.status).toBe(401);
  });

  it('does not allow unknown API routes anonymously', async () => {
    const response = await worker.fetch(new Request('https://recipes.example/api/recipes'), env);
    expect(response.status).toBe(401);
  });

  it('protects planning data with the same authentication boundary', async () => {
    const response = await worker.fetch(new Request('https://recipes.example/api/planning/changes'), env);
    expect(response.status).toBe(401);
  });

  it('rejects unexpected origins', async () => {
    const response = await worker.fetch(new Request('https://recipes.example/api/health', { headers: { Origin: 'https://evil.example' } }), env);
    expect(response.status).toBe(403);
  });
});
