import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDownIcon, SearchIcon } from './Icons';

export function FilterDropdown({ id, label, count, open, onToggle, search, onSearch, children }: {
  id: string;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  search: string;
  onSearch: (value: string) => void;
  children: ReactNode;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [maxHeight, setMaxHeight] = useState(620);

  useLayoutEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const resize = () => {
      const height = viewport?.height ?? window.innerHeight;
      const bottom = Math.min((viewport?.offsetTop ?? 0) + height, document.querySelector('.bottom-tab-bar')?.getBoundingClientRect().top ?? Infinity);
      const top = panel.current?.getBoundingClientRect().top ?? 0;
      setMaxHeight(Math.max(160, Math.min(620, height - 24, bottom - top - 12)));
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
    };
  }, [open]);

  return <div className={`filter-control ${id}-filter`} data-popover-root onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { onToggle(); trigger.current?.focus(); }
  }}>
    <button ref={trigger} className="filter-trigger catalog-filter-trigger" type="button" aria-expanded={open} aria-controls={`${id}-filter-options`} onClick={onToggle} onKeyDown={(event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!open) onToggle();
        requestAnimationFrame(() => input.current?.focus());
      }
    }}><span>{label}{count > 0 && ` (${count})`}</span><ChevronDownIcon className={open ? 'is-rotated' : ''} /></button>
    {open && <div ref={panel} className={`filter-popover catalog-filter-popover ${id}-filter-popover`} id={`${id}-filter-options`} style={{ maxHeight }}>
      <label className="search-field filter-search"><SearchIcon size={18} /><input ref={input} type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder={`Sök ${label.toLocaleLowerCase('sv')}`} aria-label={`Sök ${label.toLocaleLowerCase('sv')}`} autoComplete="off" /></label>
      <div className="filter-options">{children}</div>
    </div>}
  </div>;
}
