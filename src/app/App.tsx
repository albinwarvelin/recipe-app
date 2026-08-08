import { useEffect, useState } from 'react';
import { getSession, type Session } from '../api/session';
import { HomePage } from '../pages/HomePage';

type AuthState = { status: 'checking' | 'signed-out' | 'error' } | { status: 'authenticated'; session: Session };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'checking' });
  useEffect(() => {
    const controller = new AbortController();
    void getSession(controller.signal).then((result) => {
      setAuth(result.status === 'authenticated' ? { status: 'authenticated', session: result.session } : { status: result.status });
      if (result.status === 'authenticated' && 'serviceWorker' in navigator) {
        const cacheShell = () => void navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage({ type: 'CACHE_APP_SHELL' }));
        cacheShell();
        navigator.serviceWorker.addEventListener('controllerchange', cacheShell, { once: true });
      }
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setAuth({ status: 'error' });
    });
    return () => controller.abort();
  }, []);

  return <HomePage email={auth.status === 'authenticated' ? auth.session.identity.email : undefined} />;
}
