import { registerPlugin, Capacitor } from '@capacitor/core';
import { readCachedThumbs, writeCachedThumbs } from './storage';

const MediaStoreScanner = registerPlugin('MediaStoreScanner');

export const isNative = () => Capacitor.isNativePlatform();

export class MediaAccessError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MediaAccessError';
  }
}

function normalizeError(err) {
  const code = err?.code || err?.message || '';
  if (String(code).includes('PERMISSION_DENIED')) {
    return new MediaAccessError('PERMISSION_DENIED');
  }
  return err instanceof Error ? err : new Error(String(err));
}

export async function checkMediaAccess() {
  if (!isNative()) return { read: true, mediaLocation: true };
  try {
    return await MediaStoreScanner.checkAccess();
  } catch {
    return { read: false, mediaLocation: false };
  }
}

export async function requestMediaAccess() {
  if (!isNative()) return { read: true, mediaLocation: true };
  return MediaStoreScanner.requestAccess();
}

/** Opens this app's system settings so the user can switch to "Allow all photos". */
export async function openAppSettings() {
  if (!isNative()) return;
  try {
    await MediaStoreScanner.openSettings();
  } catch (e) {
    console.warn('[mediaStore] openSettings failed:', e);
  }
}

/**
 * Scans the whole device gallery natively. GPS comes from each file's EXIF header (read with
 * ACCESS_MEDIA_LOCATION), not from the MediaStore columns, which no longer exist on Android 10+.
 */
export async function scanGallery({
  onProgress,
  limit = 0,
  since = 0,
  skipScreenshots = true,
  requestLocationPermission = true
} = {}) {
  if (!isNative()) throw new MediaAccessError('NOT_NATIVE');

  let listener = null;
  if (onProgress) {
    listener = await MediaStoreScanner.addListener('mediaScanProgress', (p) => {
      onProgress(p.current || 0, p.total || 0, p.withGps || 0);
    });
  }

  try {
    return await MediaStoreScanner.scanGallery({ limit, since, skipScreenshots, requestLocationPermission });
  } catch (err) {
    throw normalizeError(err);
  } finally {
    if (listener) await listener.remove();
  }
}

// region thumbnails

const THUMB_SIZE = 256;
const BATCH_WINDOW_MS = 60;
const MAX_BATCH = 24;
const MAX_MEMORY_THUMBS = 900;

const memoryCache = new Map();
const inFlight = new Map();
let queue = new Map();
let flushTimer = null;

function rememberThumb(mediaId, dataUrl) {
  if (memoryCache.size >= MAX_MEMORY_THUMBS) {
    // Cheap FIFO eviction — base64 thumbs are ~10KB each and this caps memory around 10MB.
    const oldest = memoryCache.keys().next().value;
    memoryCache.delete(oldest);
  }
  memoryCache.set(mediaId, dataUrl);
}

async function flushQueue() {
  flushTimer = null;
  const pending = queue;
  queue = new Map();
  if (pending.size === 0) return;

  const ids = Array.from(pending.keys());

  // 1. Persistent cache first — avoids re-decoding on every app launch.
  let cached = new Map();
  try {
    cached = await readCachedThumbs(ids);
  } catch {}

  const missing = [];
  for (const id of ids) {
    const hit = cached.get(id);
    if (hit) {
      rememberThumb(id, hit);
      pending.get(id).forEach(({ resolve }) => resolve(hit));
      pending.delete(id);
    } else {
      missing.push(id);
    }
  }

  // 2. Ask the native side for whatever is left, in bounded batches.
  for (let i = 0; i < missing.length; i += MAX_BATCH) {
    const batch = missing.slice(i, i + MAX_BATCH);
    try {
      const { thumbs } = await MediaStoreScanner.getThumbnails({ ids: batch, size: THUMB_SIZE });
      const toPersist = [];
      for (const id of batch) {
        const dataUrl = thumbs?.[id] || null;
        if (dataUrl) {
          rememberThumb(id, dataUrl);
          toPersist.push([id, dataUrl]);
        }
        pending.get(id)?.forEach(({ resolve }) => resolve(dataUrl));
        pending.delete(id);
      }
      writeCachedThumbs(toPersist);
    } catch (err) {
      for (const id of batch) {
        pending.get(id)?.forEach(({ reject }) => reject(normalizeError(err)));
        pending.delete(id);
      }
    }
  }

  // Anything still pending got no answer at all.
  for (const [, waiters] of pending) {
    waiters.forEach(({ resolve }) => resolve(null));
  }
}

/**
 * Returns a base64 thumbnail for a MediaStore id. Requests made close together are coalesced into
 * one native call, so a scrolling grid does not fire hundreds of individual bridge round-trips.
 */
export function getThumbnail(mediaId) {
  if (!isNative() || mediaId == null) return Promise.resolve(null);
  const key = String(mediaId);

  const cached = memoryCache.get(key);
  if (cached) return Promise.resolve(cached);

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = new Promise((resolve, reject) => {
    if (!queue.has(key)) queue.set(key, []);
    queue.get(key).push({ resolve, reject });
    if (!flushTimer) flushTimer = setTimeout(flushQueue, BATCH_WINDOW_MS);
  }).finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

/** Full-resolution (downscaled) image for the detail modal. */
export async function getFullImage(mediaId, maxSize = 1280) {
  if (!isNative() || mediaId == null) return null;
  try {
    const { dataUrl } = await MediaStoreScanner.getImage({ id: String(mediaId), maxSize });
    return dataUrl || null;
  } catch (err) {
    console.warn('[mediaStore] getImage failed:', err);
    return null;
  }
}

export function clearThumbnailMemoryCache() {
  memoryCache.clear();
}

// endregion
