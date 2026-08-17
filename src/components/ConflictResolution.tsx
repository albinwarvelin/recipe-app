import { useMemo, useState } from 'react';
import type { RecipeDraft } from '../api/recipes';
import type { LocalIngredientCatalog, LocalTag, RecipeConflict } from '../data/db';
import { draftFromLocalRecipe, type CoverChange } from '../data/local-recipes';
import { AppToolbar } from './AppToolbar';
import { ArrowLeftIcon, CheckIcon } from './Icons';
import { RecipeEditor } from './RecipeEditor';

type Source = 'local' | 'server';
type ScalarField = 'title' | 'description' | 'servings' | 'prep_minutes' | 'cook_minutes' | 'source_type' | 'source_name' | 'source_url' | 'notes' | 'favorite';
type SectionField = 'ingredients' | 'instructions' | 'tags' | 'image_key';
export type ConflictChoices = Record<ScalarField | SectionField, Source>;

const scalarFields: Array<{ key: ScalarField; label: string }> = [
  { key: 'title', label: 'Receptnamn' },
  { key: 'description', label: 'Beskrivning' },
  { key: 'servings', label: 'Portioner' },
  { key: 'prep_minutes', label: 'Förberedelsetid' },
  { key: 'cook_minutes', label: 'Tillagningstid' },
  { key: 'source_type', label: 'Källtyp' },
  { key: 'source_name', label: 'Källnamn' },
  { key: 'source_url', label: 'Källadress' },
  { key: 'notes', label: 'Anteckningar' },
  { key: 'favorite', label: 'Favorit' },
];

const sectionFields: Array<{ key: SectionField; label: string }> = [
  { key: 'ingredients', label: 'Ingredienser' },
  { key: 'instructions', label: 'Instruktioner' },
  { key: 'tags', label: 'Taggar' },
  { key: 'image_key', label: 'Omslagsbild' },
];

export function defaultConflictChoices(): ConflictChoices {
  return Object.fromEntries([...scalarFields, ...sectionFields].map(({ key }) => [key, 'local'])) as ConflictChoices;
}

export function mergeConflictDraft(conflict: RecipeConflict, choices: ConflictChoices): RecipeDraft {
  const local = draftFromLocalRecipe(conflict.local_recipe);
  const server = conflict.server_recipe;
  if (!server) return local;
  const merged = structuredClone(local);
  for (const { key } of scalarFields) {
    if (choices[key] === 'server') Object.assign(merged, { [key]: structuredClone(server[key]) });
  }
  for (const { key } of sectionFields) {
    if (choices[key] === 'server') Object.assign(merged, { [key]: structuredClone(server[key]) });
  }
  return merged;
}

function displayScalar(value: RecipeDraft[ScalarField]): string {
  if (value === null || value === '') return 'Inte angivet';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nej';
  if (value === 'personal') return 'Personligt';
  if (value === 'online') return 'Online';
  if (value === 'ai') return 'AI';
  return String(value);
}

function displaySection(draft: RecipeDraft, key: SectionField): string {
  if (key === 'ingredients') return `${draft.ingredients.length} ingredienser`;
  if (key === 'instructions') return `${draft.instructions.length} steg`;
  if (key === 'tags') return draft.tags.length ? draft.tags.map((tag) => tag.name).join(', ') : 'Inga taggar';
  return draft.image_key ? 'Omslagsbild vald' : 'Ingen omslagsbild';
}

function ChoiceButtons({ value, onChange }: { value: Source; onChange: (source: Source) => void }) {
  return <div className="conflict-choice-buttons" aria-label="Välj version">
    <button type="button" className={value === 'local' ? 'active' : ''} aria-pressed={value === 'local'} onClick={() => onChange('local')}>Den här enheten</button>
    <button type="button" className={value === 'server' ? 'active' : ''} aria-pressed={value === 'server'} onClick={() => onChange('server')}>Servern</button>
  </div>;
}

export function ConflictResolution({ conflict, catalog, tags, onCancel, onSave }: {
  conflict: RecipeConflict;
  catalog: LocalIngredientCatalog[];
  tags: LocalTag[];
  onCancel: () => void;
  onSave: (draft: RecipeDraft, cover: CoverChange) => Promise<void>;
}) {
  const [choices, setChoices] = useState(defaultConflictChoices);
  const [editing, setEditing] = useState(false);
  const local = useMemo(() => draftFromLocalRecipe(conflict.local_recipe), [conflict]);
  const server = conflict.server_recipe;
  const merged = useMemo(() => mergeConflictDraft(conflict, choices), [choices, conflict]);

  if (!server) {
    return <RecipeEditor recipe={conflict.local_recipe} initialDraft={local} title="Återskapa recept" catalog={catalog} tags={tags} allowCoverChanges={false} onCancel={onCancel} onSave={onSave} />;
  }
  if (editing) {
    return <RecipeEditor recipe={conflict.local_recipe} initialDraft={merged} title="Redigera sammanslaget recept" catalog={catalog} tags={tags} allowCoverChanges={false} onCancel={() => setEditing(false)} onSave={onSave} />;
  }

  const choose = (key: ScalarField | SectionField, source: Source) => setChoices((current) => ({ ...current, [key]: source }));
  return <div className="conflict-page">
    <AppToolbar title="Granska konflikt" leading={<button className="nav-button" type="button" onClick={onCancel}><ArrowLeftIcon /><span>Tillbaka</span></button>} />
    <main className="conflict-review page-container">
      <header><p className="text-eyebrow">Synkkonflikt</p><h1 className="heading-1">Välj vad som ska behållas</h1><p className="text-body-muted">Ingenting skrivs över förrän du har granskat och sparat det sammanslagna receptet.</p></header>
      <section className="conflict-field-list" aria-label="Fält att slå samman">
        {scalarFields.map(({ key, label }) => <article className="conflict-field" key={key}>
          <div className="conflict-field-heading"><h2 className="heading-3">{label}</h2><ChoiceButtons value={choices[key]} onChange={(source) => choose(key, source)} /></div>
          <div className="conflict-values"><div className={choices[key] === 'local' ? 'selected' : ''}><strong>Den här enheten</strong><span>{displayScalar(local[key])}</span></div><div className={choices[key] === 'server' ? 'selected' : ''}><strong>Servern</strong><span>{displayScalar(server[key])}</span></div></div>
        </article>)}
        {sectionFields.map(({ key, label }) => <article className="conflict-field" key={key}>
          <div className="conflict-field-heading"><h2 className="heading-3">{label}</h2><ChoiceButtons value={choices[key]} onChange={(source) => choose(key, source)} /></div>
          <div className="conflict-values"><div className={choices[key] === 'local' ? 'selected' : ''}><strong>Den här enheten</strong><span>{displaySection(local, key)}</span></div><div className={choices[key] === 'server' ? 'selected' : ''}><strong>Servern</strong><span>{displaySection(server, key)}</span></div></div>
        </article>)}
      </section>
      <button className="primary-button conflict-continue" type="button" onClick={() => setEditing(true)}><CheckIcon />Granska sammanslaget utkast</button>
    </main>
  </div>;
}
