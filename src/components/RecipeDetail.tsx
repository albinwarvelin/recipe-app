import { useEffect } from 'react';
import { Link } from 'react-router';
import type { LocalRecipe } from '../data/db';
import { useImageUrl } from '../hooks/useLocalData';
import { ensureFullImage } from '../sync/coordinator';
import { AppToolbar } from './AppToolbar';
import { ArrowLeftIcon, EditIcon, TrashIcon } from './Icons';
import { formatTimerDuration } from '../../shared/timer-duration';

function safeWebUrl(value: string | null): string | null {
  if (!value) return null;
  try { return ['http:', 'https:'].includes(new URL(value).protocol) ? value : null; }
  catch { return null; }
}

export function RecipeDetail({ recipe, backTo, onDelete }: { recipe: LocalRecipe; backTo: string; onDelete: () => void }) {
  const imageUrl = useImageUrl(recipe.image_key, true);
  useEffect(() => { if (recipe.image_key && navigator.onLine) void ensureFullImage(recipe.image_key).catch(() => undefined); }, [recipe.image_key]);
  const minutes = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);
  const sourceUrl = safeWebUrl(recipe.source_url);
  return <div className="detail-page">
    <AppToolbar
      title="Recept"
      leading={<Link className="nav-button" to={backTo}><ArrowLeftIcon /><span>Tillbaka</span></Link>}
      trailing={<>
        <Link className="nav-button" to={`/recipes/${recipe.id}/edit`}><EditIcon /><span className="nav-button-optional-label">Redigera</span></Link>
        <button className="nav-button nav-button-danger" type="button" onClick={onDelete}><TrashIcon /><span className="nav-button-optional-label">Ta bort</span></button>
      </>}
    />
    <main className="detail-main page-container">
      <div className={`detail-cover ${imageUrl ? 'has-image' : ''}`} style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined} />
      <article className="detail-content">
        <p className="text-eyebrow">{recipe.source_type === 'personal' ? 'Från ditt kök' : recipe.source_name ?? recipe.source_type}</p>
        <h1 className="heading-1">{recipe.title}</h1>
        {recipe.source_type === 'online' && sourceUrl && <a className="recipe-source-link" href={sourceUrl} target="_blank" rel="noreferrer">Öppna originalreceptet</a>}
        {recipe.description && <p className="text-lead detail-description">{recipe.description}</p>}
        <div className="detail-facts">{minutes > 0 && <span><strong>{minutes}</strong> minuter</span>}{recipe.servings && <span><strong>{recipe.servings}</strong> portioner</span>}</div>
        {recipe.tags.length > 0 && <div className="tag-list">{recipe.tags.map((tag) => <Link key={tag.id ?? tag.name} to={`/?tag=${encodeURIComponent(tag.id ?? tag.name)}`}>{tag.name}</Link>)}</div>}
        <section><h2 className="heading-2">Ingredienser</h2>{recipe.ingredients.length ? <ul className="ingredient-list">{recipe.ingredients.map((item) => <li key={item.id}><span>{[item.amount, item.unit].filter(Boolean).join(' ')}</span><strong>{item.name}</strong></li>)}</ul> : <p className="text-body-muted">Inga ingredienser tillagda.</p>}</section>
        <section><h2 className="heading-2">Gör så här</h2>{recipe.instructions.length ? <ol className="instruction-list">{recipe.instructions.map((item, index) => <li key={item.id}><span>{index + 1}</span><p className="text-body">{item.text}{item.timer_seconds ? <small>Timer: {formatTimerDuration(item.timer_seconds)}</small> : null}</p></li>)}</ol> : <p className="text-body-muted">Inga steg tillagda.</p>}</section>
        {recipe.notes && <section><h2 className="heading-2">Anteckningar</h2><p className="text-body preserve-lines">{recipe.notes}</p></section>}
      </article>
    </main>
  </div>;
}
