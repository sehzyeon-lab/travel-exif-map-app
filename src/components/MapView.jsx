import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers, Route, Maximize2, Compass } from 'lucide-react';

export default function MapView({ photos = [], trips = [], onPhotoSelect }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  
  const [isDark, setIsDark] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  
  const validPhotos = photos.filter(p => p.hasGps);
  
  const darkTile = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const lightTile = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  useEffect(() => {
    if (!mapRef.current) return;
    
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        center: [36.5, 127.5],
        zoom: 5
      });
      
      L.tileLayer(isDark ? darkTile : lightTile).addTo(mapInstanceRef.current);
    }
    
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    
    mapInstanceRef.current.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        layer.setUrl(isDark ? darkTile : lightTile);
      }
    });
  }, [isDark]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    
    // Clear existing layers
    markersRef.current.forEach(m => m.remove());
    polylinesRef.current.forEach(p => p.remove());
    markersRef.current = [];
    polylinesRef.current = [];
    
    if (showRoutes && trips) {
      trips.forEach(trip => {
        if (!trip.photos) return;
        const coords = trip.photos.filter(p => p.hasGps).map(p => [p.latitude, p.longitude]);
        if (coords.length > 1) {
          const polyline = L.polyline(coords, {
            color: '#007AFF',
            weight: 2.5,
            dashArray: '6, 8'
          }).addTo(map);
          polylinesRef.current.push(polyline);
        }
      });
    }
    
    validPhotos.forEach((photo, idx) => {
      const safeUrl = String(photo.url || '').replace(/"/g, '&quot;');
      const iconHtml = `<div class="photo-pin"><img src="${safeUrl}" alt="" /><div class="pin-badge">${idx+1}</div></div>`;
      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-photo-marker',
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });
      
      const marker = L.marker([photo.latitude, photo.longitude], { icon: customIcon })
        .addTo(map)
        .on('click', () => {
          if (onPhotoSelect) onPhotoSelect(photo);
        });
        
      markersRef.current.push(marker);
    });
  }, [photos, trips, showRoutes, isDark, onPhotoSelect]);

  const fitBounds = () => {
    if (!mapInstanceRef.current || validPhotos.length === 0) return;
    const bounds = L.latLngBounds(validPhotos.map(p => [p.latitude, p.longitude]));
    mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
  };

  if (validPhotos.length === 0) {
    return (
      <div className="map-empty-state">
        <div className="glass-surface">
          <Compass size={48} className="empty-icon" />
          <p>지도에 표시할 위치 정보가 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="map-view-container">
      <div ref={mapRef} className="map-full-screen" />
      <div className="map-floating-controls">
        <button className="map-control-btn" onClick={() => setIsDark(!isDark)}>
          <Layers size={20} />
        </button>
        <button className="map-control-btn" onClick={() => setShowRoutes(!showRoutes)}>
          <Route size={20} color={showRoutes ? '#007AFF' : 'currentColor'} />
        </button>
        <button className="map-control-btn" onClick={fitBounds}>
          <Maximize2 size={20} />
        </button>
      </div>
    </div>
  );
}
