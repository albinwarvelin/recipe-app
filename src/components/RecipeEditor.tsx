import { useEffect, useState, type FormEvent } from 'react';
import type { Ingredient, Instruction, RecipeDraft } from '../api/recipes';
import type { LocalRecipe } from '../data/db';
import { draftFromLocalRecipe, type CoverChange } from '../data/local-recipes';
import { useImageUrl } from '../hooks/useLocalData';
import { prepareCoverImage } from '../images/process';

export const emptyRecipeDraft: RecipeDraft = {
  title: '', description: '', servings: null, prep_minutes: null, cook_minutes: null,
  source_type: 'personal', source_name: null, source_url: null, image_key: null,
  notes: '', favorite: false, ingredients: [], instructions: [], tags: [],
};

function optionalNumber(value: string): number | null { return value === '' ? null : Number(value); }

export function RecipeEditor({ recipe, title, onCancel, onSave }: {
  recipe: LocalRecipe | null;
  title?: string;
  onCancel: () => void;
  onSave: (draft: RecipeDraft, cover: CoverChange) => Promise<void>;
}) {
  const [draft, setDraft] = useState<RecipeDraft>(() => recipe ? draftFromLocalRecipe(recipe) : structuredClone(emptyRecipeDraft));
  const [cover, setCover] = useState<CoverChange>({ kind: 'keep' });
  const [preview, setPreview] = useState<string | null>(null);
  const existingImage = useImageUrl(recipe?.image_key);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

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
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'The photo could not be prepared.'); }
    finally { setProcessing(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(null);
    try { await onSave(draft, cover); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'The recipe could not be saved locally.'); setSaving(false); }
  }

  const coverUrl = cover.kind === 'remove' ? null : preview ?? existingImage;
  return <div className="editor-page">
    <header className="editor-toolbar"><button className="toolbar-button" type="button" onClick={onCancel}>Cancel</button><strong>{title ?? (recipe ? 'Edit recipe' : 'New recipe')}</strong><button className="toolbar-button" form="recipe-form" disabled={saving || processing}>{saving ? 'Saving…' : 'Save'}</button></header>
    <form id="recipe-form" className="editor-form" onSubmit={(event) => void submit(event)}>
      <section className="cover-editor">
        <div className={`cover-preview ${coverUrl ? 'has-image' : ''}`} style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}><span>{processing ? 'Preparing photo…' : coverUrl ? '' : 'Add a cover photo'}</span></div>
        <div className="cover-actions"><label className="secondary-button file-button">{coverUrl ? 'Change photo' : 'Choose photo'}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" onChange={(event) => void chooseImage(event.target.files?.[0])} /></label>{coverUrl && <button className="text-button danger-text" type="button" onClick={() => { setCover({ kind: 'remove' }); setPreview(null); }}>Remove</button>}</div>
        <p className="field-help">JPEG, PNG, WebP, HEIC, or HEIF · converted privately on this device</p>
      </section>

      <section className="form-card primary-fields">
        <label>Recipe name<input required autoFocus maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Sunday tomato pasta" /></label>
        <label>Description<textarea rows={3} maxLength={5000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="What makes this recipe special?" /></label>
        <div className="field-grid"><label>Servings<input inputMode="numeric" type="number" min="1" value={draft.servings ?? ''} onChange={(event) => setDraft({ ...draft, servings: optionalNumber(event.target.value) })} /></label><label>Prep minutes<input inputMode="numeric" type="number" min="0" value={draft.prep_minutes ?? ''} onChange={(event) => setDraft({ ...draft, prep_minutes: optionalNumber(event.target.value) })} /></label><label>Cook minutes<input inputMode="numeric" type="number" min="0" value={draft.cook_minutes ?? ''} onChange={(event) => setDraft({ ...draft, cook_minutes: optionalNumber(event.target.value) })} /></label></div>
        <label>Tags <span className="label-note">comma separated</span><input value={draft.tags.map((tag) => tag.name).join(', ')} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(',').map((name) => name.trim()).filter(Boolean).map((name) => ({ name })) })} placeholder="Dinner, Vegetarian" /></label>
      </section>

      <section className="form-card"><div className="form-section-heading"><h2>Ingredients</h2><button className="text-button" type="button" onClick={() => setDraft({ ...draft, ingredients: [...draft.ingredients, { amount: null, unit: null, name: '', group_name: null }] })}>+ Add</button></div>
        <div className="editor-list">{draft.ingredients.map((ingredient, index) => <div className="ingredient-editor-row" key={ingredient.id ?? index}><input aria-label={`Ingredient ${index + 1} amount`} placeholder="1½" value={ingredient.amount ?? ''} onChange={(event) => updateIngredient(index, { amount: event.target.value || null })} /><input aria-label={`Ingredient ${index + 1} unit`} placeholder="cups" value={ingredient.unit ?? ''} onChange={(event) => updateIngredient(index, { unit: event.target.value || null })} /><input required aria-label={`Ingredient ${index + 1} name`} placeholder="Ingredient" value={ingredient.name} onChange={(event) => updateIngredient(index, { name: event.target.value })} /><button className="remove-row" type="button" aria-label={`Remove ingredient ${index + 1}`} onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, itemIndex) => itemIndex !== index) })}>×</button></div>)}</div>
      </section>

      <section className="form-card"><div className="form-section-heading"><h2>Method</h2><button className="text-button" type="button" onClick={() => setDraft({ ...draft, instructions: [...draft.instructions, { text: '', timer_seconds: null }] })}>+ Add step</button></div>
        <div className="editor-list">{draft.instructions.map((instruction, index) => <div className="instruction-editor-row" key={instruction.id ?? index}><span>{index + 1}</span><div><textarea required rows={3} aria-label={`Instruction ${index + 1}`} value={instruction.text} onChange={(event) => updateInstruction(index, { text: event.target.value })} placeholder="Describe this step" /><label className="inline-field">Timer <input type="number" min="0" aria-label={`Instruction ${index + 1} timer minutes`} value={instruction.timer_seconds ? Math.round(instruction.timer_seconds / 60) : ''} onChange={(event) => updateInstruction(index, { timer_seconds: event.target.value ? Number(event.target.value) * 60 : null })} /> min</label></div><button className="remove-row" type="button" aria-label={`Remove instruction ${index + 1}`} onClick={() => setDraft({ ...draft, instructions: draft.instructions.filter((_, itemIndex) => itemIndex !== index) })}>×</button></div>)}</div>
      </section>

      <section className="form-card"><label>Notes<textarea rows={5} maxLength={10000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Substitutions, reminders, or serving ideas" /></label><label className="switch-row"><span><strong>Favorite</strong><small>Show this recipe among favorites</small></span><input type="checkbox" checked={draft.favorite} onChange={(event) => setDraft({ ...draft, favorite: event.target.checked })} /></label></section>
      {message && <p className="error-message" role="alert">{message}</p>}
      <button className="primary-button editor-save" disabled={saving || processing}>{saving ? 'Saving locally…' : 'Save recipe'}</button>
    </form>
  </div>;
}
