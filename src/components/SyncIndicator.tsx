import type { SyncSnapshot } from '../sync/coordinator';

const labels: Record<SyncSnapshot['phase'], string> = {
  idle: 'Uppdaterad', syncing: 'Synkroniserar', offline: 'Offline', 'auth-required': 'Logga in för att synka', error: 'Synkfel',
};

export function SyncIndicator({ state }: { state: SyncSnapshot }) {
  const pending = state.pending > 0 ? ` · ${state.pending} väntar` : '';
  return <span className={`sync-indicator sync-${state.phase}${state.pending > 0 ? ' has-pending' : ''}`} role="status" aria-live="polite">
    <span className="sync-indicator-dot" aria-hidden="true" />
    <span className="sync-indicator-label">{labels[state.phase]}{pending}</span>
  </span>;
}
