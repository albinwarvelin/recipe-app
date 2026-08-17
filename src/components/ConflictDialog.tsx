import type { RecipeConflict } from '../data/db';

export function ConflictDialog({ conflict, onKeepLocal, onKeepServer, onMerge }: { conflict: RecipeConflict; onKeepLocal: () => void; onKeepServer: () => void; onMerge: () => void }) {
  return <div className="dialog-backdrop" role="presentation"><section className="conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
    <p className="text-eyebrow">Synkkonflikt</p><h2 className="heading-2" id="conflict-title">”{conflict.local_recipe.title}” ändrades på två ställen</h2>
    <p className="text-body-muted">Den lokala kopian och serverkopian har båda ändrats. Ingenting har skrivits över.</p>
    <div className="conflict-comparison"><div><strong>Den här enheten</strong><span>{new Date(conflict.local_recipe.updated_at).toLocaleString('sv-SE')}</span></div><div><strong>Servern</strong><span>{conflict.server_recipe ? new Date(conflict.server_recipe.updated_at).toLocaleString('sv-SE') : 'Borttaget på servern'}</span></div></div>
    <div className="dialog-actions"><button className="primary-button" type="button" onClick={onMerge} disabled={!conflict.server_recipe}>Slå samman manuellt</button><button className="secondary-button" type="button" onClick={onKeepLocal}>{conflict.server_recipe ? 'Behåll den här enheten' : 'Återskapa som nytt recept'}</button><button className="text-button" type="button" onClick={onKeepServer}>Använd serverkopian</button></div>
  </section></div>;
}
