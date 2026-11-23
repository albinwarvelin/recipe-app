import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { Link } from 'react-router';
import { db } from '../data/db';
import { saveLocalRecipe, draftFromLocalRecipe } from '../data/local-recipes';
import { syncProblems, retrySyncProblem } from '../sync/problems';
import { syncNow, type SyncSnapshot } from '../sync/coordinator';
import { fieldPath } from '../../shared/validation-issues';
import { ModalSheet } from './ModalSheet';
import { repairMealPlanSyncDate, removeMealPlanSyncProblem } from '../data/local-planning';
import { dateKeySchema } from '../../shared/planning';

function MealPlanRecovery({ operationId, currentDate, disabled, onAction }: {
  operationId: string; currentDate: string; disabled: boolean; onAction: (action: () => Promise<void>) => void;
}) {
  const [date, setDate] = useState(dateKeySchema.safeParse(currentDate).success ? currentDate : '');
  return <div className="plan-sync-recovery">
    <p>Datum i ändringen: <code>{currentDate || '(tomt)'}</code></p>
    <label className="form-field"><span>Välj rätt datum</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <div className="sync-problem-actions">
      <button className="secondary-button" type="button" disabled={disabled || !dateKeySchema.safeParse(date).success} onClick={() => onAction(() => repairMealPlanSyncDate(operationId, date))}>Spara datum och synka</button>
      <button className="secondary-button danger-text" type="button" disabled={disabled} onClick={() => {
        if (window.confirm('Ta bort den här planerade måltiden? Själva receptet behålls.')) onAction(() => removeMealPlanSyncProblem(operationId));
      }}>Ta bort planeringen</button>
    </div><p className="text-body-small">Det är bara den här planerade måltiden som ändras. Receptet behålls.</p>
  </div>;
}

export function SyncProblems({ state, onClose }: { state: SyncSnapshot; onClose: () => void }) {
  const [problems, setProblems] = useState<Awaited<ReturnType<typeof syncProblems>>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const subscription = liveQuery(syncProblems).subscribe({ next: setProblems, error: () => setMessage('Synkdetaljerna kunde inte läsas från enheten.') });
    return () => subscription.unsubscribe();
  }, []);
  async function act(action: () => Promise<void>) {
    setBusy(true); setMessage(null);
    try { await action(); await syncNow(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Åtgärden kunde inte slutföras.'); }
    finally { setBusy(false); }
  }
  async function withoutImage(recipeId: string) {
    const recipe = await db.recipes.get(recipeId);
    if (!recipe) throw new Error('Receptet kunde inte hittas på enheten.');
    await saveLocalRecipe(recipe, draftFromLocalRecipe(recipe), { kind: 'remove' });
  }
  return <ModalSheet title="Synkronisering" onClose={onClose}>
    <div className="sync-problems">
      <p>{state.pending ? `${state.pending} ändringar väntar. Sparade recept finns på den här enheten även när synkronisering misslyckas.` : 'Inga ändringar väntar.'}</p>
      {message && <p className="error-message" role="alert">{message}</p>}
      {state.failure && <details><summary>Detaljer om senaste synkfelet</summary><p>{state.message}</p><p>{state.failure.code}{state.failure.status ? ` · HTTP ${state.failure.status}` : ''}</p>{state.failure.requestId && <p>Begäran: {state.failure.requestId}</p>}{state.failure.issues?.map((issue, index) => <p key={index}>{fieldPath(issue.path)}: {issue.message}</p>)}</details>}
      {!problems.length && <><p role="status">{state.message ?? 'Inga fel att åtgärda.'}</p><button type="button" className="secondary-button" disabled={busy} onClick={() => void act(async () => {})}>Synkronisera nu</button></>}
      {problems.map((problem) => <section className="sync-problem" key={problem.operation_id}>
        <h3>{problem.title}</h3><p className="text-body-small">{problem.action}</p><p>{problem.explanation}</p>
        {problem.last_error_issues?.length ? <ul>{problem.last_error_issues.map((issue, index) => <li key={index}><strong>{fieldPath(issue.path)}:</strong> {issue.message}</li>)}</ul> : null}
        {problem.scope === 'planning' && problem.type === 'meal-plan-put' && problem.failure_kind === 'permanent' && <MealPlanRecovery operationId={problem.operation_id} currentDate={'planned_date' in problem.payload ? problem.payload.planned_date : ''} disabled={busy} onAction={(action) => void act(action)} />}
        <details><summary>Tekniska detaljer</summary><p>Kod: {problem.last_error_code ?? 'Okänd'}{problem.last_error_status ? ` · HTTP ${problem.last_error_status}` : ''}</p>{problem.last_request_id && <p>Begäran: {problem.last_request_id}</p>}<p>Försök: {problem.attempt_count}</p>{problem.next_attempt_at && <p>Nästa försök: {new Date(problem.next_attempt_at).toLocaleString('sv-SE')}</p>}</details>
        <div className="sync-problem-actions">
          {problem.status === 'failed' && <button className="secondary-button" type="button" disabled={busy} onClick={() => void act(() => retrySyncProblem(problem.scope, problem.operation_id))}>Försök igen</button>}
          {problem.recipeId && <Link className="secondary-button" onClick={onClose} to={`/recipes/${problem.recipeId}/${problem.status === 'conflict' ? 'conflict' : 'edit'}`}>{problem.status === 'conflict' ? 'Granska konflikt' : 'Redigera recept / byt bild'}</Link>}
          {problem.scope === 'planning' && <Link className="secondary-button" onClick={onClose} to={problem.type === 'meal-plan-put' ? '/plan' : '/shopping'}>{problem.type === 'meal-plan-put' ? 'Visa veckoplaneringen' : 'Öppna inköpslistan'}</Link>}
          {problem.recipeId && (problem.type === 'image-upload' || problem.type === 'recipe-cover' || problem.last_error_code === 'IMAGE_NOT_FOUND') && <button className="secondary-button" type="button" disabled={busy} onClick={() => void act(() => withoutImage(problem.recipeId!))}>Fortsätt utan bild</button>}
        </div>
      </section>)}
    </div>
  </ModalSheet>;
}
