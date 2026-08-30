import { useMemo, useState, type KeyboardEvent } from 'react';
import type { Tag } from '../api/recipes';
import type { LocalTag } from '../data/db';
import { normalizeDisplayName, normalizeIdentityValue, normalizeSearchValue } from '../data/normalize';
import { CloseIcon } from './Icons';
import { recipeLimits } from '../../shared/recipe-validation';

export function TagPicker({ value, suggestions, onChange }: { value: Tag[]; suggestions: LocalTag[]; onChange: (tags: Tag[]) => void }) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const selected = new Set(value.map((tag) => normalizeIdentityValue(tag.name)));
  const matches = useMemo(() => matchingTags(suggestions, input, selected, 8), [input, suggestions, value]);

  function add(tag?: Tag) {
    if (value.length >= recipeLimits.tags) return;
    const name = tag?.name ?? normalizeDisplayName(input);
    const normalized = normalizeIdentityValue(name);
    if (!normalized || selected.has(normalized)) { setInput(''); return; }
    const known = suggestions.find((item) => normalizeIdentityValue(item.name) === normalized);
    onChange([...value, { id: known?.id ?? tag?.id, name: known?.name ?? name }]);
    setInput('');
    setOpen(false);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === 'Enter' || event.key === ',') && input.trim()) { event.preventDefault(); add(matches[0]); }
    if (event.key === 'Backspace' && !input && value.length) onChange(value.slice(0, -1));
    if (event.key === 'Escape') setOpen(false);
  }

  return <div className="tag-picker">
    <div className="tag-input-shell">
      {value.map((tag, index) => <span className="tag-chip" key={tag.id ?? `${tag.name}-${index}`}>{tag.name}<button type="button" aria-label={`Ta bort taggen ${tag.name}`} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><CloseIcon size={14} /></button></span>)}
      <input role="combobox" aria-label="Lägg till tagg" aria-expanded={open && matches.length > 0} aria-controls="tag-picker-options" autoComplete="off" maxLength={recipeLimits.tagName} disabled={value.length >= recipeLimits.tags} value={input} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={(event) => { setInput(event.target.value); setOpen(true); }} onKeyDown={keyDown} placeholder={value.length >= recipeLimits.tags ? 'Max antal taggar' : value.length ? 'Lägg till…' : 'Skriv eller välj en tagg…'} />
    </div>
    {open && matches.length > 0 && <div className="suggestion-list tag-suggestions" id="tag-picker-options" role="listbox">{matches.map((tag) => <button key={tag.id} type="button" role="option" onPointerDown={(event) => event.preventDefault()} onClick={() => add(tag)}>{tag.name}</button>)}</div>}
    <p className="field-help">Tryck Enter för att lägga till en ny tagg.</p>
  </div>;
}

export function matchingTags(suggestions: LocalTag[], input: string, excluded: ReadonlySet<string> = new Set(), limit = 8): LocalTag[] {
  const query = normalizeSearchValue(input);
  return suggestions
    .filter((tag) => !excluded.has(normalizeIdentityValue(tag.name)) && (!query || normalizeSearchValue(tag.name).includes(query)))
    .sort((left, right) => {
      const leftName = normalizeSearchValue(left.name);
      const rightName = normalizeSearchValue(right.name);
      return Number(Boolean(query) && !leftName.startsWith(query)) - Number(Boolean(query) && !rightName.startsWith(query))
        || left.name.localeCompare(right.name, 'sv');
    })
    .slice(0, limit);
}
