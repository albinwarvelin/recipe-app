import { useEffect, useState } from 'react';
import { clearLocalData, db } from '../data/db';
import { requestPersistentStorage, syncNow, type SyncSnapshot } from '../sync/coordinator';

type Persistence = 'checking' | 'granted' | 'best-effort' | 'unavailable';

export function SettingsView({ email, sync, onBack, onCleared }: { email?: string; sync: SyncSnapshot; onBack: () => void; onCleared: () => void }) {
  const [persistence, setPersistence] = useState<Persistence>('checking');
  useEffect(() => { void requestPersistentStorage().then(setPersistence); }, []);
  async function clear() {
    const pending = await db.outbox.count();
    const warning = pending ? `There are ${pending} unsynchronized operation(s). Clearing will permanently remove them from this device.` : 'This removes every locally cached recipe and image. Synced data can be downloaded again.';
    if (!window.confirm(`${warning}\n\nClear local data?`)) return;
    await clearLocalData(); onCleared();
  }
  const persistenceLabel = persistence === 'checking' ? 'Checking…' : persistence === 'granted' ? 'Persistent storage granted' : persistence === 'best-effort' ? 'Best-effort storage' : 'Storage API unavailable';
  return <div className="settings-page"><header className="detail-toolbar"><button className="toolbar-button" type="button" onClick={onBack}>‹ Recipes</button><strong>Settings</strong><span /></header><main className="settings-content">
    <section><p className="eyebrow">Account</p><div className="settings-card"><div><strong>{email ?? 'Offline library'}</strong><span>{email ? 'Protected by Cloudflare Access' : 'Sign in when online to synchronize'}</span></div><a className="settings-action" href="/cdn-cgi/access/logout">Sign out</a></div></section>
    <section><p className="eyebrow">Synchronization</p><div className="settings-card settings-stack"><div><strong>{sync.pending ? `${sync.pending} pending change${sync.pending === 1 ? '' : 's'}` : 'Everything is synchronized'}</strong><span>{sync.lastSync ? `Last completed ${new Date(sync.lastSync).toLocaleString()}` : 'No completed sync on this device yet'}</span></div><button className="settings-action" type="button" onClick={() => void syncNow()}>Sync now</button></div></section>
    <section><p className="eyebrow">Offline storage</p><div className="settings-card"><div><strong>{persistenceLabel}</strong><span>{persistence === 'granted' ? 'The browser has agreed to protect app data from automatic cleanup.' : 'The browser may remove cached data if device storage becomes constrained.'}</span></div></div></section>
    <section><p className="eyebrow">This device</p><div className="settings-card danger-setting"><div><strong>Clear local data</strong><span>Synced recipes remain safely stored on the server.</span></div><button className="settings-action danger-text" type="button" onClick={() => void clear()}>Clear</button></div></section>
  </main></div>;
}
