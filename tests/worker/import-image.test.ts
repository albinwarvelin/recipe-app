import { describe, expect, it } from 'vitest';
import { isForbiddenIpAddress, parseRemoteImageUrl } from '../../worker/import-security';
import { detectedImageContentType, importImageRoute } from '../../worker/routes/import-image';

function jpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}

function jsonRequest(url: string): Request {
  return new Request('https://recipes.test/api/import/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

function publicImageFetcher(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    if (url.hostname === 'cloudflare-dns.com') {
      if (init?.redirect !== 'manual') throw new TypeError('Workers only supports manual redirect handling here.');
      const type = url.searchParams.get('type');
      return Response.json({ Status: 0, Answer: type === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [] }, {
        headers: { 'Content-Type': 'application/dns-json' },
      });
    }
    const body = jpegBytes();
    return new Response(body.buffer as ArrayBuffer, { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(body.byteLength) } });
  }) as typeof fetch;
}

describe('remote import image security', () => {
  it('rejects local, private, link-local, and documentation destinations', () => {
    expect(() => parseRemoteImageUrl('http://localhost/image.jpg', 'recipes.test')).toThrow();
    expect(() => parseRemoteImageUrl('https://127.0.0.1/image.jpg', 'recipes.test')).toThrow();
    expect(isForbiddenIpAddress('10.0.0.1')).toBe(true);
    expect(isForbiddenIpAddress('169.254.169.254')).toBe(true);
    expect(isForbiddenIpAddress('192.168.1.1')).toBe(true);
    expect(isForbiddenIpAddress('::1')).toBe(true);
    expect(isForbiddenIpAddress('2001:db8::1')).toBe(true);
    expect(isForbiddenIpAddress('93.184.216.34')).toBe(false);
    expect(isForbiddenIpAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('downloads the query-string image URL that exposed the edge redirect-mode bug', async () => {
    const response = await importImageRoute(
      jsonRequest('https://www.einfachbacken.de/sites/einfachbacken.de/files/styles/1_1/public/2021-08/cookies_2.jpg?h=4521fff0&itok=8rCicB6j'),
      { PRODUCTION_HOSTNAME: 'recipes.test' },
      crypto.randomUUID(),
      publicImageFetcher(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpegBytes());
  });

  it('rejects a private address returned by DNS before fetching the image', async () => {
    let targetFetched = false;
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
      if (url.hostname !== 'cloudflare-dns.com') targetFetched = true;
      const type = url.searchParams.get('type');
      return Response.json({ Status: 0, Answer: type === 'A' ? [{ type: 1, data: '10.0.0.8' }] : [] }, {
        headers: { 'Content-Type': 'application/dns-json' },
      });
    }) as typeof fetch;
    const response = await importImageRoute(
      jsonRequest('https://private.example.org/image.jpg'),
      { PRODUCTION_HOSTNAME: 'recipes.test' },
      crypto.randomUUID(),
      fetcher,
    );
    expect(response.status).toBe(422);
    expect(targetFetched).toBe(false);
  });

  it('revalidates redirect destinations and rejects a redirect to localhost', async () => {
    let targetFetches = 0;
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
      if (url.hostname === 'cloudflare-dns.com') {
        const type = url.searchParams.get('type');
        return Response.json({ Status: 0, Answer: type === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [] }, {
          headers: { 'Content-Type': 'application/dns-json' },
        });
      }
      targetFetches += 1;
      return new Response(null, { status: 302, headers: { Location: 'http://localhost/private.jpg' } });
    }) as typeof fetch;
    const response = await importImageRoute(
      jsonRequest('https://images.example.org/recipe.jpg'),
      { PRODUCTION_HOSTNAME: 'recipes.test' },
      crypto.randomUUID(),
      fetcher,
    );
    expect(response.status).toBe(422);
    expect(targetFetches).toBe(1);
  });

  it('detects supported image signatures instead of trusting headers alone', () => {
    expect(detectedImageContentType(jpegBytes().buffer as ArrayBuffer)).toBe('image/jpeg');
    expect(detectedImageContentType(new TextEncoder().encode('<svg></svg>').buffer as ArrayBuffer)).toBeNull();
  });
});
