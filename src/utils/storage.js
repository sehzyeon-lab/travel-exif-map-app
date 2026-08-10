/**
 * High-performance IndexedDB Storage for large photo datasets without LocalStorage 5MB quota limits.
 */
const DB_NAME = 'TravelExifDB';
const STORE_NAME = 'photos';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePhotosToDB(photos) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await store.clear();
    for (const photo of photos) {
      store.put(photo);
    }
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
    });
  } catch (err) {
    console.warn('IndexedDB save fallback to localStorage:', err);
    try {
      localStorage.setItem('travel_exif_photos_v1', JSON.stringify(photos));
    } catch (e) {}
  }
}

export async function loadPhotosFromDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const results = request.result || [];
        if (results.length > 0) {
          resolve(results);
        } else {
          // Fallback to localStorage if empty
          try {
            const saved = localStorage.getItem('travel_exif_photos_v1');
            resolve(saved ? JSON.parse(saved) : []);
          } catch {
            resolve([]);
          }
        }
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('IndexedDB load error, fallback:', err);
    try {
      const saved = localStorage.getItem('travel_exif_photos_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }
}

export async function clearPhotosDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    localStorage.removeItem('travel_exif_photos_v1');
  } catch (e) {
    localStorage.removeItem('travel_exif_photos_v1');
  }
}
