import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import type { LocalIngredientCatalog, LocalManualShoppingItem, LocalMealPlanEntry, LocalRecipe, LocalShoppingCheckState } from '../data/db';
import { addManualShoppingItem, removeManualShoppingItem, setShoppingCheckState, updateManualShoppingItem } from '../data/local-planning';
import { CheckIcon, PlusIcon, TrashIcon } from '../components/Icons';
import { TopLevelPageHeader } from '../components/TopLevelPageHeader';
import { WeekNavigator } from '../components/WeekNavigator';
import { addDays, validWeekStart } from '../planning/week';
import { buildShoppingList, type ShoppingListItem } from '../planning/shopping-list';
import { syncNow } from '../sync/coordinator';

function GeneratedItem({ item, checked, onToggle }: { item: ShoppingListItem; checked: boolean; onToggle: () => void }) {
  return <div className={checked ? 'shopping-row is-checked' : 'shopping-row'}>
    <button className="shopping-check" type="button" aria-label={`${checked ? 'Avmarkera' : 'Markera'} ${item.name}`} aria-pressed={checked} onClick={onToggle}>{checked && <CheckIcon />}</button>
    <div className="shopping-item-copy"><strong>{item.name}</strong><span>{[item.amount, item.unit].filter(Boolean).join(' ') || 'Mängd saknas'}</span></div>
    <div className="shopping-item-sources" aria-label={`Från ${item.sources.join(', ')}`}>{item.sources.map((source) => <small key={source}>{source}</small>)}</div>
  </div>;
}

function ManualItemRow({ item }: { item: LocalManualShoppingItem }) {
  const toggle = () => void updateManualShoppingItem(item, { checked: !item.checked }).then(() => syncNow());
  return <div className={item.checked ? 'shopping-row manual-shopping-row is-checked' : 'shopping-row manual-shopping-row'}>
    <button className="shopping-check" type="button" aria-label={`${item.checked ? 'Avmarkera' : 'Markera'} ${item.name}`} aria-pressed={item.checked} onClick={toggle}>{item.checked && <CheckIcon />}</button>
    <div className="shopping-item-copy"><strong>{item.name}</strong>{(item.amount || item.unit) && <span>{[item.amount, item.unit].filter(Boolean).join(' ')}</span>}</div>
    <button className="shopping-delete" type="button" aria-label={`Ta bort ${item.name}`} onClick={() => void removeManualShoppingItem(item).then(() => syncNow())}><TrashIcon /></button>
  </div>;
}

export function ShoppingPage({ recipes, entries, catalog, manualItems, checkStates }: {
  recipes: LocalRecipe[];
  entries: LocalMealPlanEntry[];
  catalog: LocalIngredientCatalog[];
  manualItems: LocalManualShoppingItem[];
  checkStates: LocalShoppingCheckState[];
}) {
  const [params, setParams] = useSearchParams();
  const weekStart = validWeekStart(params.get('week'));
  const weekEnd = addDays(weekStart, 6);
  const planned = useMemo(() => entries.filter((entry) => entry.planned_date >= weekStart && entry.planned_date <= weekEnd), [entries, weekEnd, weekStart]);
  const generated = useMemo(() => buildShoppingList(planned, recipes, catalog), [catalog, planned, recipes]);
  const states = useMemo(() => new Map(checkStates.filter((state) => state.week_start === weekStart).map((state) => [state.item_key, state])), [checkStates, weekStart]);
  const manual = useMemo(() => manualItems.filter((item) => item.week_start === weekStart), [manualItems, weekStart]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('');

  const isChecked = (item: ShoppingListItem) => {
    const state = states.get(item.key);
    return Boolean(state?.checked && state.source_signature === item.sourceSignature);
  };
  const toggle = (item: ShoppingListItem) => void setShoppingCheckState(weekStart, item.key, item.sourceSignature, !isChecked(item)).then(() => syncNow());
  const openGenerated = generated.filter((item) => !isChecked(item));
  const doneGenerated = generated.filter(isChecked);
  const openManual = manual.filter((item) => !item.checked);
  const doneManual = manual.filter((item) => item.checked);
  const grouped = useMemo(() => {
    const map = new Map<string, ShoppingListItem[]>();
    for (const item of openGenerated) map.set(item.category, [...(map.get(item.category) ?? []), item]);
    return [...map.entries()];
  }, [openGenerated]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await addManualShoppingItem(weekStart, name, amount || null, unit || null);
    setName(''); setAmount(''); setUnit(''); setAdding(false);
    void syncNow();
  };

  return <div className="app-shell shopping-page">
    <TopLevelPageHeader title="Handla" />
    <main className="shopping-content page-container">
      <WeekNavigator weekStart={weekStart} onChange={(week) => setParams({ week }, { replace: true })} />
      {!generated.length && !manual.length ? <section className="shopping-empty"><h2 className="heading-2">Inköpslistan är tom</h2><p>Planera ett recept eller lägg till en egen vara.</p></section> : <>
        {grouped.map(([category, items]) => <section className="shopping-group" key={category}><h2>{category}</h2><div>{items.map((item) => <GeneratedItem key={item.key} item={item} checked={false} onToggle={() => toggle(item)} />)}</div></section>)}
        {openManual.length > 0 && <section className="shopping-group manual-shopping-group"><h2>Egna varor</h2><div>{openManual.map((item) => <ManualItemRow key={item.id} item={item} />)}</div></section>}
      </>}

      <section className="manual-add-section">{adding ? <form className="manual-add-form" onSubmit={(event) => void submit(event)}>
        <input autoFocus maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Vara" aria-label="Vara" required />
        <input maxLength={40} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Mängd" aria-label="Mängd" />
        <input maxLength={24} value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="Enhet" aria-label="Enhet" />
        <div><button className="primary-button" type="submit">Lägg till</button><button className="text-button" type="button" onClick={() => setAdding(false)}>Avbryt</button></div>
      </form> : <button className="manual-add-trigger" type="button" onClick={() => setAdding(true)}><PlusIcon size={18} />Lägg till vara</button>}</section>

      {(doneGenerated.length > 0 || doneManual.length > 0) && <details className="completed-shopping"><summary>Klart ({doneGenerated.length + doneManual.length})</summary><div>{doneGenerated.map((item) => <GeneratedItem key={item.key} item={item} checked onToggle={() => toggle(item)} />)}{doneManual.map((item) => <ManualItemRow key={item.id} item={item} />)}</div></details>}
    </main>
  </div>;
}
