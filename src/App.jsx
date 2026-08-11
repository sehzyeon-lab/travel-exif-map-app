import React, { useState, useEffect, useRef, useCallback } from 'react';
// `Map` is aliased: the unaliased icon name shadows the global Map constructor in this module.
import { Map as MapIcon, Clock, Image as ImageIcon, BarChart3, Trash2, Loader2, FolderSearch, AlertTriangle, Download } from 'lucide-react';
import { parsePhotoExif, getPhotoFingerprint, isImportablePhoto } from './utils/exifParser';
import { clusterPhotosIntoTrips, reverseGeocode, geocodeKey } from './utils/geoUtils';
import { loadPhotosFromDB, savePhotosToDB, clearPhotosDB } from './utils/storage';
import { scanDeviceGallery } from './utils/autoScanner';
import { isNative, checkMediaAccess, MediaAccessError, clearThumbnailMemoryCache } from './utils/mediaStore';

import ExifModal from './components/ExifModal';
import MapView from './components/MapView';
import TimelineView from './components/TimelineView';
import GalleryView from './components/GalleryView';
import AnalyticsView from './components/AnalyticsView';
import UpdateModal from './components/UpdateModal';
import AndroidDownloadModal from './components/AndroidDownloadModal';
import { CURRENT_VERSION } from './releaseNotes';

const tabs = [
  { id: 'map', label: '지도', icon: MapIcon },
  { id: 'timeline', label: '기록', icon: Clock },
  { id: 'gallery', label: '갤러리', icon: ImageIcon },
  { id: 'analytics', label: '통계', icon: BarChart3 }
];

const IDLE_PROGRESS = { active: false, current: 0, total: 0, skipped: 0, label: '' };

/** Nominatim's usage policy allows ~1 request per second. */
const GEOCODE_INTERVAL_MS = 1100;

const LAST_SCAN_KEY = 'travel_last_scan_at';
const HOME_KEY = 'travel_home_location';
const TRIP_NAMES_KEY = 'travel_trip_names';
const TRIP_MERGE_KEY = 'travel_trip_merges';
const TRIP_SPLIT_KEY = 'travel_trip_splits';

function readIdArray(key) {
  try {
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function readHome() {
  try {
    const raw = localStorage.getItem(HOME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.lat === 'number' && typeof parsed?.lng === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

function readTripNames() {
  try {
    return JSON.parse(localStorage.getItem(TRIP_NAMES_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function readLastScanAt() {
  try {
    return Number(localStorage.getItem(LAST_SCAN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeLastScanAt(value) {
  try {
    if (value) localStorage.setItem(LAST_SCAN_KEY, String(value));
  } catch {}
}

async function processInChunks(items, chunkSize, fn, onProgress) {
  const results = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (item) => {
        try {
          return await fn(item);
        } catch (e) {
          console.warn('Chunk processing error:', e);
          return null;
        }
      })
    );
    results.push(...chunkResults.filter(Boolean));
    onProgress?.(Math.min(i + chunkSize, items.length), items.length);
    await new Promise((r) => setTimeout(r, 16));
  }
  return results;
}

/** Merges freshly scanned photos over the existing set, keyed by fingerprint. */
function mergePhotos(existing, incoming) {
  const byKey = new Map();
  for (const photo of existing) {
    const key = photo.fingerprint || photo.name;
    if (key) byKey.set(key, photo);
  }
  for (const photo of incoming) {
    const key = photo.fingerprint || photo.name;
    if (!key) continue;
    const prev = byKey.get(key);
    // Keep an already-resolved place name so the merge doesn't undo geocoding.
    byKey.set(key, prev?.locationName && prev.locationName !== '위치 확인 중...'
      ? { ...photo, id: prev.id, locationName: prev.locationName }
      : photo);
  }
  return Array.from(byKey.values()).sort((a, b) => b.timestamp - a.timestamp);
}

export default function App() {
  const [photos, setPhotos] = useState([]);
  const [trips, setTrips] = useState([]);
  const [activeTab, setActiveTab] = useState('map');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [mapFocusPhoto, setMapFocusPhoto] = useState(null);
  const [progressState, setProgressState] = useState(IDLE_PROGRESS);
  const [geocodeProgress, setGeocodeProgress] = useState(IDLE_PROGRESS);
  const [notice, setNotice] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [home, setHome] = useState(() => readHome());
  const [tripNames, setTripNames] = useState(() => readTripNames());
  const [mergeBoundaries, setMergeBoundaries] = useState(() => new Set(readIdArray(TRIP_MERGE_KEY)));
  const [splitBoundaries, setSplitBoundaries] = useState(() => new Set(readIdArray(TRIP_SPLIT_KEY)));
  const [focusTrip, setFocusTrip] = useState(null);

  const geocodedRef = useRef(new Set());
  const fileInputRef = useRef(null);
  const scanningRef = useRef(false);
  const autoScanDoneRef = useRef(false);
  const saveTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const geocodeQueueRef = useRef(new Map());
  const geocodeRunningRef = useRef(false);
  const geocodeProgressRef = useRef({ current: 0, total: 0 });

  useEffect(() => {
    try {
      if (localStorage.getItem('seen_app_version') !== CURRENT_VERSION) setShowUpdateModal(true);
    } catch {}
  }, []);

  const handleCloseUpdateModal = () => {
    setShowUpdateModal(false);
    try {
      localStorage.setItem('seen_app_version', CURRENT_VERSION);
    } catch {}
  };

  // Load persisted photos
  useEffect(() => {
    loadPhotosFromDB().then((stored) => {
      if (stored.length > 0) {
        // Retroactively drop anything that isn't a genuine capture (no GPS/camera/shutter info) —
        // screenshots and stripped downloads that slipped in before this rule existed.
        const cleaned = stored.filter(isImportablePhoto);
        cleaned.forEach((p) => {
          if (p.locationName && p.locationName !== '위치 확인 중...') geocodedRef.current.add(p.id);
        });
        setPhotos(cleaned.sort((a, b) => b.timestamp - a.timestamp));
      }
      setHydrated(true);
    });
  }, []);

  // Recompute trips immediately, persist on a trailing debounce (a full rewrite of thousands of
  // records on every geocode tick would thrash IndexedDB).
  useEffect(() => {
    setTrips(clusterPhotosIntoTrips(photos, { home, nameOverrides: tripNames, mergeBoundaries, splitBoundaries }));
    if (!hydrated) return;

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      savePhotosToDB(photos).catch((e) => console.warn('Save failed:', e));
      // Shorter than GEOCODE_INTERVAL_MS so a long geocoding run can't keep postponing the save.
    }, 800);

    return () => clearTimeout(saveTimerRef.current);
  }, [photos, hydrated, home, tripNames, mergeBoundaries, splitBoundaries]);

  // Reassigned on mount, not just cleared on unmount, so StrictMode's double-invoke in dev doesn't
  // leave the flag stuck at false.
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /**
   * Background reverse geocoding, deduplicated by ~1km grid cell so a 2000-photo trip costs a
   * handful of requests instead of 2000.
   *
   * The worker deliberately lives outside the effect's lifecycle: it writes results back with
   * setPhotos, which re-runs this effect, so an effect-scoped loop would abort itself after the
   * very first lookup.
   */
  const drainGeocodeQueue = useCallback(async () => {
    if (geocodeRunningRef.current) return;
    geocodeRunningRef.current = true;

    try {
      while (geocodeQueueRef.current.size > 0 && mountedRef.current) {
        const [cell, ids] = geocodeQueueRef.current.entries().next().value;
        geocodeQueueRef.current.delete(cell);

        const [lat, lng] = cell.split(',').map(Number);
        let name;
        try {
          name = await reverseGeocode(lat, lng);
        } catch {
          name = `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;
        }
        if (!mountedRef.current) return;

        setPhotos((prev) => prev.map((p) => (ids.has(p.id) ? { ...p, locationName: name } : p)));
        geocodeProgressRef.current.current += ids.size;
        const { current, total } = geocodeProgressRef.current;
        setGeocodeProgress({ active: current < total, current, total, skipped: 0, label: '방문 장소 확인 중...' });
        await new Promise((r) => setTimeout(r, GEOCODE_INTERVAL_MS));
      }
    } finally {
      geocodeRunningRef.current = false;
    }
  }, []);

  useEffect(() => {
    const pending = photos.filter(
      (p) => p.hasGps && !geocodedRef.current.has(p.id) &&
        (!p.locationName || p.locationName === '위치 확인 중...')
    );
    if (pending.length === 0) return;

    for (const p of pending) {
      geocodedRef.current.add(p.id);
      const cell = geocodeKey(p.latitude, p.longitude);
      if (!geocodeQueueRef.current.has(cell)) geocodeQueueRef.current.set(cell, new Set());
      geocodeQueueRef.current.get(cell).add(p.id);
    }

    geocodeProgressRef.current = { current: 0, total: pending.length };
    setGeocodeProgress({ active: true, current: 0, total: pending.length, skipped: 0, label: '방문 장소 확인 중...' });

    drainGeocodeQueue();
  }, [photos, drainGeocodeQueue]);

  const handleScanGallery = useCallback(async ({ incremental = false, silent = false } = {}) => {
    if (scanningRef.current) return;

    if (!isNative()) {
      // Browser has no MediaStore — fall back to the file picker.
      fileInputRef.current?.click();
      return;
    }

    scanningRef.current = true;
    setNotice(null);
    // A silent background refresh shows no progress banner — the launch-time incremental pass
    // reads only what changed since last scan, so surfacing "분석 중..." every time is just noise.
    if (!silent) {
      setProgressState({ active: true, current: 0, total: 0, skipped: 0, label: '갤러리를 읽는 중...' });
    }

    try {
      const result = await scanDeviceGallery({
        since: incremental ? readLastScanAt() : 0,
        // A launch-time refresh must stay silent; only the explicit button may raise a dialog.
        requestLocationPermission: !incremental,
        onProgress: silent ? undefined : (current, total) => {
          setProgressState({
            active: true,
            current,
            total,
            skipped: 0,
            label: '사진 위치 정보 분석 중...'
          });
        }
      });

      if (result.photos.length > 0) {
        setPhotos((prev) => mergePhotos(prev, result.photos));
      }
      writeLastScanAt(result.scannedAt);

      if (silent) {
        // Background refresh: stay quiet. Any new photos already merged in above.
      } else if (incremental && result.photos.length === 0) {
        // Nothing new since last time — that's the expected quiet path, not a problem.
      } else if (!result.mediaLocationGranted) {
        setNotice({
          type: 'warning',
          message: '위치 권한(ACCESS_MEDIA_LOCATION)이 없어 사진의 GPS를 읽을 수 없습니다. 설정 > 앱 > 권한에서 허용해 주세요.'
        });
      } else if (result.photos.length === 0) {
        setNotice({ type: 'info', message: '기기 갤러리에서 사진을 찾지 못했습니다.' });
      } else if (result.withGps === 0) {
        setNotice({
          type: 'info',
          message: `사진 ${result.photos.length}장을 불러왔지만 GPS가 기록된 사진이 없습니다. 카메라 앱의 "위치 태그" 설정을 확인해 주세요.`
        });
      }
    } catch (err) {
      console.error('Gallery scan failed:', err);
      if (err instanceof MediaAccessError) {
        setNotice({
          type: 'error',
          message: '사진 접근 권한이 거부되었습니다. 설정 > 앱 > 여행 기록 맵 > 권한 > 사진/미디어를 허용해 주세요.'
        });
      } else {
        setNotice({ type: 'error', message: `갤러리 스캔 실패: ${err.message || err}` });
      }
    } finally {
      scanningRef.current = false;
      setProgressState(IDLE_PROGRESS);
    }
  }, []);

  // One automatic scan per launch, once persisted photos have been loaded and only if the
  // permission is already granted (so a cold start never ambushes the user with a dialog).
  useEffect(() => {
    if (!isNative() || autoScanDoneRef.current || !hydrated) return;
    autoScanDoneRef.current = true;

    checkMediaAccess().then((access) => {
      // A first run has to read everything; later launches only pick up what changed, and do so
      // silently so the user never sees "분석 중..." on a launch with nothing new.
      const incremental = photos.length > 0 && readLastScanAt() > 0;
      if (access.read) handleScanGallery({ incremental, silent: incremental });
    });
  }, [hydrated, photos.length, handleScanGallery]);

  const handleFileInputChange = async (e) => {
    const rawFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (rawFiles.length === 0) return;

    const existing = new Set();
    photos.forEach((p) => {
      if (p.fingerprint) existing.add(p.fingerprint);
    });

    const newFiles = rawFiles.filter((file) => !existing.has(getPhotoFingerprint(file)));
    const skipped = rawFiles.length - newFiles.length;

    if (newFiles.length === 0) {
      setNotice({ type: 'info', message: `선택한 ${rawFiles.length}장이 모두 이미 저장되어 있습니다.` });
      return;
    }

    setProgressState({ active: true, current: 0, total: newFiles.length, skipped, label: '사진 분석 중...' });

    try {
      const parsed = await processInChunks(newFiles, 12, parsePhotoExif, (current, total) => {
        setProgressState((prev) => ({ ...prev, current, total }));
      });
      // Keep only genuine captures — skip screenshots / stripped images with no GPS, camera, or
      // shutter info.
      const real = parsed.filter(isImportablePhoto);
      const droppedNonPhotos = parsed.length - real.length;
      if (real.length > 0) setPhotos((prev) => mergePhotos(prev, real));
      if (droppedNonPhotos > 0 && real.length === 0) {
        setNotice({ type: 'info', message: `위치·기기 정보가 없는 ${droppedNonPhotos}장은 실제 촬영 사진이 아니라 제외했습니다.` });
      }
    } catch (err) {
      console.error('EXIF import failed:', err);
      setNotice({ type: 'error', message: `사진 분석 실패: ${err.message || err}` });
    } finally {
      setProgressState(IDLE_PROGRESS);
    }
  };

  const handleResetData = async () => {
    if (!window.confirm('모든 사진 데이터를 초기화하고 삭제하시겠습니까?')) return;
    setPhotos([]);
    geocodedRef.current.clear();
    clearThumbnailMemoryCache();
    autoScanDoneRef.current = true; // don't immediately rescan what the user just cleared
    try {
      localStorage.removeItem(LAST_SCAN_KEY);
    } catch {}
    await clearPhotosDB();
  };

  const handleFocusMap = useCallback((photo) => {
    setMapFocusPhoto(photo);
    setFocusTrip(null);
    setSelectedPhoto(null);
    setActiveTab('map');
  }, []);

  const handleDeletePhoto = useCallback((photoId) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    setSelectedPhotoIds((prev) => {
      if (!prev.has(photoId)) return prev;
      const next = new Set(prev);
      next.delete(photoId);
      return next;
    });
  }, []);

  const [selectedPhotoIds, setSelectedPhotoIds] = useState(() => new Set());
  const handleToggleSelection = useCallback((photoId) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      next.has(photoId) ? next.delete(photoId) : next.add(photoId);
      return next;
    });
  }, []);
  const handleDeleteSelected = useCallback(() => {
    if (selectedPhotoIds.size === 0) return;
    const idsToDelete = new Set(selectedPhotoIds);
    setPhotos((prev) => prev.filter((photo) => !idsToDelete.has(photo.id)));
    setSelectedPhotoIds(new Set());
  }, [selectedPhotoIds]);

  // Rename persists by trip key so a custom name survives re-clustering (blank clears it).
  const handleRenameTrip = useCallback((tripKey, name) => {
    setTripNames((prev) => {
      const next = { ...prev };
      const trimmed = (name || '').trim();
      if (trimmed) next[tripKey] = trimmed;
      else delete next[tripKey];
      try {
        localStorage.setItem(TRIP_NAMES_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const handleSetHome = useCallback((location) => {
    setHome(location);
    try {
      if (location) localStorage.setItem(HOME_KEY, JSON.stringify(location));
      else localStorage.removeItem(HOME_KEY);
    } catch {}
  }, []);

  // Show only the tapped trip's route on the map (routes are per-trip, not all-at-once).
  const handleFocusTripOnMap = useCallback((trip) => {
    setFocusTrip(trip);
    setSelectedPhoto(null);
    setMapFocusPhoto(null);
    setActiveTab('map');
  }, []);

  const persistIdSet = (key, set) => {
    try { localStorage.setItem(key, JSON.stringify(Array.from(set))); } catch {}
  };

  // Delete an entire trip = remove its photos from the library.
  const handleDeleteTrip = useCallback((trip) => {
    const ids = new Set((trip.photos || []).map((p) => p.id));
    setPhotos((prev) => prev.filter((p) => !ids.has(p.id)));
    setFocusTrip((cur) => (cur?.id === trip.id ? null : cur));
  }, []);

  // Merge this trip into the chronologically-previous one by clearing the split at its first photo.
  const handleMergeTrip = useCallback((trip) => {
    const boundaryId = trip.photos?.[0]?.id;
    if (!boundaryId) return;
    setMergeBoundaries((prev) => {
      const next = new Set(prev); next.add(boundaryId); persistIdSet(TRIP_MERGE_KEY, next); return next;
    });
    setSplitBoundaries((prev) => {
      if (!prev.has(boundaryId)) return prev;
      const next = new Set(prev); next.delete(boundaryId); persistIdSet(TRIP_SPLIT_KEY, next); return next;
    });
  }, []);

  // Split a trip so a new one begins at the given photo.
  const handleSplitTripAt = useCallback((photoId) => {
    if (!photoId) return;
    setSplitBoundaries((prev) => {
      const next = new Set(prev); next.add(photoId); persistIdSet(TRIP_SPLIT_KEY, next); return next;
    });
    setMergeBoundaries((prev) => {
      if (!prev.has(photoId)) return prev;
      const next = new Set(prev); next.delete(photoId); persistIdSet(TRIP_MERGE_KEY, next); return next;
    });
  }, []);

  // Undo manual merges/splits whose boundary photo falls inside this trip → back to auto grouping.
  const handleResetTripGrouping = useCallback((trip) => {
    const ids = new Set((trip.photos || []).map((p) => p.id));
    setMergeBoundaries((prev) => {
      const next = new Set([...prev].filter((id) => !ids.has(id)));
      persistIdSet(TRIP_MERGE_KEY, next); return next;
    });
    setSplitBoundaries((prev) => {
      const next = new Set([...prev].filter((id) => !ids.has(id)));
      persistIdSet(TRIP_SPLIT_KEY, next); return next;
    });
  }, []);

  const gpsCount = photos.reduce((n, p) => n + (p.hasGps ? 1 : 0), 0);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#000' }}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      <header className="header glass-surface">
        <div className="header-title">
          <span className="header-wordmark">여행 기록</span>
          <span className="header-logline">
            {photos.length > 0
              ? <>{photos.length} FRAMES · <span className="hl-amber">{gpsCount} GEOTAGGED</span></>
              : 'FIELD LOG'}
          </span>
        </div>
        <div className="header-actions">
          <button className="header-btn" onClick={() => setShowDownloadModal(true)} aria-label="Android APK 다운로드"><Download size={18} /></button>
          {photos.length > 0 && (
            <button className="header-btn" onClick={handleResetData} aria-label="초기화">
              <Trash2 size={18} />
            </button>
          )}

          <button
            className="header-scan-btn"
            onClick={() => handleScanGallery({ incremental: false })}
            disabled={progressState.active}
            aria-label="갤러리 스캔"
          >
            {progressState.active
              ? <><Loader2 size={15} className="spin-icon" /> 스캔 중</>
              : <><FolderSearch size={15} /> 스캔</>}
          </button>
        </div>
      </header>

      {progressState.active && (
        <div className="floating-banner">
          <div className="banner-label">
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Loader2 size={13} className="spin-icon" />
              {progressState.label || '사진 분석 중...'}
            </span>
            {progressState.total > 0 && (
              <span className="banner-count">
                {progressState.current}/{progressState.total} · {Math.round((progressState.current / progressState.total) * 100)}%
              </span>
            )}
          </div>
          {progressState.skipped > 0 && (
            <div className="banner-note">중복 {progressState.skipped}장 자동 제외됨</div>
          )}
          {progressState.total > 0 && (
            <div className="banner-track">
              <div className="banner-fill" style={{ width: `${(progressState.current / progressState.total) * 100}%` }} />
            </div>
          )}
        </div>
      )}

      {!progressState.active && geocodeProgress.active && (
        <div className="floating-banner">
          <div className="banner-label">
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}><Loader2 size={13} className="spin-icon" />{geocodeProgress.label}</span>
            <span className="banner-count">{geocodeProgress.current}/{geocodeProgress.total}</span>
          </div>
          <div className="banner-track"><div className="banner-fill" style={{ width: `${(geocodeProgress.current / geocodeProgress.total) * 100}%` }} /></div>
        </div>
      )}

      {notice && !progressState.active && (
        <div className="floating-banner" onClick={() => setNotice(null)}>
          <div style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', fontSize: '13px', color: 'var(--paper)', lineHeight: 1.5 }}>
            <AlertTriangle
              size={16}
              style={{ flexShrink: 0, marginTop: '1px' }}
              color={notice.type === 'error' ? 'var(--rust)' : 'var(--amber)'}
            />
            <span>{notice.message}</span>
          </div>
        </div>
      )}

      <div className="content-area">
        {activeTab === 'map' && <MapView photos={photos} trips={trips} onPhotoSelect={setSelectedPhoto} focusPhoto={mapFocusPhoto} focusTrip={focusTrip} onClearFocusTrip={() => setFocusTrip(null)} home={home} onSetHome={handleSetHome} />}
        {activeTab === 'timeline' && <TimelineView trips={trips} onPhotoSelect={setSelectedPhoto} onFocusTripOnMap={handleFocusTripOnMap} onRenameTrip={handleRenameTrip} onDeleteTrip={handleDeleteTrip} onMergeTrip={handleMergeTrip} onSplitTripAt={handleSplitTripAt} onResetGrouping={handleResetTripGrouping} home={home} />}
        {activeTab === 'gallery' && <GalleryView photos={photos} onPhotoSelect={setSelectedPhoto} selectedIds={selectedPhotoIds} onToggleSelection={handleToggleSelection} onSelectionChange={setSelectedPhotoIds} onDeleteSelected={handleDeleteSelected} onClearSelection={() => setSelectedPhotoIds(new Set())} />}
        {activeTab === 'analytics' && <AnalyticsView photos={photos} trips={trips} home={home} />}
      </div>

      <nav className="tab-bar glass-surface">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={24} className="tab-item-icon" />
              <span className="tab-item-label">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {showUpdateModal && <UpdateModal onClose={handleCloseUpdateModal} />}
      {showDownloadModal && <AndroidDownloadModal onClose={() => setShowDownloadModal(false)} />}

      {selectedPhoto && (
        <ExifModal
          photo={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
          onFocusMap={() => handleFocusMap(selectedPhoto)}
          onDeletePhoto={handleDeletePhoto}
        />
      )}
    </div>
  );
}
