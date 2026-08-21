const blockedHostSuffixes = ['.localhost', '.local', '.internal', '.home', '.lan', '.test', '.invalid', '.example', '.onion', '.workers.dev'];
const blockedHostnames = new Set(['localhost', 'metadata', 'instance-data', 'metadata.google.internal', 'workers.dev']);

export class UnsafeRemoteUrlError extends Error {
  constructor(message = 'The remote URL is not allowed.') {
    super(message);
    this.name = 'UnsafeRemoteUrlError';
  }
}

function ipv4Bytes(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => /^\d{1,3}$/.test(part) ? Number(part) : Number.NaN);
  return bytes.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? bytes : null;
}

function forbiddenIpv4(bytes: number[]): boolean {
  const [a, b, c] = bytes;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 88 && c === 99)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function ipv6Words(value: string): number[] | null {
  const address = value.toLowerCase().split('%')[0];
  if (!address.includes(':')) return null;
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const parseHalf = (half: string): number[] | null => {
    if (!half) return [];
    const result: number[] = [];
    for (const part of half.split(':')) {
      const ipv4 = ipv4Bytes(part);
      if (ipv4) {
        result.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      } else if (/^[0-9a-f]{1,4}$/.test(part)) {
        result.push(Number.parseInt(part, 16));
      } else {
        return null;
      }
    }
    return result;
  };
  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? '');
  if (!left || !right) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  const missing = 8 - left.length - right.length;
  return missing >= 1 ? [...left, ...Array<number>(missing).fill(0), ...right] : null;
}

export function isForbiddenIpAddress(value: string): boolean {
  const normalized = value.replace(/^\[|\]$/g, '');
  const ipv4 = ipv4Bytes(normalized);
  if (ipv4) return forbiddenIpv4(ipv4);
  const words = ipv6Words(normalized);
  if (!words) return true;
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return forbiddenIpv4([words[6] >> 8, words[6] & 255, words[7] >> 8, words[7] & 255]);
  }
  const first = words[0];
  const globalUnicast = first >= 0x2000 && first <= 0x3fff;
  const documentation = first === 0x2001 && words[1] === 0x0db8;
  return !globalUnicast || documentation;
}

export function parseRemoteImageUrl(value: string, ownHostname: string): URL {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new UnsafeRemoteUrlError(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new UnsafeRemoteUrlError();
  if ((url.protocol === 'https:' && url.port && url.port !== '443') || (url.protocol === 'http:' && url.port && url.port !== '80')) {
    throw new UnsafeRemoteUrlError();
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!hostname || hostname === ownHostname.toLowerCase() || blockedHostnames.has(hostname) || blockedHostSuffixes.some((suffix) => hostname.endsWith(suffix))) {
    throw new UnsafeRemoteUrlError();
  }
  if (ipv4Bytes(hostname) || hostname.includes(':')) throw new UnsafeRemoteUrlError('Direct IP image URLs are not allowed.');
  return url;
}

interface DnsJsonResponse {
  Status?: number;
  Answer?: Array<{ type?: number; data?: string }>;
}

async function dnsAddresses(hostname: string, type: 'A' | 'AAAA', fetcher: typeof fetch): Promise<string[]> {
  const endpoint = new URL('https://cloudflare-dns.com/dns-query');
  endpoint.searchParams.set('name', hostname);
  endpoint.searchParams.set('type', type);
  const response = await fetcher(endpoint, {
    headers: { Accept: 'application/dns-json' },
    // Workers subrequests only implement "follow" and "manual" at the edge.
    // Manual handling also ensures the trusted DoH endpoint cannot redirect.
    redirect: 'manual',
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok || response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/dns-json') {
    throw new UnsafeRemoteUrlError('The image host could not be verified.');
  }
  const result = await response.json() as DnsJsonResponse;
  if (result.Status !== 0) return [];
  const recordType = type === 'A' ? 1 : 28;
  return (result.Answer ?? []).filter((answer) => answer.type === recordType && typeof answer.data === 'string').map((answer) => answer.data as string);
}

export async function requirePublicRemoteImageUrl(value: string, ownHostname: string, fetcher: typeof fetch = fetch): Promise<URL> {
  const url = parseRemoteImageUrl(value, ownHostname);
  let addresses: string[];
  try {
    const results = await Promise.all([dnsAddresses(url.hostname, 'A', fetcher), dnsAddresses(url.hostname, 'AAAA', fetcher)]);
    addresses = results.flat();
  } catch (cause) {
    if (cause instanceof UnsafeRemoteUrlError) throw cause;
    throw new UnsafeRemoteUrlError('The image host could not be verified.');
  }
  if (addresses.length === 0 || addresses.some(isForbiddenIpAddress)) throw new UnsafeRemoteUrlError();
  return url;
}
