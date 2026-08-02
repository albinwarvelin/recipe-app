import { useEffect, useState } from 'react';
import { getSession, type Session } from '../api/session';
import { HomePage } from '../pages/HomePage';
import { SignedOutPage } from '../pages/SignedOutPage';

type AuthState =
  | { status: 'checking' }
  | { status: 'authenticated'; session: Session }
  | { status: 'signed-out' }
  | { status: 'error' };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'checking' });

  useEffect(() => {
    const controller = new AbortController();
    void getSession(controller.signal).then((result) => {
      if (result.status === 'authenticated') {
        setAuth({ status: 'authenticated', session: result.session });
      } else {
        setAuth({ status: result.status });
      }
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setAuth({ status: 'error' });
    });
    return () => controller.abort();
  }, []);

  if (auth.status === 'checking') {
    return (
      <main className="auth-page" aria-live="polite">
        <p className="auth-status">Checking your secure session…</p>
      </main>
    );
  }

  if (auth.status === 'signed-out') return <SignedOutPage />;

  if (auth.status === 'error') {
    return (
      <main className="auth-page" aria-labelledby="session-error-heading">
        <section className="auth-card">
          <p className="eyebrow">Private kitchen</p>
          <h1 id="session-error-heading">Session check unavailable</h1>
          <p>Check your connection and try again. No private data has been loaded.</p>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        </section>
      </main>
    );
  }

  return <HomePage email={auth.session.identity.email} />;
}
