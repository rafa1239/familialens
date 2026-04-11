import { useEffect, useState } from "react";
import { getPhotoUrl } from "../photos";

/**
 * Resolves a stored photo id to an object URL and renders it as an <img>.
 * The `id` can also be a raw data: URL — in that case it's used directly.
 */
export function PhotoThumb({
  id,
  alt,
  className,
  style
}: {
  id: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (id.startsWith("data:") || id.startsWith("http")) {
      setSrc(id);
      return;
    }
    getPhotoUrl(id).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!src) return null;
  return <img src={src} alt={alt ?? ""} className={className} style={style} />;
}
