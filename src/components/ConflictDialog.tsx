import type { RecipeConflict } from '../data/db';

export function ConflictDialog({ conflict, onKeepLocal, onKeepServer, onMerge }: { conflict: RecipeConflict; onKeepLocal: () => void; onKeepServer: () => void; onMerge: () => void }) {
  return <div className="dialog-backdrop" role="presentation"><section className="conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
    <p className="eyebrow">Sync conflict</p><h2 id="conflict-title">“{conflict.local_recipe.title}” changed in two places</h2>
    <p>Your offline copy and the server copy were both edited. Nothing has been overwritten.</p>
    <div className="conflict-comparison"><div><strong>This device</strong><span>{new Date(conflict.local_recipe.updated_at).toLocaleString()}</span></div><div><strong>Server</strong><span>{conflict.server_recipe ? new Date(conflict.server_recipe.updated_at).toLocaleString() : 'Deleted on server'}</span></div></div>
    <div className="dialog-actions"><button className="primary-button" type="button" onClick={onMerge} disabled={!conflict.server_recipe}>Merge manually</button><button className="secondary-button" type="button" onClick={onKeepLocal}>{conflict.server_recipe ? 'Keep this device' : 'Restore as new recipe'}</button><button className="text-button" type="button" onClick={onKeepServer}>Use server copy</button></div>
  </section></div>;
}
