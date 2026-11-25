import { useState } from 'react';
import { Link } from 'react-router';
import type { LocalRecipe } from '../data/db';
import { AppToolbar } from './AppToolbar';
import { ArrowLeftIcon, CalendarIcon, CheckIcon, EditIcon, TrashIcon } from './Icons';
import { RecipeImage } from './RecipeImage';
import { formatTimerDuration } from '../../shared/timer-duration';

function safeWebUrl(value: string | null): string | null {
  if (!value) return null;
  try { return ['http:', 'https:'].includes(new URL(value).protocol) ? value : null; }
  catch { return null; }
}

export function RecipeDetail({ recipe, backTo, onDelete, onPlan }: { recipe: LocalRecipe; backTo: string; onDelete: () => void; onPlan?: () => void }) {
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(() => new Set());
  const minutes = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);
  const sourceUrl = safeWebUrl(recipe.source_url);
  return <div className="detail-page">
    <AppToolbar
      title="Recept"
      hideTitleOnMobile
      leading={<Link className="nav-button" to={backTo}><ArrowLeftIcon /><span>Tillbaka</span></Link>}
      trailing={<>
        <Link className="nav-button" to={`/recipes/${recipe.id}/edit`} aria-label="Redigera recept"><EditIcon /><span className="nav-button-optional-label">Redigera</span></Link>
        <button className="nav-button nav-button-danger" type="button" onClick={onDelete} aria-label="Ta bort recept"><TrashIcon /><span className="nav-button-optional-label">Ta bort</span></button>
      </>}
    />
    <main className="detail-main page-container">
      {recipe.image_key && <div className="detail-cover"><RecipeImage imageId={recipe.image_key} full alt={`Omslagsbild för ${recipe.title}`} /></div>}
      <article className="detail-content">
        <h1 className="heading-1">{recipe.title}</h1>
        <div className="detail-meta-row">
          <div className="detail-facts">{minutes > 0 && <span><strong>{minutes}</strong> min</span>}{recipe.servings && <span><strong>{recipe.servings}</strong> portioner</span>}</div>
          {onPlan && <button className="secondary-button detail-plan-button" type="button" onClick={onPlan}><CalendarIcon size={17} />Planera</button>}
        </div>
        {recipe.description && <p className="text-body detail-description">{recipe.description}</p>}
        {recipe.source_name && <p className="text-body-small detail-source">Källa: {recipe.source_name}</p>}
        {sourceUrl && <a className="recipe-source-link" href={sourceUrl} target="_blank" rel="noreferrer">Öppna originalreceptet</a>}
        {recipe.tags.length > 0 && <div className="tag-list">{recipe.tags.map((tag) => <Link key={tag.id ?? tag.name} to={`/?tag=${encodeURIComponent(tag.id ?? tag.name)}`}>{tag.name}</Link>)}</div>}
        <div className="detail-sections">
          <section className="detail-ingredients" id="recipe-ingredients" aria-labelledby="ingredients-heading">
            <div className="detail-section-heading"><h2 className="heading-2" id="ingredients-heading">Ingredienser</h2><a href="#recipe-instructions">Till stegen ↓</a></div>
            {recipe.ingredients.length ? <ul className="ingredient-list">{recipe.ingredients.map((item, index) => {
              const key = `${recipe.id}:${item.id ?? index}`;
              const group = item.group_name?.trim();
              const startsGroup = group && group !== recipe.ingredients[index - 1]?.group_name?.trim();
              return <li key={key}>
                {startsGroup && <h3 className="ingredient-group-heading">{group}</h3>}
                <label className={`ingredient-row${checkedIngredients.has(key) ? ' is-checked' : ''}`}>
                  <span className="ingredient-check"><input type="checkbox" checked={checkedIngredients.has(key)} onChange={() => setCheckedIngredients((current) => {
                    const next = new Set(current);
                    if (next.has(key)) next.delete(key); else next.add(key);
                    return next;
                  })} /><CheckIcon size={15} /></span>
                  <span className="ingredient-text">{[item.amount, item.unit, item.name].filter(Boolean).join(' ')}</span>
                </label>
              </li>;
            })}</ul> : <p className="text-body-muted">Inga ingredienser tillagda.</p>}
          </section>
          <div className="detail-directions">
            <section id="recipe-instructions" aria-labelledby="instructions-heading"><h2 className="heading-2" id="instructions-heading">Gör så här</h2>{recipe.instructions.length ? <ol className="instruction-list">{recipe.instructions.map((item, index) => <li key={item.id ?? index}><span>{index + 1}</span><p className="text-body">{item.text}{item.timer_seconds ? <small>Timer: {formatTimerDuration(item.timer_seconds)}</small> : null}</p></li>)}</ol> : <p className="text-body-muted">Inga steg tillagda.</p>}</section>
            {recipe.notes && <section><h2 className="heading-2">Anteckningar</h2><p className="text-body preserve-lines">{recipe.notes}</p></section>}
          </div>
        </div>
      </article>
    </main>
  </div>;
}
