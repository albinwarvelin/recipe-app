export function SignedOutPage() {
  return <main className="auth-page" aria-labelledby="sign-in-heading"><section className="auth-card">
    <div className="empty-state-icon" aria-hidden="true">✦</div><p className="text-eyebrow">Privat kök</p><h1 className="heading-1" id="sign-in-heading">Logga in till Recept</h1>
    <p className="text-body-muted">Cloudflare Access verifierar din identitet innan privata data hämtas.</p>
    <button className="primary-button" type="button" onClick={() => window.location.assign('/')}>Fortsätt till Cloudflare Access</button>
  </section></main>;
}
