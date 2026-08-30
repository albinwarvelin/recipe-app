import { useEffect, useState, type ReactNode } from 'react';
import { useImageUrl } from '../images/use-image-url';
import { ensureThumbnailImage } from '../sync/coordinator';

export function RecipeImage({ imageId, alt, full = false, fallback }: {
  imageId: string | null | undefined;
  alt: string;
  full?: boolean;
  fallback?: ReactNode;
}) {
  const source = useImageUrl(imageId, full);
  const [displayedSource, setDisplayedSource] = useState(source);

  useEffect(() => {
    if (!full && imageId && !source && navigator.onLine) void ensureThumbnailImage(imageId).catch(() => undefined);
  }, [full, imageId, source]);

  useEffect(() => {
    if (!source) {
      setDisplayedSource(null);
      return;
    }
    if (!displayedSource || displayedSource === source) {
      setDisplayedSource(source);
      return;
    }

    let active = true;
    const image = new Image();
    image.src = source;
    const show = () => { if (active) setDisplayedSource(source); };
    if (typeof image.decode === 'function') void image.decode().then(show, show);
    else image.onload = show;
    return () => { active = false; };
  }, [displayedSource, source]);

  return displayedSource
    ? <img src={displayedSource} alt={alt} loading="eager" decoding="async" />
    : fallback;
}
