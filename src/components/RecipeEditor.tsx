import { useEffect, useState, type FormEvent } from 'react';
import type { Ingredient, Instruction, RecipeDraft } from '../api/recipes';
import type { LocalIngredientCatalog, LocalRecipe, LocalTag } from '../data/db';
import { draftFromLocalRecipe, type CoverChange } from '../data/local-recipes';
import { useImageUrl } from '../hooks/useLocalData';
import { prepareCoverImage } from '../images/process';
import { AppToolbar } from './AppToolbar';
import { CheckIcon, CloseIcon, ImageIcon, PlusIcon, TrashIcon } from './Icons';
import { IngredientCombobox } from './IngredientCombobox';
import { TagPicker } from './TagPicker';

export const emptyRecipeDraft: RecipeDraft = {
  title: '', description: '', servings: null, prep_minutes: null, cook_minutes: null,
  source_type: 'personal', source_name: null, source_url: null, image_key: null,
  notes: '', favorite: false, ingredients: [], instructions: [], tags: [],
};

function optionalNumber(value: string): number | null { return value === '' ? null : Number(value); }

export function RecipeEditor({ recipe, initialDraft, title, catalog, tags, allowCoverChanges = true, onCancel, onSave }: {
  recipe: LocalRecipe | null;
  initialDraft?: RecipeDraft;
  title?: string;
  catalog: LocalIngredientCatalog[];
  tags: LocalTag[];
  allowCoverChanges?: boolean;
  onCancel: () => void;
  onSave: (draft: RecipeDraft, cover: CoverChange) => Promise<void>;
}) {
  const [draft, setDraft] = useState<RecipeDraft>(() => initialDraft ? structuredClone(initialDraft) : recipe ? draftFromLocalRecipe(recipe) : structuredClone(emptyRecipeDraft));
  const [cover, setCover] = useState<CoverChange>({ kind: 'keep' });
  const [preview, setPreview] = useState<string | null>(null);
  const existingImage = useImageUrl(draft.image_key);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  function updateIngredient(index: number, patch: Partial<Ingredient>) {
    setDraft((current) => ({ ...current, ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  }
  function updateInstruction(index: number, patch: Partial<Instruction>) {
    setDraft((current) => ({ ...current, instructions: current.instructions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  }
  async function chooseImage(file: File | undefined) {
    if (!file) return;
    setProcessing(true); setMessage(null);
    try {
      const image = await prepareCoverImage(file);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(image.thumbnail));
      setCover({ kind: 'replace', image });
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Bilden kunde inte förberedas.'); }
    finally { setProcessing(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(null);
    try { await onSave(draft, cover); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Receptet kunde inte sparas lokalt.'); setSaving(false); }
  }

  const coverUrl = cover.kind === 'remove' ? null : preview ?? existingImage;
  const toolbarTitle = title ?? (recipe ? 'Redigera recept' : 'Nytt recept');
  const pageTitle = title ?? (recipe ? `Redigera ${recipe.title}` : 'Skapa ett nytt recept');
  const addIngredient = () => setDraft({ ...draft, ingredients: [...draft.ingredients, { catalog_id: null, amount: null, unit: null, name: '', group_name: null }] });
  const addInstruction = () => setDraft({ ...draft, instructions: [...draft.instructions, { text: '', timer_seconds: null }] });

  return <div className="editor-page">
    <AppToolbar
      title={toolbarTitle}
      leading={<button className="nav-button" type="button" onClick={onCancel}><CloseIcon /><span>Avbryt</span></button>}
      trailing={<button className="nav-button nav-button-primary" form="recipe-form" disabled={saving || processing}><CheckIcon /><span>{saving ? 'Sparar…' : 'Spara'}</span></button>}
    />
    <form id="recipe-form" className="editor-layout page-container" onSubmit={(event) => void submit(event)}>
      <aside className="cover-editor">
        <section className="cover-card">
          <div className="cover-card-heading">
            <p className="text-eyebrow">Omslagsbild</p>
            <h2 className="heading-3">Ge receptet en tydlig framsida</h2>
          </div>
          <div className={`cover-preview ${coverUrl ? 'has-image' : ''}`} style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}>
            {!coverUrl && <span className="cover-placeholder"><ImageIcon /><strong>{processing ? 'Förbereder bild…' : 'Lägg till en omslagsbild'}</strong><small>Bilden visas på receptkortet</small></span>}
            {coverUrl && processing && <span className="cover-processing">Förbereder bild…</span>}
          </div>
          {allowCoverChanges && <div className="cover-actions">
            <label className="secondary-button file-button"><ImageIcon size={18} />{coverUrl ? 'Byt bild' : 'Välj bild'}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" onChange={(event) => void chooseImage(event.target.files?.[0])} /></label>
            {coverUrl && <button className="button-quiet button-danger" type="button" onClick={() => { if (preview) URL.revokeObjectURL(preview); setCover({ kind: 'remove' }); setPreview(null); }}><TrashIcon />Ta bort</button>}
          </div>}
          <p className="field-help">{allowCoverChanges ? 'JPEG, PNG, WebP, HEIC eller HEIF. Bilden omvandlas privat på enheten.' : 'Omslagsbilden valdes i konfliktgranskningen.'}</p>
        </section>
      </aside>

      <div className="editor-fields">
        <header className="editor-intro">
          <p className="text-eyebrow">{recipe ? 'Redigering' : 'Nytt recept'}</p>
          <h1 className="heading-1">{pageTitle}</h1>
          <p className="text-body-muted">Börja med grunderna och bygg sedan receptet med ingredienser och tydliga steg.</p>
        </header>

        <section className="form-card editor-section primary-fields">
          <div className="form-section-heading">
            <div><h2 className="heading-2">Grunduppgifter</h2><p className="text-body-small">Namn, tidsåtgång och taggar hjälper dig hitta receptet igen.</p></div>
          </div>
          <label className="form-field"><span className="field-label">Receptnamn</span><input required autoFocus maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Till exempel laxpasta med citron" /></label>
          <label className="form-field"><span className="field-label">Beskrivning</span><textarea rows={3} maxLength={5000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="En kort beskrivning av receptet" /></label>
          <div className="field-grid">
            <label className="form-field"><span className="field-label">Portioner</span><input inputMode="numeric" type="number" min="1" value={draft.servings ?? ''} onChange={(event) => setDraft({ ...draft, servings: optionalNumber(event.target.value) })} placeholder="4" /></label>
            <label className="form-field"><span className="field-label">Förberedelse</span><span className="input-with-suffix"><input inputMode="numeric" type="number" min="0" value={draft.prep_minutes ?? ''} onChange={(event) => setDraft({ ...draft, prep_minutes: optionalNumber(event.target.value) })} /><span>min</span></span></label>
            <label className="form-field"><span className="field-label">Tillagning</span><span className="input-with-suffix"><input inputMode="numeric" type="number" min="0" value={draft.cook_minutes ?? ''} onChange={(event) => setDraft({ ...draft, cook_minutes: optionalNumber(event.target.value) })} /><span>min</span></span></label>
          </div>
          <div className="form-field"><span className="field-label">Taggar</span><TagPicker value={draft.tags} suggestions={tags} onChange={(next) => setDraft({ ...draft, tags: next })} /></div>
        </section>

        <section className="form-card editor-section">
          <div className="form-section-heading"><div><h2 className="heading-2">Ingredienser</h2><p className="text-body-small">Sök i katalogen eller skriv ett nytt namn. Mängd och enhet är valfria.</p></div><button className="section-action" type="button" onClick={addIngredient}><PlusIcon size={18} />Lägg till</button></div>
          {draft.ingredients.length > 0 ? <>
            <div className="ingredient-column-labels" aria-hidden="true"><span>Mängd</span><span>Enhet</span><span>Ingrediens</span><span /></div>
            <div className="editor-list">{draft.ingredients.map((ingredient, index) => <div className="ingredient-editor-row" key={ingredient.id ?? index}><input aria-label={`Ingrediens ${index + 1}, mängd`} placeholder="2" value={ingredient.amount ?? ''} onChange={(event) => updateIngredient(index, { amount: event.target.value || null })} /><input aria-label={`Ingrediens ${index + 1}, enhet`} list="swedish-units" placeholder="dl" value={ingredient.unit ?? ''} onChange={(event) => updateIngredient(index, { unit: event.target.value || null })} /><IngredientCombobox value={ingredient} catalog={catalog} index={index} onChange={(patch) => updateIngredient(index, patch)} /><button className="remove-row" type="button" aria-label={`Ta bort ingrediens ${index + 1}`} onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, itemIndex) => itemIndex !== index) })}><CloseIcon /></button></div>)}</div>
          </> : <button className="editor-empty-action" type="button" onClick={addIngredient}><PlusIcon /><span><strong>Lägg till första ingrediensen</strong><small>Mängd, svensk enhet och ingrediensnamn</small></span></button>}
          <datalist id="swedish-units">{['krm', 'tsk', 'msk', 'ml', 'cl', 'dl', 'l', 'g', 'kg', 'st'].map((unit) => <option key={unit} value={unit} />)}</datalist>
        </section>

        <section className="form-card editor-section">
          <div className="form-section-heading"><div><h2 className="heading-2">Gör så här</h2><p className="text-body-small">Dela upp tillagningen i korta steg som är lätta att följa.</p></div><button className="section-action" type="button" onClick={addInstruction}><PlusIcon size={18} />Lägg till steg</button></div>
          {draft.instructions.length > 0 ? <div className="editor-list instruction-editor-list">{draft.instructions.map((instruction, index) => <div className="instruction-editor-row" key={instruction.id ?? index}><span>{index + 1}</span><div><textarea required rows={3} aria-label={`Steg ${index + 1}`} value={instruction.text} onChange={(event) => updateInstruction(index, { text: event.target.value })} placeholder="Beskriv momentet" /><label className="inline-field"><span>Timer</span><input type="number" min="0" aria-label={`Steg ${index + 1}, timer i minuter`} value={instruction.timer_seconds ? Math.round(instruction.timer_seconds / 60) : ''} onChange={(event) => updateInstruction(index, { timer_seconds: event.target.value ? Number(event.target.value) * 60 : null })} /><span>min</span></label></div><button className="remove-row" type="button" aria-label={`Ta bort steg ${index + 1}`} onClick={() => setDraft({ ...draft, instructions: draft.instructions.filter((_, itemIndex) => itemIndex !== index) })}><CloseIcon /></button></div>)}</div> : <button className="editor-empty-action" type="button" onClick={addInstruction}><PlusIcon /><span><strong>Lägg till första steget</strong><small>Beskriv vad som ska göras i rätt ordning</small></span></button>}
        </section>

        <section className="form-card editor-section">
          <div className="form-section-heading"><div><h2 className="heading-2">Egna anteckningar</h2><p className="text-body-small">Spara anpassningar eller sådant du vill komma ihåg till nästa gång.</p></div></div>
          <label className="form-field"><span className="field-label">Anteckningar</span><textarea rows={5} maxLength={10000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Byten, påminnelser eller serveringsförslag" /></label>
          <label className="switch-row"><span><strong className="text-label">Favorit</strong><small>Visa receptet bland dina favoriter.</small></span><input type="checkbox" checked={draft.favorite} onChange={(event) => setDraft({ ...draft, favorite: event.target.checked })} /></label>
        </section>
        {message && <p className="error-message" role="alert">{message}</p>}
        <button className="primary-button editor-save" disabled={saving || processing}><CheckIcon />{saving ? 'Sparar lokalt…' : 'Spara recept'}</button>
      </div>
    </form>
  </div>;
}
