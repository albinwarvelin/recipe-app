import { useEffect, useRef } from 'react';
import type { RecipeConflict } from '../data/db';

export function ConflictDialog({ conflict, onKeepLocal, onKeepServer, onMerge }: { conflict: RecipeConflict; onKeepLocal: () => void; onKeepServer: () => void; onMerge: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !element) return;
      const focusable = [...element.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trapFocus);
    return () => { document.removeEventListener('keydown', trapFocus); previous?.focus(); };
  }, []);
  return <div className="dialog-backdrop" role="presentation"><section ref={dialog} className="conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title" aria-describedby="conflict-description">
    <p className="text-eyebrow">Synkkonflikt</p><h2 className="heading-2" id="conflict-title">”{conflict.local_recipe.title}” ändrades på två ställen</h2>
    <p className="text-body-muted" id="conflict-description">Den lokala kopian och serverkopian har båda ändrats. Ingenting har skrivits över.</p>
    <div className="conflict-comparison"><div><strong>Den här enheten</strong><span>{new Date(conflict.local_recipe.updated_at).toLocaleString('sv-SE')}</span></div><div><strong>Servern</strong><span>{conflict.server_recipe ? new Date(conflict.server_recipe.updated_at).toLocaleString('sv-SE') : 'Borttaget på servern'}</span></div></div>
    <div className="dialog-actions"><button className="primary-button" type="button" onClick={onMerge}>{conflict.server_recipe ? 'Granska och slå samman' : 'Granska och återskapa'}</button><button className="secondary-button" type="button" onClick={onKeepLocal}>{conflict.server_recipe ? 'Behåll den här enheten' : 'Återskapa direkt'}</button><button className="text-button" type="button" onClick={onKeepServer}>{conflict.server_recipe ? 'Använd serverkopian' : 'Godkänn borttagningen'}</button></div>
  </section></div>;
}
