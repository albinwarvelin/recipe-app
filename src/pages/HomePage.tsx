interface HomePageProps {
  email: string;
}

export function HomePage({ email }: HomePageProps) {
  return (
    <div className="app-shell">
      <header className="navigation-bar">
        <div>
          <p className="eyebrow">Private kitchen</p>
          <h1>Recipes</h1>
        </div>
        <span className="sync-indicator" aria-label="Authentication status: signed in">Secure</span>
      </header>
      <main className="page-content">
        <section className="empty-state" aria-labelledby="welcome-heading">
          <div className="empty-state-icon" aria-hidden="true">✦</div>
          <h2 id="welcome-heading">Welcome home.</h2>
          <p>You are signed in as {email}. Your recipe library will appear here.</p>
          <a className="secondary-button" href="/cdn-cgi/access/logout">
            Sign out
          </a>
        </section>
      </main>
    </div>
  );
}
