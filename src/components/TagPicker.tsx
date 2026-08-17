import { useMemo, useState, type KeyboardEvent } from 'react';
import type { Tag } from '../api/recipes';
import type { LocalTag } from '../data/db';
import { normalizeDisplayName, normalizeIdentityValue, normalizeSearchValue } from '../data/normalize';
import { CloseIcon } from './Icons';
import { recipeLimits } from '../../shared/recipe-validation';

export function TagPicker({ value, suggestions, onChange }: { value: Tag[]; suggestions: LocalTag[]; onChange: (tags: Tag[]) => void }) {
  const [input, setInput] = useState('');
  const query = normalizeSearchValue(input);
  const selected = new Set(value.map((tag) => normalizeIdentityValue(tag.name)));
  const matches = useMemo(() => query ? suggestions
    .filter((tag) => !selected.has(normalizeIdentityValue(tag.name)) && normalizeSearchValue(tag.name).includes(query))
    .sort((left, right) => Number(!normalizeSearchValue(left.name).startsWith(query)) - Number(!normalizeSearchValue(right.name).startsWith(query)) || left.name.localeCompare(right.name, 'sv'))
    .slice(0, 8) : [], [query, suggestions, value]);

  function add(tag?: Tag) {
    if (value.length >= recipeLimits.tags) return;
    const name = tag?.name ?? normalizeDisplayName(input);
    const normalized = normalizeIdentityValue(name);
    if (!normalized || selected.has(normalized)) { setInput(''); return; }
    const known = suggestions.find((item) => normalizeIdentityValue(item.name) === normalized);
    onChange([...value, { id: known?.id ?? tag?.id, name: known?.name ?? name }]);
    setInput('');
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(matches[0]); }
    if (event.key === 'Backspace' && !input && value.length) onChange(value.slice(0, -1));
  }

  return <div className="tag-picker">
    <div className="tag-input-shell">
      {value.map((tag, index) => <span className="tag-chip" key={tag.id ?? `${tag.name}-${index}`}>{tag.name}<button type="button" aria-label={`Ta bort taggen ${tag.name}`} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><CloseIcon size={14} /></button></span>)}
      <input aria-label="Lägg till tagg" maxLength={recipeLimits.tagName} disabled={value.length >= recipeLimits.tags} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={keyDown} placeholder={value.length >= recipeLimits.tags ? 'Max antal taggar' : value.length ? 'Lägg till…' : 'Skriv en tagg…'} />
    </div>
    {matches.length > 0 && <div className="suggestion-list tag-suggestions" role="listbox">{matches.map((tag) => <button key={tag.id} type="button" role="option" onClick={() => add(tag)}>{tag.name}</button>)}</div>}
    <p className="field-help">Tryck Enter för att lägga till en ny tagg.</p>
  </div>;
}
