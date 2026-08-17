/// <reference lib="webworker" />

const sw = globalThis as unknown as ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string | null }> };

const CACHE_NAME = 'recipe-app-shell-v1';
// Workbox replaces this exact expression with the versioned build manifest.
// @ts-expect-error __WB_MANIFEST is injected by vite-plugin-pwa at build time.
const manifestUrls: string[] = self.__WB_MANIFEST.map((entry: { url: string }) => entry.url).filter((url: string) => !url.endsWith('sw.js'));

function isAppAsset(response: Response): boolean {
  return response.ok && response.headers.get('X-Recipe-App-Asset') === '1';
}

async function fetchAndCache(cache: Cache, url: string, cacheKey = url): Promise<void> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'reload' });
  if (isAppAsset(response)) await cache.put(cacheKey, response);
}

async function cacheAppShell(): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(manifestUrls.map((url) => fetchAndCache(cache, url)));
  await fetchAndCache(cache, '/', '/');
}

sw.addEventListener('install', () => sw.skipWaiting());
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));
sw.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'CACHE_APP_SHELL') event.waitUntil(cacheAppShell());
});

sw.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (isAppAsset(response)) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/', response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match('/');
        return cached ?? new Response('Recept är offline och appskalet har ännu inte sparats.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (isAppAsset(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
