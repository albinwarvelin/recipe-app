export function HomePage() {
  return (
    <section className="empty-state" aria-labelledby="welcome-heading">
      <div className="empty-state-icon" aria-hidden="true">✦</div>
      <h2 id="welcome-heading">Your recipes, wherever you are.</h2>
      <p>The secure local-first recipe library is ready for its first feature milestone.</p>
      <button type="button" className="primary-button" disabled>
        Add recipe — coming next
      </button>
    </section>
  );
}
