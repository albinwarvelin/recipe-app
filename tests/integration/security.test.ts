import { describe, expect, it } from 'vitest';
import worker from '../../worker/index';

const env = {
  ASSETS: {} as Fetcher,
  DB: {} as D1Database,
  ACCESS_TEAM_DOMAIN: 'team.example.com',
  ACCESS_AUDIENCE: 'audience',
  APPROVED_EMAILS: 'owner@example.com,alternate-owner@example.com',
  ALLOWED_ORIGINS: 'http://localhost:5173'
};

describe('API security boundary', () => {
  it('rejects an unauthenticated API request', async () => {
    const response = await worker.fetch(new Request('https://recipes.example/api/session'), env);
    expect(response.status).toBe(401);
  });

  it('does not allow unknown API routes anonymously', async () => {
    const response = await worker.fetch(new Request('https://recipes.example/api/recipes'), env);
    expect(response.status).toBe(401);
  });

  it('rejects unexpected origins', async () => {
    const response = await worker.fetch(new Request('https://recipes.example/api/health', { headers: { Origin: 'https://evil.example' } }), env);
    expect(response.status).toBe(403);
  });
});
