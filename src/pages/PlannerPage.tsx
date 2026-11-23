import { useEffect, useMemo, useState } from 'react';
import { dateKeySchema } from '../../shared/planning';
import { Link, useSearchParams } from 'react-router';
import type { LocalMealPlanEntry, LocalRecipe } from '../data/db';
import { addMealPlanEntry, removeMealPlanEntry, updateMealPlanEntry } from '../data/local-planning';
import { ChevronDownIcon, PlusIcon, TrashIcon } from '../components/Icons';
import { RecipePickerSheet } from '../components/RecipePickerSheet';
import { TopLevelPageHeader } from '../components/TopLevelPageHeader';
import { WeekNavigator } from '../components/WeekNavigator';
import { dayLabel, validWeekStart, weekDays } from '../planning/week';
import { syncNow } from '../sync/coordinator';

function PlannedRecipe({ entry, recipe, weekStart }: { entry: LocalMealPlanEntry; recipe: LocalRecipe | undefined; weekStart: string }) {
  const [date, setDate] = useState(entry.planned_date);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => setDate(entry.planned_date), [entry.planned_date]);
  const portions = recipe?.servings ? entry.servings ?? recipe.servings : null;
  const update = (patch: Parameters<typeof updateMealPlanEntry>[1]) => {
    setMessage(null);
    void updateMealPlanEntry(entry, patch).then(() => syncNow()).catch((cause) => setMessage(cause instanceof Error ? cause.message : 'Planeringen kunde inte sparas.'));
  };
  return <details className="planned-recipe">
    <summary>
      <div><strong>{recipe?.title ?? 'Receptet är inte tillgängligt'}</strong><span>{recipe?.servings ? `${portions} port.` : `${entry.multiplier}× recept`}</span></div>
      <ChevronDownIcon />
    </summary>
    <div className="planned-recipe-actions">
      {recipe && <div className="quantity-stepper" aria-label={recipe.servings ? 'Ändra portioner' : 'Ändra antal receptomgångar'}>
        <button type="button" aria-label="Minska" disabled={(recipe.servings ? portions! : entry.multiplier) <= 1} onClick={() => recipe.servings ? update({ servings: Math.max(1, portions! - 1) }) : update({ multiplier: Math.max(1, entry.multiplier - 1) })}>−</button>
        <span>{recipe.servings ? <><strong>{portions}</strong> portioner</> : <><strong>{entry.multiplier}×</strong> recept</>}</span>
        <button type="button" aria-label="Öka" onClick={() => recipe.servings ? update({ servings: Math.min(1_000, portions! + 1) }) : update({ multiplier: Math.min(20, entry.multiplier + 1) })}>+</button>
      </div>}
      <label className="plan-date-field"><span>Flytta till</span><input type="date" value={date} onChange={(event) => {
        const value = event.target.value;
        setDate(value);
        if (dateKeySchema.safeParse(value).success) update({ planned_date: value });
        else setMessage('Välj ett giltigt datum. Det tidigare datumet behålls tills ett nytt datum är valt.');
      }} /></label>
      {message && <p className="error-message" role="alert">{message}</p>}
      <div className="planned-recipe-links">{recipe && <Link to={`/recipes/${recipe.id}?back=${encodeURIComponent(`/plan?week=${weekStart}`)}`}>Öppna recept</Link>}<button className="danger-text" type="button" onClick={() => void removeMealPlanEntry(entry).then(() => syncNow())}><TrashIcon />Ta bort</button></div>
    </div>
  </details>;
}

export function PlannerPage({ recipes, entries }: { recipes: LocalRecipe[]; entries: LocalMealPlanEntry[] }) {
  const [params, setParams] = useSearchParams();
  const weekStart = validWeekStart(params.get('week'));
  const days = weekDays(weekStart);
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const entriesByDay = useMemo(() => {
    const map = new Map<string, LocalMealPlanEntry[]>();
    for (const date of days) map.set(date, []);
    for (const entry of entries) map.get(entry.planned_date)?.push(entry);
    return map;
  }, [days.join('|'), entries]);
  const recipeById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const changeWeek = (week: string) => setParams({ week }, { replace: true });
  const add = async (recipe: LocalRecipe) => {
    if (!pickerDate) return;
    await addMealPlanEntry(recipe.id, pickerDate, recipe.servings);
    setPickerDate(null);
    void syncNow();
  };

  return <div className="app-shell planning-page">
    <TopLevelPageHeader title="Planera" />
    <main className="planning-content page-container">
      <WeekNavigator weekStart={weekStart} onChange={changeWeek} />
      <div className="planning-week">{days.map((date) => {
        const label = dayLabel(date);
        const dayEntries = entriesByDay.get(date) ?? [];
        return <section className={label.isToday ? 'planning-day is-today' : 'planning-day'} key={date}>
          <header><div><h2>{label.weekday}</h2><span>{label.date}</span></div><button type="button" aria-label={`Lägg till recept ${label.weekday}`} onClick={() => setPickerDate(date)}><PlusIcon size={18} /><span>Lägg till</span></button></header>
          {dayEntries.length ? <div className="planned-recipe-list">{dayEntries.map((entry) => <PlannedRecipe key={entry.id} entry={entry} recipe={recipeById.get(entry.recipe_id)} weekStart={weekStart} />)}</div> : <button className="empty-plan-day" type="button" onClick={() => setPickerDate(date)}>Inget planerat</button>}
        </section>;
      })}</div>
    </main>
    {pickerDate && <RecipePickerSheet recipes={recipes} dateLabel={dayLabel(pickerDate).weekday} onSelect={(recipe) => void add(recipe)} onClose={() => setPickerDate(null)} />}
  </div>;
}

