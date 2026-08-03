import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSession } from '../../src/api/session';

afterEach(() => vi.unstubAllGlobals());

describe('session check', () => {
  it('accepts a valid authenticated JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ authenticated: true, identity: { email: 'owner@example.com' } })));
    await expect(getSession()).resolves.toEqual({
      status: 'authenticated',
      session: { authenticated: true, identity: { email: 'owner@example.com' } },
    });
  });

  it('treats an Access opaque redirect as signed out', async () => {
    const redirected = new Response(null, { status: 200 });
    Object.defineProperty(redirected, 'type', { value: 'opaqueredirect' });
    vi.stubGlobal('fetch', vi.fn(async () => redirected));
    await expect(getSession()).resolves.toEqual({ status: 'signed-out' });
  });

  it('keeps unrelated HTML responses as errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } })));
    await expect(getSession()).resolves.toEqual({ status: 'error' });
  });
});
