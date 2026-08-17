import { useMemo, useState } from 'react';
import type { Ingredient } from '../api/recipes';
import type { LocalIngredientCatalog } from '../data/db';
import { normalizeSearchValue } from '../data/normalize';

export function ingredientLabel(entry: LocalIngredientCatalog | undefined): string {
  if (!entry) return '';
  return entry.names.find((name) => name.locale === 'sv' && name.preferred)?.display_name
    ?? entry.names.find((name) => name.locale === 'sv')?.display_name
    ?? entry.names.find((name) => name.preferred)?.display_name
    ?? entry.names[0]?.display_name
    ?? '';
}

export function IngredientCombobox({ value, catalog, index, onChange }: {
  value: Ingredient;
  catalog: LocalIngredientCatalog[];
  index: number;
  onChange: (patch: Partial<Ingredient>) => void;
}) {
  const [open, setOpen] = useState(false);
  const query = normalizeSearchValue(value.name);
  const matches = useMemo(() => {
    if (!query) return [];
    return catalog.map((entry) => {
      const names = entry.names.map((name) => name.normalized_name);
      const prefix = names.some((name) => name.startsWith(query));
      const contains = names.some((name) => name.includes(query));
      return { entry, score: prefix ? 0 : contains ? 1 : 2 };
    }).filter(({ score }) => score < 2)
      .sort((left, right) => left.score - right.score || ingredientLabel(left.entry).localeCompare(ingredientLabel(right.entry), 'sv'))
      .slice(0, 8);
  }, [catalog, query]);

  return <div className="combobox">
    <input
      required
      role="combobox"
      aria-label={`Ingrediens ${index + 1}, namn`}
      aria-expanded={open && matches.length > 0}
      aria-controls={`ingredient-options-${index}`}
      autoComplete="off"
      placeholder="Ingrediens"
      value={value.name}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onChange={(event) => { onChange({ name: event.target.value, catalog_id: null }); setOpen(true); }}
    />
    {open && matches.length > 0 && <div className="suggestion-list" id={`ingredient-options-${index}`} role="listbox">
      {matches.map(({ entry }) => {
        const label = ingredientLabel(entry);
        const secondary = entry.names.find((name) => name.locale === 'en')?.display_name;
        return <button key={entry.id} type="button" role="option" aria-selected={value.catalog_id === entry.id}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => { onChange({ name: label, catalog_id: entry.id }); setOpen(false); }}>
          <span>{label}</span>{secondary && normalizeSearchValue(secondary) !== normalizeSearchValue(label) && <small>{secondary}</small>}
        </button>;
      })}
    </div>}
  </div>;
}
