import { useEffect } from 'react';
import type { LocalRecipe } from '../data/db';
import { useImageUrl } from '../hooks/useLocalData';
import { ensureFullImage } from '../sync/coordinator';

export function RecipeDetail({ recipe, onBack, onEdit, onDelete }: { recipe: LocalRecipe; onBack: () => void; onEdit: () => void; onDelete: () => void }) {
  const imageUrl = useImageUrl(recipe.image_key, true);
  useEffect(() => { if (recipe.image_key && navigator.onLine) void ensureFullImage(recipe.image_key).catch(() => undefined); }, [recipe.image_key]);
  const minutes = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);
  return <div className="detail-page">
    <header className="detail-toolbar"><button className="toolbar-button" type="button" onClick={onBack}>‹ Library</button><div><button className="toolbar-button" type="button" onClick={onEdit}>Edit</button><button className="toolbar-button danger-text" type="button" onClick={onDelete}>Delete</button></div></header>
    <main>
      <div className={`detail-cover ${imageUrl ? 'has-image' : ''}`} style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined} />
      <article className="detail-content">
        <p className="eyebrow">{recipe.source_type === 'personal' ? 'From your kitchen' : recipe.source_name ?? recipe.source_type}</p>
        <h1>{recipe.title}</h1>
        {recipe.description && <p className="detail-description">{recipe.description}</p>}
        <div className="detail-facts">{minutes > 0 && <span><strong>{minutes}</strong> minutes</span>}{recipe.servings && <span><strong>{recipe.servings}</strong> servings</span>}</div>
        {recipe.tags.length > 0 && <div className="tag-list">{recipe.tags.map((tag) => <span key={tag.id ?? tag.name}>{tag.name}</span>)}</div>}
        <section><h2>Ingredients</h2>{recipe.ingredients.length ? <ul className="ingredient-list">{recipe.ingredients.map((item) => <li key={item.id}><span>{[item.amount, item.unit].filter(Boolean).join(' ')}</span><strong>{item.name}</strong></li>)}</ul> : <p className="muted">No ingredients added.</p>}</section>
        <section><h2>Method</h2>{recipe.instructions.length ? <ol className="instruction-list">{recipe.instructions.map((item, index) => <li key={item.id}><span>{index + 1}</span><p>{item.text}{item.timer_seconds ? <small>{Math.round(item.timer_seconds / 60)} min timer</small> : null}</p></li>)}</ol> : <p className="muted">No instructions added.</p>}</section>
        {recipe.notes && <section><h2>Notes</h2><p className="preserve-lines">{recipe.notes}</p></section>}
      </article>
    </main>
  </div>;
}
