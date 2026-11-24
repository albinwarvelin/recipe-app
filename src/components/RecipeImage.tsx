import { useEffect, useState, type ReactNode } from 'react';
import { useImageUrl } from '../images/use-image-url';
import { ensureImage } from '../images/cache';
import { AuthenticationRequiredError } from '../api/recipes';

export function RecipeImage({ imageId, alt, full = false, fallback }: {
  imageId: string | null | undefined;
  alt: string;
  full?: boolean;
  fallback?: ReactNode;
}) {
  const source = useImageUrl(imageId, full);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    const load = () => {
      if (!imageId || !navigator.onLine) return;
      void ensureImage(imageId, full ? 'full' : 'thumbnail', attempt > 0).then(
        () => { if (active) setError(null); },
        (cause) => { if (active) setError(cause instanceof AuthenticationRequiredError ? 'Logga in för att hämta bilden.' : 'Bilden kunde inte hämtas.'); },
      );
    };
    load();
    window.addEventListener('online', load);
    return () => { active = false; window.removeEventListener('online', load); };
  }, [full, imageId, attempt]);

  return <>
    {source ? <img src={source} alt={alt} loading="eager" decoding="async" onError={() => setError('Bilden kunde inte visas.')} /> : fallback}
    {error && <span className="image-load-error" role="status">{error}{full && <button type="button" onClick={() => setAttempt((value) => value + 1)}>Försök igen</button>}</span>}
  </>;
}
