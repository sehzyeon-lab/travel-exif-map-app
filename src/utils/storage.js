/**
 * IndexedDB persistence for photo metadata, source blobs (web only) and thumbnail cache.
 *
 * Photos are stored WITHOUT their preview URL: object URLs created with URL.createObjectURL are
 * only valid for the lifetime of the document, so a persisted `blob:` string is a dead link on the
 * next launch. Web photos keep their Blob instead and the URL is recreated on load; native photos
 * are re-rendered from their MediaStore id.
 */
const DB_NAME = 'TravelExifDB';
const DB_VERSION = 2;
const PHOTO_STORE = 'photos';
const THUMB_STORE = 'thumbs';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(THUMB_STORE)) {
        db.createObjectStore(THUMB_STORE);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // A version change from another tab/context invalidates this handle.
      db.onclose = () => { dbPromise = null; };
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
    request.onblocked = () => {
      dbPromise = null;
      reject(new Error('IndexedDB upgrade blocked by another open tab'));
    };
  });

  return dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Strips runtime-only fields that must not (or cannot) be structured-cloned into IDB. */
function toStored(photo) {
  const { url, thumbUrl, ...rest } = photo;
  return rest;
}

function fromStored(photo) {
  if (photo.blob instanceof Blob) {
    return { ...photo, url: URL.createObjectURL(photo.blob) };
  }
  return { ...photo, url: photo.url || null };
}

export async function savePhotosToDB(photos) {
  const db = await openDB();
  const tx = db.transaction(PHOTO_STORE, 'readwrite');
  const store = tx.objectStore(PHOTO_STORE);
  store.clear();
  for (const photo of photos) {
    store.put(toStored(photo));
  }
  await txDone(tx);
  return true;
}

export async function loadPhotosFromDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const stored = await requestResult(tx.objectStore(PHOTO_STORE).getAll());
    return (stored || []).map(fromStored);
  } catch (err) {
    console.warn('[storage] load failed:', err);
    return [];
  }
}

export async function clearPhotosDB() {
  try {
    const db = await openDB();
    const tx = db.transaction([PHOTO_STORE, THUMB_STORE], 'readwrite');
    tx.objectStore(PHOTO_STORE).clear();
    tx.objectStore(THUMB_STORE).clear();
    await txDone(tx);
  } catch (err) {
    console.warn('[storage] clear failed:', err);
  }
  try {
    localStorage.removeItem('travel_exif_photos_v1');
  } catch {}
}

// region thumbnail cache

export async function readCachedThumbs(keys) {
  const out = new Map();
  if (keys.length === 0) return out;
  try {
    const db = await openDB();
    const tx = db.transaction(THUMB_STORE, 'readonly');
    const store = tx.objectStore(THUMB_STORE);
    const values = await Promise.all(keys.map((key) => requestResult(store.get(key))));
    keys.forEach((key, i) => {
      if (values[i]) out.set(key, values[i]);
    });
  } catch (err) {
    console.warn('[storage] thumb read failed:', err);
  }
  return out;
}

export async function writeCachedThumbs(entries) {
  if (entries.length === 0) return;
  try {
    const db = await openDB();
    const tx = db.transaction(THUMB_STORE, 'readwrite');
    const store = tx.objectStore(THUMB_STORE);
    for (const [key, value] of entries) {
      store.put(value, key);
    }
    await txDone(tx);
  } catch (err) {
    console.warn('[storage] thumb write failed:', err);
  }
}

// endregion
