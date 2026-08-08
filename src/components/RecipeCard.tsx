import type { LocalRecipe } from '../data/db';
import { useImageUrl } from '../hooks/useLocalData';

export function RecipeCard({ recipe, onOpen, onFavorite }: { recipe: LocalRecipe; onOpen: () => void; onFavorite: () => void }) {
  const imageUrl = useImageUrl(recipe.image_key);
  const minutes = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);
  return <article className="recipe-card">
    <button className="recipe-card-open" type="button" onClick={onOpen} aria-label={`Open ${recipe.title}`}>
      <div className={`recipe-cover ${imageUrl ? 'has-image' : ''}`} style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}>
        {!imageUrl && <span aria-hidden="true">{recipe.title.slice(0, 1).toUpperCase()}</span>}
        {recipe.sync_status !== 'synced' && <span className={`card-sync-state ${recipe.sync_status}`}>{recipe.sync_status === 'conflict' ? 'Needs review' : 'Pending'}</span>}
      </div>
      <div className="recipe-card-body">
        <h2>{recipe.title}</h2>
        {recipe.description && <p>{recipe.description}</p>}
        <div className="recipe-facts">
          {minutes > 0 && <span>{minutes} min</span>}
          {recipe.servings && <span>{recipe.servings} servings</span>}
          <span>{recipe.ingredients.length} ingredients</span>
        </div>
        {recipe.tags.length > 0 && <div className="tag-list">{recipe.tags.slice(0, 3).map((tag) => <span key={tag.id ?? tag.name}>{tag.name}</span>)}</div>}
      </div>
    </button>
    <button className={`favorite-button ${recipe.favorite ? 'is-favorite' : ''}`} type="button" aria-label={recipe.favorite ? `Remove ${recipe.title} from favorites` : `Add ${recipe.title} to favorites`} onClick={onFavorite}>★</button>
  </article>;
}
