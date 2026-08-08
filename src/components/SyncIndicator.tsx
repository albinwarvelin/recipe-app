import type { SyncSnapshot } from '../sync/coordinator';

const labels: Record<SyncSnapshot['phase'], string> = {
  idle: 'Up to date', syncing: 'Syncing', offline: 'Offline', 'auth-required': 'Sign in to sync', error: 'Sync issue',
};

export function SyncIndicator({ state }: { state: SyncSnapshot }) {
  const pending = state.pending > 0 ? ` · ${state.pending} pending` : '';
  return <span className={`sync-indicator sync-${state.phase}`} role="status" aria-live="polite"><span aria-hidden="true" />{labels[state.phase]}{pending}</span>;
}
