import type { SyncSnapshot } from '../sync/coordinator';

const labels: Record<SyncSnapshot['phase'], string> = {
  idle: 'Uppdaterad', syncing: 'Synkroniserar', offline: 'Offline', 'auth-required': 'Logga in för att synka', error: 'Synkfel',
};

export function SyncIndicator({ state }: { state: SyncSnapshot }) {
  const pending = state.pending > 0 ? ` · ${state.pending} väntar` : '';
  return <span className={`sync-indicator sync-${state.phase}`} role="status" aria-live="polite"><span aria-hidden="true" />{labels[state.phase]}{pending}</span>;
}
