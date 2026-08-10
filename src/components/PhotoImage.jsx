import React, { useEffect, useRef, useState } from 'react';
import { getThumbnail, getFullImage } from '../utils/mediaStore';

/**
 * Renders a photo regardless of where its pixels live.
 *
 * Web photos carry an object URL. Native photos carry only a MediaStore id, and their bytes are
 * fetched lazily as a base64 thumbnail once the element scrolls into view — loading thousands of
 * full images up front would blow through memory and stall the bridge.
 */
export default function PhotoImage({ photo, alt = '', className, full = false, style, onClick }) {
  const [src, setSrc] = useState(photo?.url || null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(full);
  const containerRef = useRef(null);

  // Reset when the element is recycled onto a different photo.
  useEffect(() => {
    setSrc(photo?.url || null);
    setFailed(false);
    setVisible(full);
  }, [photo?.id, photo?.url, full]);

  useEffect(() => {
    if (visible || !containerRef.current) return;

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || src || !photo?.mediaId) return;

    let cancelled = false;
    const load = full ? getFullImage(photo.mediaId) : getThumbnail(photo.mediaId);

    load
      .then((dataUrl) => {
        if (cancelled) return;
        if (dataUrl) setSrc(dataUrl);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => { cancelled = true; };
  }, [visible, src, full, photo?.mediaId]);

  if (src && !failed) {
    return (
      <img
        ref={containerRef}
        src={src}
        alt={alt}
        className={className}
        style={style}
        onClick={onClick}
        onError={() => setFailed(true)}
      />
    );
  }

  // Placeholder keeps `className` so it inherits the same box the image would have occupied.
  return (
    <div
      ref={containerRef}
      className={className}
      style={style}
      onClick={onClick}
      role="img"
      aria-label={alt}
    />
  );
}
