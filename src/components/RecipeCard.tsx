import { Link } from 'react-router';
import type { LocalRecipe } from '../data/db';
import { useImageUrl } from '../hooks/useLocalData';
import { StarIcon } from './Icons';

export function RecipeCard({ recipe, to, onFavorite }: { recipe: LocalRecipe; to: string; onFavorite: () => void }) {
  const imageUrl = useImageUrl(recipe.image_key);
  const minutes = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);
  return <article className="recipe-card">
    <Link className="recipe-card-open" to={to} aria-label={`Öppna ${recipe.title}`}>
      <div className={`recipe-cover ${imageUrl ? 'has-image' : ''}`} style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}>
        {!imageUrl && <span aria-hidden="true">{recipe.title.slice(0, 1).toUpperCase()}</span>}
        {recipe.sync_status !== 'synced' && <span className={`card-sync-state ${recipe.sync_status}`}>{recipe.sync_status === 'conflict' ? 'Behöver granskas' : 'Väntar'}</span>}
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
