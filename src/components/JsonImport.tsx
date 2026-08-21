import { useState, type FormEvent } from 'react';
import type { RecipeDraft } from '../api/recipes';
import type { LocalIngredientCatalog, LocalTag } from '../data/db';
import type { CoverChange } from '../data/local-recipes';
import { prepareImportedCoverImage } from '../images/import';
import {
  MAX_RECIPE_IMPORT_CHARACTERS,
  parseRecipeImport,
  RECIPE_IMPORT_AI_INSTRUCTION,
} from '../../shared/recipe-import';
import { AppToolbar } from './AppToolbar';
import { CheckIcon, CloseIcon } from './Icons';
import { RecipeEditor } from './RecipeEditor';

type CopyState = 'idle' | 'copied' | 'error';

export function JsonImport({ catalog, tags, onCancel, onSave }: {
  catalog: LocalIngredientCatalog[];
  tags: LocalTag[];
  onCancel: () => void;
  onSave: (draft: RecipeDraft, cover: CoverChange) => Promise<void>;
}) {
  const [jsonInput, setJsonInput] = useState('');
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [initialCover, setInitialCover] = useState<CoverChange>({ kind: 'keep' });
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [importing, setImporting] = useState(false);

  async function copyInstruction() {
    setCopyState('idle');
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(RECIPE_IMPORT_AI_INSTRUCTION);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setImporting(true);
    try {
      const imported = parseRecipeImport(jsonInput);
      let cover: CoverChange = { kind: 'keep' };
      let notice: string | null = null;
      if (imported.imageUrl) {
        try {
          cover = { kind: 'replace', image: await prepareImportedCoverImage(imported.imageUrl) };
        } catch {
          notice = 'Omslagsbilden från image_url kunde inte hämtas eller läsas. Receptet importerades utan bild; du kan välja en bild manuellt.';
        }
      }
      setInitialCover(cover);
      setEditorMessage(notice);
      setDraft(imported.draft);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'JSON-receptet kunde inte importeras.');
    } finally {
      setImporting(false);
    }
  }

  if (draft) {
    return <RecipeEditor
      recipe={null}
      initialDraft={draft}
      initialCover={initialCover}
      initialMessage={editorMessage}
      title="Granska importerat recept"
      catalog={catalog}
      tags={tags}
      onCancel={() => { setDraft(null); setInitialCover({ kind: 'keep' }); setEditorMessage(null); }}
      onSave={onSave}
    />;
  }

  return <div className="import-page">
    <AppToolbar title="Importera JSON" leading={<button className="nav-button" type="button" onClick={onCancel}><CloseIcon /><span>Avbryt</span></button>} />
    <main className="import-content page-container">
      <header className="import-intro">
        <p className="text-eyebrow">AI eller webbrecept</p>
        <h1 className="heading-1">Importera ett strukturerat recept</h1>
        <p className="text-body-muted">Kopiera instruktionen till valfri AI tillsammans med receptet. Klistra sedan in AI:ns JSON-svar här.</p>
      </header>

      <section className="form-card import-card">
        <div className="form-section-heading">
          <div><h2 className="heading-2">1. Skapa JSON-svaret</h2><p>Instruktionen innehåller formatet och reglerna som AI:n ska följa.</p></div>
          <button className="secondary-button" type="button" onClick={() => void copyInstruction()}>{copyState === 'copied' ? <CheckIcon /> : null}{copyState === 'copied' ? 'Kopierad' : 'Kopiera AI-instruktion'}</button>
        </div>
        {copyState === 'error' && <p className="error-message" role="alert">Instruktionen kunde inte kopieras automatiskt. Visa den nedan och kopiera texten manuellt.</p>}
        <details className="import-instruction-details">
          <summary>Visa AI-instruktionen och JSON-mallen</summary>
          <textarea aria-label="AI-instruktion och JSON-mall" readOnly rows={18} value={RECIPE_IMPORT_AI_INSTRUCTION} />
        </details>
      </section>

      <form className="form-card import-card" onSubmit={(event) => void submit(event)}>
        <div className="form-section-heading"><div><h2 className="heading-2">2. Klistra in JSON</h2><p>Om JSON-svaret innehåller image_url hämtas och förbereds bilden automatiskt innan redigeraren öppnas.</p></div></div>
        <label className="form-field">
          <span className="field-label">JSON-recept</span>
          <textarea required autoFocus rows={16} maxLength={MAX_RECIPE_IMPORT_CHARACTERS} spellCheck={false} value={jsonInput} onChange={(event) => setJsonInput(event.target.value)} placeholder={'{\n  "format": "recipe-app",\n  "version": 1,\n  "recipe": { ... }\n}'} />
          <span className="field-help">Endast JSON enligt receptmallen accepteras. Ett omgivande JSON-kodblock tas bort automatiskt.</span>
        </label>
        {message && <p className="error-message" role="alert">{message}</p>}
        <button className="primary-button import-submit" type="submit" disabled={importing}>{importing ? 'Förbereder import…' : 'Öppna i redigeraren'}</button>
      </form>
    </main>
  </div>;
}
