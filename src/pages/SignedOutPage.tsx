export function SignedOutPage() {
  return (
    <main className="auth-page" aria-labelledby="sign-in-heading">
      <section className="auth-card">
        <div className="empty-state-icon" aria-hidden="true">✦</div>
        <p className="eyebrow">Private kitchen</p>
        <h1 id="sign-in-heading">Sign in to Recipes</h1>
        <p>Cloudflare Access verifies your identity before any private data is loaded.</p>
        <button className="primary-button" type="button" onClick={() => window.location.assign('/')}>
          Continue to Cloudflare Access
        </button>
      </section>
    </main>
  );
}
