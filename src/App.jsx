import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Map, Clock, Image as ImageIcon, BarChart3, Plus, Trash2 } from 'lucide-react';
import { parsePhotoExif } from './utils/exifParser';
import { clusterPhotosIntoTrips, reverseGeocode } from './utils/geoUtils';

import ExifModal from './components/ExifModal';
import MapView from './components/MapView';
import TimelineView from './components/TimelineView';
import GalleryView from './components/GalleryView';
import AnalyticsView from './components/AnalyticsView';

const STORAGE_KEY = 'travel_exif_photos_v1';

const tabs = [
  { id: 'map', label: '지도', icon: Map },
  { id: 'timeline', label: '기록', icon: Clock },
  { id: 'gallery', label: '갤러리', icon: ImageIcon },
  { id: 'analytics', label: '통계', icon: BarChart3 }
];

export default function App() {
  const [photos, setPhotos] = useState([]);
  const [trips, setTrips] = useState([]);
  const [activeTab, setActiveTab] = useState('map');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const geocodedRef = useRef(new Set());

  // Load photos from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.length > 0) {
          setPhotos(parsed);
          // Mark already geocoded photos
          parsed.forEach(p => {
            if (p.locationName && p.locationName !== '위치 확인 중...') {
              geocodedRef.current.add(p.id);
            }
          });
        }
      }
    } catch (e) {
      console.error("Failed to load stored photos", e);
    }
  }, []);

  // Save photos & recompute trips
  useEffect(() => {
    if (photos.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
      } catch (e) {
        console.warn('Storage save error:', e);
      }
    }
    setTrips(clusterPhotosIntoTrips(photos));
  }, [photos]);

  // Geocode photos with missing location - runs only once per photo
  useEffect(() => {
    const toGeocode = photos.filter(
      p => p.hasGps && p.latitude && p.longitude &&
      (!p.locationName || p.locationName === '위치 확인 중...') &&
      !geocodedRef.current.has(p.id)
    );

    if (toGeocode.length === 0) return;

    // Mark as being geocoded to prevent re-runs
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
      }
      
      setPhotos(prev => prev.map(p => 
        updates[p.id] ? { ...p, locationName: updates[p.id] } : p
      ));
    };

    doGeocode();
  }, [photos]);

  const handleGalleryPick = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      if (Capacitor.isNativePlatform()) {
        // Native: use Capacitor Camera plugin
        const result = await Camera.pickImages({
          quality: 90,
          limit: 30
        });

        const newPhotos = [];
        for (const img of result.photos) {
          try {
            const response = await fetch(img.webPath);
            const blob = await response.blob();
            const file = new File(
              [blob],
              `photo_${Date.now()}.${img.format || 'jpg'}`,
              { type: blob.type || 'image/jpeg' }
            );
            const exifData = await parsePhotoExif(file);
            if (exifData) newPhotos.push(exifData);
          } catch (e) {
            console.error("Error processing native image:", e);
          }
        }

        if (newPhotos.length > 0) {
          setPhotos(prev => [...newPhotos, ...prev]);
        }
      } else {
        // Web fallback: file input
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/*';
        input.onchange = async (e) => {
          const files = Array.from(e.target.files);
          const newPhotos = [];
          for (const file of files) {
            try {
              const exifData = await parsePhotoExif(file);
              if (exifData) newPhotos.push(exifData);
            } catch (err) {
              console.error("EXIF parse error:", err);
            }
          }
          if (newPhotos.length > 0) {
            setPhotos(prev => [...newPhotos, ...prev]);
          }
          setIsProcessing(false);
        };
        input.click();
        return; // isProcessing cleared in onchange
      }
    } catch (e) {
      console.error("Gallery pick error:", e);
    }

    setIsProcessing(false);
  };

  const handleResetData = () => {
    if (window.confirm("모든 사진 데이터를 삭제하시겠습니까?")) {
      setPhotos([]);
      localStorage.removeItem(STORAGE_KEY);
      geocodedRef.current.clear();
    }
  };

  const handleFocusMap = useCallback((photo) => {
    setSelectedPhoto(null);
    setActiveTab('map');
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#000' }}>
      {/* Header */}
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
            disabled={isProcessing}
            style={{ background: 'var(--apple-blue)' }}
            aria-label="사진 추가"
          >
            <Plus size={18} />
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="content-area">
        {activeTab === 'map' && <MapView photos={photos} trips={trips} onPhotoSelect={setSelectedPhoto} />}
        {activeTab === 'timeline' && <TimelineView trips={trips} onPhotoSelect={setSelectedPhoto} onFocusTripOnMap={() => setActiveTab('map')} />}
        {activeTab === 'gallery' && <GalleryView photos={photos} onPhotoSelect={setSelectedPhoto} />}
        {activeTab === 'analytics' && <AnalyticsView photos={photos} trips={trips} />}
      </div>

      {/* Bottom Tab Bar */}
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
        />
      )}
    </div>
  );
}
