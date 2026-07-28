import { Link, Route, Routes } from 'react-router-dom';
import { HomePage } from '../pages/HomePage';

export function App() {
  return (
    <div className="app-shell">
      <header className="navigation-bar">
        <div>
          <p className="eyebrow">Private kitchen</p>
          <h1>Recipes</h1>
        </div>
        <span className="sync-indicator" aria-label="Sync status: local scaffold">Local</span>
      </header>
      <main className="page-content">
        <Routes>
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
      <nav className="bottom-tab-bar" aria-label="Primary navigation">
        <Link to="/" className="tab-link" aria-current="page">Recipes</Link>
        <span className="tab-link tab-link-muted">Settings</span>
      </nav>
    </div>
  );
}
