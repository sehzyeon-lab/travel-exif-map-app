import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Map, Clock, Image as ImageIcon, BarChart3, Plus, Trash2, Loader2 } from 'lucide-react';
import { parsePhotoExif } from './utils/exifParser';
import { clusterPhotosIntoTrips, reverseGeocode } from './utils/geoUtils';
import { loadPhotosFromDB, savePhotosToDB, clearPhotosDB } from './utils/storage';

import ExifModal from './components/ExifModal';
import MapView from './components/MapView';
import TimelineView from './components/TimelineView';
import GalleryView from './components/GalleryView';
import AnalyticsView from './components/AnalyticsView';

const tabs = [
  { id: 'map', label: '지도', icon: Map },
  { id: 'timeline', label: '기록', icon: Clock },
  { id: 'gallery', label: '갤러리', icon: ImageIcon },
  { id: 'analytics', label: '통계', icon: BarChart3 }
];

// Process items in parallel chunks to prevent UI blocking (optimized for 2000+ photos)
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
    // Yield execution to main thread for 16ms so UI stays responsive
    await new Promise(r => setTimeout(r, 16));
  }
  return results;
}

export default function App() {
  const [photos, setPhotos] = useState([]);
  const [trips, setTrips] = useState([]);
  const [activeTab, setActiveTab] = useState('map');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [progressState, setProgressState] = useState({ active: false, current: 0, total: 0 });
  const geocodedRef = useRef(new Set());

  // Load photos from IndexedDB on mount
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

  // Reverse geocode missing locations in background without freezing
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
        await new Promise(r => setTimeout(r, 300));
      }
      
      setPhotos(prev => prev.map(p => 
        updates[p.id] ? { ...p, locationName: updates[p.id] } : p
      ));
    };

    doGeocode();
  }, [photos]);

  // Bulk Gallery Import Handler (Unlimited selection + Non-lagging + Screenshot filtering)
  const handleGalleryPick = async () => {
    if (progressState.active) return;

    try {
      if (Capacitor.isNativePlatform()) {
        const result = await Camera.pickImages({
          quality: 85,
          limit: 5000 // 5000 max images allows selecting all photos in Android Photo Picker
        });

        if (!result.photos || result.photos.length === 0) return;

        setProgressState({ active: true, current: 0, total: result.photos.length });

        const newPhotos = await processInChunks(
          result.photos,
          6, // 6 parallel workers for fast processing
          async (img) => {
            const response = await fetch(img.webPath);
            const blob = await response.blob();
            const file = new File(
              [blob],
              `photo_${Date.now()}_${Math.random().toString(36).substring(7)}.${img.format || 'jpg'}`,
              { type: blob.type || 'image/jpeg' }
            );
            return await parsePhotoExif(file);
          },
          (current, total) => {
            setProgressState({ active: true, current, total });
          }
        );

        if (newPhotos.length > 0) {
          setPhotos(prev => [...newPhotos, ...prev]);
        }
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/*';
        input.onchange = async (e) => {
          const files = Array.from(e.target.files);
          if (files.length === 0) return;

          setProgressState({ active: true, current: 0, total: files.length });

          const newPhotos = await processInChunks(
            files,
            6,
            async (file) => await parsePhotoExif(file),
            (current, total) => {
              setProgressState({ active: true, current, total });
            }
          );

          if (newPhotos.length > 0) {
            setPhotos(prev => [...newPhotos, ...prev]);
          }
          setProgressState({ active: false, current: 0, total: 0 });
        };
        input.click();
        return;
      }
    } catch (e) {
      console.error("Gallery pick error:", e);
    } finally {
      setProgressState({ active: false, current: 0, total: 0 });
    }
  };

  const handleResetData = () => {
    if (window.confirm("모든 사진 데이터를 초기화하고 삭제하시겠습니까?")) {
      setPhotos([]);
      clearPhotosDB();
      geocodedRef.current.clear();
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
      {/* Top Header */}
      <header className="header glass-surface">
        <div className="header-title">여행 기록</div>
        <div className="header-actions">
          {photos.length > 0 && (
            <button className="header-btn" onClick={handleResetData} aria-label="초기화">
              <Trash2 size={18} />
            </button>
          )}
          <button
            className="header-btn"
            onClick={handleGalleryPick}
            disabled={progressState.active}
            style={{ background: 'var(--apple-blue)' }}
            aria-label="사진 추가"
          >
            {progressState.active ? <Loader2 size={18} className="spin-icon" /> : <Plus size={18} />}
          </button>
        </div>
      </header>

      {/* Progress Toast Banner when importing bulk photos */}
      {progressState.active && (
        <div style={{
          position: 'fixed',
          top: '52px',
          left: '16px',
          right: '16px',
          zIndex: 1500,
          background: 'rgba(28, 28, 30, 0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          padding: '12px 16px',
          borderRadius: '14px',
          border: '0.5px solid rgba(255,255,255,0.18)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          animation: 'slideUp 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              사진 분석 중... (스크린샷 자동 제외)
            </span>
            <span style={{ color: 'var(--apple-blue)' }}>
              {progressState.current} / {progressState.total} 장 ({Math.round((progressState.current / progressState.total) * 100)}%)
            </span>
          </div>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              width: `${(progressState.current / progressState.total) * 100}%`,
              height: '100%',
              background: 'var(--apple-blue)',
              borderRadius: '2px',
              transition: 'width 0.2s ease'
            }} />
          </div>
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
