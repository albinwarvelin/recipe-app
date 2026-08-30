import { Link } from 'react-router';
import type { LocalRecipe } from '../data/db';
import { StarIcon } from './Icons';
import { RecipeImage } from './RecipeImage';

export function RecipeCard({ recipe, to, onFavorite }: { recipe: LocalRecipe; to: string; onFavorite: () => void }) {
  const minutes = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);
  return <article className="recipe-card">
    <Link className="recipe-card-open" to={to} aria-label={`Öppna ${recipe.title}`}>
      <div className="recipe-cover">
        <RecipeImage imageId={recipe.image_key} alt="" fallback={<span aria-hidden="true">{recipe.title.slice(0, 1).toUpperCase()}</span>} />
        {recipe.sync_status !== 'synced' && <span className={`card-sync-state ${recipe.sync_status}`}>{recipe.sync_status === 'conflict' ? 'Behöver granskas' : recipe.sync_status === 'failed' ? 'Kräver åtgärd' : 'Väntar'}</span>}
      </div>
      <div className="recipe-card-body">
        <h2 className="heading-3">{recipe.title}</h2>
        {recipe.description && <p className="text-body-small">{recipe.description}</p>}
        <div className="recipe-facts">{minutes > 0 && <span>{minutes} min</span>}{recipe.servings && <span>{recipe.servings} port.</span>}<span>{recipe.ingredients.length} ingredienser</span></div>
        {recipe.tags.length > 0 && <div className="tag-list">{recipe.tags.slice(0, 3).map((tag) => <span key={tag.id ?? tag.name}>{tag.name}</span>)}</div>}
      </div>
    </Link>
    <button className={`favorite-button ${recipe.favorite ? 'is-favorite' : ''}`} type="button" aria-label={recipe.favorite ? `Ta bort ${recipe.title} från favoriter` : `Lägg till ${recipe.title} som favorit`} onClick={onFavorite}><StarIcon size={21} filled={recipe.favorite} /></button>
  </article>;
}
