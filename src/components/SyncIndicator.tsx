import type { SyncSnapshot } from '../sync/coordinator';
import { useState } from 'react';
import { SyncProblems } from './SyncProblems';

const labels: Record<SyncSnapshot['phase'], string> = {
  idle: 'Uppdaterad', syncing: 'Synkroniserar', offline: 'Offline', 'auth-required': 'Logga in för att synka', error: 'Synkfel',
};

export function SyncIndicator({ state, onClick }: { state: SyncSnapshot; onClick?: () => void }) {
  const [showDetails, setShowDetails] = useState(false);
  const pending = state.pending > 0 ? ` · ${state.pending} väntar` : '';
  return <><button type="button" onClick={onClick ?? (() => setShowDetails(true))} className={`sync-indicator sync-${state.phase}${state.pending > 0 ? ' has-pending' : ''}`} aria-label="Visa synkstatus och åtgärder">
    <span className="sync-indicator-dot" aria-hidden="true" />
    <span className="sync-indicator-label" role="status" aria-live="polite">{labels[state.phase]}{pending}</span>
  </button>{showDetails && <SyncProblems state={state} onClose={() => setShowDetails(false)} />}</>;
}
