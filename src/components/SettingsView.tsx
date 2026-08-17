import { useEffect, useState } from 'react';
import { clearLocalData, db } from '../data/db';
import { requestPersistentStorage, syncNow, type SyncSnapshot } from '../sync/coordinator';
import { AppToolbar } from './AppToolbar';
import { ArrowLeftIcon } from './Icons';

type Persistence = 'checking' | 'granted' | 'best-effort' | 'unavailable';

export function SettingsView({ email, sync, onBack, onCleared }: { email?: string; sync: SyncSnapshot; onBack: () => void; onCleared: () => void }) {
  const [persistence, setPersistence] = useState<Persistence>('checking');
  useEffect(() => { void requestPersistentStorage().then(setPersistence); }, []);
  async function clear() {
    const pending = await db.outbox.count();
    const warning = pending ? `${pending} ändringar har inte synkroniserats. En rensning tar bort dem permanent från den här enheten.` : 'Alla lokalt sparade recept och bilder tas bort. Synkroniserade data kan hämtas igen.';
    if (!window.confirm(`${warning}\n\nRensa lokala data?`)) return;
    await clearLocalData(); onCleared();
  }
  const persistenceLabel = persistence === 'checking' ? 'Kontrollerar…' : persistence === 'granted' ? 'Beständig lagring beviljad' : persistence === 'best-effort' ? 'Lagring efter bästa förmåga' : 'Lagrings-API saknas';
  return <div className="settings-page"><AppToolbar title="Inställningar" leading={<button className="nav-button" type="button" onClick={onBack}><ArrowLeftIcon /><span>Tillbaka</span></button>} /><main className="settings-content">
    <section><p className="text-eyebrow">Konto</p><div className="settings-card"><div><strong className="text-label">{email ?? 'Offlinebibliotek'}</strong><span className="text-body-small">{email ? 'Skyddat av Cloudflare Access' : 'Logga in online för att synkronisera'}</span></div><a className="settings-action" href="/cdn-cgi/access/logout">Logga ut</a></div></section>
    <section><p className="text-eyebrow">Synkronisering</p><div className="settings-card settings-stack"><div><strong className="text-label">{sync.pending ? `${sync.pending} ändringar väntar` : 'Allt är synkroniserat'}</strong><span className="text-body-small">{sync.lastSync ? `Senast klart ${new Date(sync.lastSync).toLocaleString('sv-SE')}` : 'Ingen slutförd synkronisering på enheten ännu'}</span></div><button className="settings-action" type="button" onClick={() => void syncNow()}>Synkronisera nu</button></div></section>
    <section><p className="text-eyebrow">Offlinelagring</p><div className="settings-card"><div><strong className="text-label">{persistenceLabel}</strong><span className="text-body-small">{persistence === 'granted' ? 'Webbläsaren skyddar appens data från automatisk rensning.' : 'Webbläsaren kan rensa cachade data om lagringsutrymmet blir litet.'}</span></div></div></section>
    <section><p className="text-eyebrow">Den här enheten</p><div className="settings-card danger-setting"><div><strong className="text-label">Rensa lokala data</strong><span className="text-body-small">Synkroniserade recept finns kvar på servern.</span></div><button className="settings-action danger-text" type="button" onClick={() => void clear()}>Rensa</button></div></section>
  </main></div>;
}
