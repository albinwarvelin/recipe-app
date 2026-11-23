import { useMemo, useState } from 'react';
import type { LocalRecipe } from '../data/db';
import { normalizeSearchValue } from '../data/normalize';
import { SearchIcon } from './Icons';
import { ModalSheet } from './ModalSheet';

export function RecipePickerSheet({ recipes, dateLabel, onSelect, onClose }: { recipes: LocalRecipe[]; dateLabel: string; onSelect: (recipe: LocalRecipe) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const term = normalizeSearchValue(query);
    return recipes.filter((recipe) => !term || normalizeSearchValue(recipe.title).includes(term)).sort((left, right) => left.title.localeCompare(right.title, 'sv'));
  }, [query, recipes]);
  return <ModalSheet title={`Lägg till ${dateLabel}`} onClose={onClose}>
    <label className="search-field sheet-search"><SearchIcon /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök recept" aria-label="Sök recept att planera" /></label>
    <div className="recipe-picker-list">{matches.length ? matches.map((recipe) => <button type="button" key={recipe.id} onClick={() => onSelect(recipe)}><span>{recipe.title}</span><small>{recipe.servings ? `${recipe.servings} port.` : '1× recept'}</small></button>) : <p className="filter-empty">Inget recept matchar.</p>}</div>
  </ModalSheet>;
}

