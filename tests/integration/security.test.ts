import { describe, expect, it } from 'vitest';
import worker from '../../worker/index';

const env = {
  DB: {} as D1Database,
  ACCESS_TEAM_DOMAIN: 'team.example.com',
  ACCESS_AUDIENCE: 'audience',
  OWNER_EMAIL: 'owner@example.com',
  ALLOWED_ORIGINS: 'http://localhost:5173'
};

describe('API security boundary', () => {
  it('rejects an unauthenticated API request', async () => {
    const response = await worker.fetch(new Request('https://recipes.example/api/health'), env);
    expect(response.status).toBe(401);
  });

  it('does not allow unknown API routes anonymously', async () => {
    const response = await worker.fetch(new Request('https://recipes.example/api/recipes'), env);
    expect(response.status).toBe(404);
  });

  it('rejects unexpected origins', async () => {
    const response = await worker.fetch(new Request('https://recipes.example/api/health', { headers: { Origin: 'https://evil.example' } }), env);
    expect(response.status).toBe(403);
  });
});
