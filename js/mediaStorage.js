/**
 * IndexedDB storage for rehearsal audio/video files.
 * Allows storing large recordings (.mp3, .m4a, .wav, .mp4, etc.) locally in the browser.
 */

const DB_NAME = 'AcaRoomMediaDB';
const DB_VERSION = 1;
const STORE_NAME = 'mediaFiles';

let dbPromise = null;

function openDB() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => {
        console.warn('IndexedDB open error:', e);
        resolve(null);
      };
    } catch (err) {
      console.warn('IndexedDB exception:', err);
      resolve(null);
    }
  });
  return dbPromise;
}

export async function saveMediaFile(id, file) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const isVideo = file.type?.startsWith('video') || /\.(mp4|webm|mov)$/i.test(file.name);
      const record = {
        id,
        name: file.name,
        type: file.type || (isVideo ? 'video/mp4' : 'audio/mpeg'),
        isVideo,
        size: file.size,
        blob: file,
        createdAt: new Date().toISOString()
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => {
        console.warn('saveMediaFile error:', req.error);
        resolve(null);
      };
    } catch (e) {
      console.warn('saveMediaFile exception:', e);
      resolve(null);
    }
  });
}

export async function getMediaFile(id) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

const activeObjectUrls = new Map();

export async function getMediaBlobUrl(id) {
  if (activeObjectUrls.has(id)) {
    return activeObjectUrls.get(id);
  }
  const record = await getMediaFile(id);
  if (!record || !record.blob) return null;
  try {
    const url = URL.createObjectURL(record.blob);
    activeObjectUrls.set(id, url);
    return url;
  } catch {
    return null;
  }
}

export async function deleteMediaFile(id) {
  if (activeObjectUrls.has(id)) {
    try { URL.revokeObjectURL(activeObjectUrls.get(id)); } catch {}
    activeObjectUrls.delete(id);
  }
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
