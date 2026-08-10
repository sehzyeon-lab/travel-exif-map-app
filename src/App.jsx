import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Map, Clock, Image as ImageIcon, BarChart3, Plus, Trash2, Loader2, RefreshCw, FolderSearch } from 'lucide-react';
import { parsePhotoExif, getPhotoFingerprint } from './utils/exifParser';
import { clusterPhotosIntoTrips, reverseGeocode } from './utils/geoUtils';
import { loadPhotosFromDB, savePhotosToDB, clearPhotosDB } from './utils/storage';
import { scanDeviceCameraFolder } from './utils/autoScanner';

import ExifModal from './components/ExifModal';
import MapView from './components/MapView';
import TimelineView from './components/TimelineView';
import GalleryView from './components/GalleryView';
import AnalyticsView from './components/AnalyticsView';
import UpdateModal, { CURRENT_VERSION } from './components/UpdateModal';

const tabs = [
  { id: 'map', label: '지도', icon: Map },
  { id: 'timeline', label: '기록', icon: Clock },
  { id: 'gallery', label: '갤러리', icon: ImageIcon },
  { id: 'analytics', label: '통계', icon: BarChart3 }
];

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
    if (onProgress) {
      onProgress(Math.min(i + chunkSize, items.length), items.length);
    }
    await new Promise(r => setTimeout(r, 16));
  }
  return results;
}

export default function App() {
  const [photos, setPhotos] = useState([]);
  const [trips, setTrips] = useState([]);
  const [activeTab, setActiveTab] = useState('map');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [progressState, setProgressState] = useState({ active: false, current: 0, total: 0, skipped: 0, label: '사진 분석 중...' });
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [hasAutoScanned, setHasAutoScanned] = useState(false);

  const geocodedRef = useRef(new Set());
  const existingFingerprintsRef = useRef(new Set());
  const fileInputRef = useRef(null);

  // Check update release notes on startup
  useEffect(() => {
    try {
      const seenVersion = localStorage.getItem('seen_app_version');
      if (seenVersion !== CURRENT_VERSION) {
        setShowUpdateModal(true);
      }
    } catch (e) {}
  }, []);

  const handleCloseUpdateModal = () => {
    setShowUpdateModal(false);
    try {
      localStorage.setItem('seen_app_version', CURRENT_VERSION);
    } catch (e) {}
  };

  // Keep track of existing fingerprints
  useEffect(() => {
    const set = new Set();
    photos.forEach(p => {
      if (p.fingerprint) set.add(p.fingerprint);
      if (p.name) set.add(p.name);
    });
    existingFingerprintsRef.current = set;
  }, [photos]);

  // Load stored photos from IndexedDB on mount
  useEffect(() => {
    loadPhotosFromDB().then((stored) => {
      if (stored && stored.length > 0) {
        setPhotos(stored);
        stored.forEach(p => {
          if (p.locationName && p.locationName !== '위치 확인 중...') {
            geocodedRef.current.add(p.id);
          }
        });
      }
    });
  }, []);

  // Save photos to IndexedDB & recompute trips
  useEffect(() => {
    if (photos.length > 0) {
      savePhotosToDB(photos);
    }
    setTrips(clusterPhotosIntoTrips(photos));
  }, [photos]);

  // Background reverse geocoding
  useEffect(() => {
    const toGeocode = photos.filter(
      p => p.hasGps && p.latitude && p.longitude &&
      (!p.locationName || p.locationName === '위치 확인 중...') &&
      !geocodedRef.current.has(p.id)
    );

    if (toGeocode.length === 0) return;

    toGeocode.forEach(p => geocodedRef.current.add(p.id));

    const doGeocode = async () => {
      const updates = {};
      for (const p of toGeocode) {
        try {
          const name = await reverseGeocode(p.latitude, p.longitude);
          updates[p.id] = name;
        } catch (e) {
          updates[p.id] = `${p.latitude.toFixed(2)}°, ${p.longitude.toFixed(2)}°`;
        }
        await new Promise(r => setTimeout(r, 250));
      }
      
      setPhotos(prev => prev.map(p => 
        updates[p.id] ? { ...p, locationName: updates[p.id] } : p
      ));
    };

    doGeocode();
  }, [photos]);

  // Automatic Device Camera Folder Scanner Function
  const handleAutoScanGallery = async () => {
    if (progressState.active) return;

    setProgressState({ active: true, current: 0, total: 0, skipped: 0, label: '⚡ 폰 갤러리 앨범 자동 검색 중...' });

    try {
      const scannedPhotos = await scanDeviceCameraFolder((current, total) => {
        setProgressState({
          active: true,
          current,
          total,
          skipped: 0,
          label: '⚡ 폰 갤러리 사진 초고속 분석 중...'
        });
      });

      if (scannedPhotos && scannedPhotos.length > 0) {
        setPhotos(prev => {
          const updatedMap = new Map();
          scannedPhotos.forEach(p => {
            const key = p.fingerprint || p.name;
            if (key) updatedMap.set(key, p);
          });
          prev.forEach(p => {
            const key = p.fingerprint || p.name;
            if (key && !updatedMap.has(key)) {
              updatedMap.set(key, p);
            }
          });
          return Array.from(updatedMap.values());
        });
      } else if (!Capacitor.isNativePlatform()) {
        // Fallback to file input on web if not native
        handleGalleryPick();
      }
    } catch (err) {
      console.error("Auto scan error:", err);
    } finally {
      setProgressState({ active: false, current: 0, total: 0, skipped: 0, label: '' });
      setHasAutoScanned(true);
    }
  };

  // Automatic scan on native app launch if empty
  useEffect(() => {
    if (Capacitor.isNativePlatform() && !hasAutoScanned && photos.length === 0) {
      handleAutoScanGallery();
    }
  }, [photos, hasAutoScanned]);

  // File Input Handler (Fallback)
  const handleGalleryPick = () => {
    if (progressState.active) return;
    if (fileInputRef.current) {
      fileInputRef.current.value = null;
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = async (e) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0) return;

    const existingMap = new Map();
    photos.forEach(p => {
      if (p.fingerprint) existingMap.set(p.fingerprint, p);
      if (p.name) existingMap.set(p.name, p);
    });

    let skippedCount = 0;
    const newFiles = [];

    for (const file of rawFiles) {
      const fp = getPhotoFingerprint(file);
      const existingPhoto = existingMap.get(fp) || existingMap.get(file.name);
      
      if (existingPhoto && existingPhoto.hasGps) {
        skippedCount++;
      } else {
        newFiles.push(file);
      }
    }

    if (newFiles.length === 0) {
      alert(`선택한 ${rawFiles.length}장의 사진이 모두 이미 저장되어 있어 제외되었습니다.`);
      return;
    }

    setProgressState({ active: true, current: 0, total: newFiles.length, skipped: skippedCount, label: '사진 분석 중...' });

    try {
      const parsedPhotos = await processInChunks(
        newFiles,
        12,
        async (file) => await parsePhotoExif(file),
        (current, total) => {
          setProgressState(prev => ({ ...prev, current, total }));
        }
      );

      if (parsedPhotos.length > 0) {
        setPhotos(prev => {
          const updatedMap = new Map();
          parsedPhotos.forEach(p => {
            const key = p.fingerprint || p.name;
            if (key) updatedMap.set(key, p);
          });
          prev.forEach(p => {
            const key = p.fingerprint || p.name;
            if (key && !updatedMap.has(key)) {
              updatedMap.set(key, p);
            }
          });
          return Array.from(updatedMap.values());
        });
      }
    } catch (err) {
      console.error("EXIF Bulk Import Error:", err);
    } finally {
      setProgressState({ active: false, current: 0, total: 0, skipped: 0, label: '' });
    }
  };

  const handleResetData = () => {
    if (window.confirm("모든 사진 데이터를 초기화하고 삭제하시겠습니까?")) {
      setPhotos([]);
      clearPhotosDB();
      geocodedRef.current.clear();
      existingFingerprintsRef.current.clear();
    }
  };

  const handleFocusMap = useCallback((photo) => {
    setSelectedPhoto(null);
    setActiveTab('map');
  }, []);

  const handleDeletePhoto = useCallback((photoId) => {
    setPhotos(prev => {
      const next = prev.filter(p => p.id !== photoId);
      savePhotosToDB(next);
      return next;
    });
  }, []);

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

      {/* Header */}
      <header className="header glass-surface">
        <div className="header-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>여행 기록</span>
          {photos.length > 0 && (
            <span style={{ fontSize: '11px', background: 'rgba(0,122,255,0.2)', color: 'var(--apple-blue)', padding: '2px 6px', borderRadius: '8px', fontWeight: 600 }}>
              {photos.length}장
            </span>
          )}
        </div>
        <div className="header-actions">
          {photos.length > 0 && (
            <button className="header-btn" onClick={handleResetData} aria-label="초기화">
              <Trash2 size={18} />
            </button>
          )}
          
          {/* Automatic Camera Folder Scan Button */}
          <button
            className="header-btn"
            onClick={handleAutoScanGallery}
            disabled={progressState.active}
            style={{ background: 'var(--apple-blue)', display: 'flex', alignItems: 'center', gap: '4px', padding: '0 12px', width: 'auto', borderRadius: '18px' }}
            aria-label="갤러리 자동 스캔"
          >
            {progressState.active ? (
              <>
                <Loader2 size={16} className="spin-icon" />
                <span style={{ fontSize: '13px', fontWeight: 600 }}>스캔 중</span>
              </>
            ) : (
              <>
                <FolderSearch size={16} />
                <span style={{ fontSize: '13px', fontWeight: 600 }}>갤러리 자동 스캔</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Progress Toast Banner */}
      {progressState.active && (
        <div style={{
          position: 'fixed',
          top: '52px',
          left: '16px',
          right: '16px',
          zIndex: 1500,
          background: 'rgba(28, 28, 30, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          padding: '12px 16px',
          borderRadius: '14px',
          border: '0.5px solid rgba(255,255,255,0.18)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          animation: 'slideUp 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              {progressState.label || '사진 분석 중...'}
            </span>
            {progressState.total > 0 && (
              <span style={{ color: 'var(--apple-blue)' }}>
                {progressState.current} / {progressState.total} 장 ({Math.round((progressState.current / progressState.total) * 100)}%)
              </span>
            )}
          </div>
          {progressState.skipped > 0 && (
            <div style={{ fontSize: '11px', color: 'rgba(235,235,245,0.6)', marginBottom: '6px' }}>
              ℹ️ 중복/스크린샷 {progressState.skipped}장 자동 제외됨
            </div>
          )}
          {progressState.total > 0 && (
            <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{
                width: `${(progressState.current / progressState.total) * 100}%`,
                height: '100%',
                background: 'var(--apple-blue)',
                borderRadius: '2px',
                transition: 'width 0.2s ease'
              }} />
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <div className="content-area">
        {activeTab === 'map' && <MapView photos={photos} trips={trips} onPhotoSelect={setSelectedPhoto} />}
        {activeTab === 'timeline' && <TimelineView trips={trips} onPhotoSelect={setSelectedPhoto} onFocusTripOnMap={() => setActiveTab('map')} />}
        {activeTab === 'gallery' && <GalleryView photos={photos} onPhotoSelect={setSelectedPhoto} />}
        {activeTab === 'analytics' && <AnalyticsView photos={photos} trips={trips} />}
      </div>

      {/* Bottom Tab Bar Navigation */}
      <nav className="tab-bar glass-surface">
        {tabs.map(tab => {
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

      {/* Update Release Notes Modal */}
      {showUpdateModal && (
        <UpdateModal onClose={handleCloseUpdateModal} />
      )}

      {/* Photo Detail Modal */}
      {selectedPhoto && (
        <ExifModal
          photo={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
          onFocusMap={handleFocusMap}
          onDeletePhoto={handleDeletePhoto}
        />
      )}
    </div>
  );
}
