export interface Session {
  authenticated: true;
  identity: {
    email: string;
  };
}

export type SessionResult =
  | { status: 'authenticated'; session: Session }
  | { status: 'signed-out' }
  | { status: 'error' };

export async function getSession(signal?: AbortSignal): Promise<SessionResult> {
  try {
    const response = await fetch('/api/session', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal,
    });

    if (response.status === 401 || response.status === 403) return { status: 'signed-out' };
    if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json')) {
      return { status: 'error' };
    }

    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'authenticated' in body &&
      body.authenticated === true &&
      'identity' in body &&
      typeof body.identity === 'object' &&
      body.identity !== null &&
      'email' in body.identity &&
      typeof body.identity.email === 'string'
    ) {
      return { status: 'authenticated', session: body as Session };
    }
    return { status: 'error' };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return { status: 'error' };
  }
}
