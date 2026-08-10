import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { Layers, Route, Maximize2, Compass, Grid2X2 } from 'lucide-react';

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const MAX_ROUTE_POINTS = 180;

function sampleRoute(photos) {
  if (photos.length <= MAX_ROUTE_POINTS) return photos;
  const step = Math.ceil(photos.length / MAX_ROUTE_POINTS);
  return photos.filter((_, index) => index % step === 0 || index === photos.length - 1);
}

function coverageCells(photos) {
  const cells = new Map();
  photos.forEach((photo) => {
    // A 0.05° cell is a readable, intentionally approximate visited-area indicator.
    const key = `${(Math.round(photo.latitude * 20) / 20).toFixed(2)},${(Math.round(photo.longitude * 20) / 20).toFixed(2)}`;
    const cell = cells.get(key) || { lat: 0, lng: 0, count: 0 };
    cell.lat += photo.latitude;
    cell.lng += photo.longitude;
    cell.count += 1;
    cells.set(key, cell);
  });
  return Array.from(cells.values()).map((cell) => ({ ...cell, lat: cell.lat / cell.count, lng: cell.lng / cell.count }));
}

export default function MapView({ photos = [], trips = [], onPhotoSelect, focusPhoto = null }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const dataLayerRef = useRef(null);
  const [isDark, setIsDark] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showCoverage, setShowCoverage] = useState(true);

  const validPhotos = useMemo(() => photos.filter((p) => p.hasGps), [photos]);
  const darkTile = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const lightTile = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return undefined;
    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false, center: [36.5, 127.5], zoom: 5 });
    L.tileLayer(darkTile).addTo(map);
    mapInstanceRef.current = map;
    return () => {
      map.remove();
      mapInstanceRef.current = null;
      dataLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) layer.setUrl(isDark ? darkTile : lightTile);
    });
  }, [isDark]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return undefined;
    if (dataLayerRef.current) map.removeLayer(dataLayerRef.current);

    const layer = L.layerGroup();
    dataLayerRef.current = layer;

    if (showCoverage) {
      coverageCells(validPhotos).forEach((cell) => {
        L.circle([cell.lat, cell.lng], {
          radius: 3000 + Math.min(cell.count, 30) * 350,
          color: '#30D158', weight: 1, fillColor: '#30D158', fillOpacity: Math.min(0.12 + cell.count * 0.025, 0.45), interactive: false
        }).addTo(layer);
      });
    }

    if (showRoutes) {
      trips.forEach((trip) => {
        const route = sampleRoute((trip.photos || []).filter((p) => p.hasGps));
        if (route.length > 1) {
          L.polyline(route.map((p) => [p.latitude, p.longitude]), {
            color: '#007AFF', weight: 2.5, dashArray: '6, 8', opacity: 0.8, interactive: false
          }).addTo(layer);
        }
      });
    }

    const clusters = L.markerClusterGroup({
      chunkedLoading: true,
      chunkInterval: 60,
      chunkDelay: 20,
      removeOutsideVisibleBounds: true,
      maxClusterRadius: 55,
      spiderfyOnMaxZoom: false,
      iconCreateFunction: (cluster) => L.divIcon({
        html: `<div class="marker-cluster-count">${cluster.getChildCount()}</div>`,
        className: 'travel-marker-cluster', iconSize: [42, 42]
      })
    });
    validPhotos.forEach((photo) => {
      const safeUrl = String(photo.url || TRANSPARENT_PIXEL).replace(/"/g, '&quot;');
      const customIcon = L.divIcon({
        html: `<div class="photo-pin"><img src="${safeUrl}" alt="" /></div>`,
        className: 'custom-photo-marker', iconSize: [44, 44], iconAnchor: [22, 22]
      });
      const marker = L.marker([photo.latitude, photo.longitude], { icon: customIcon }).on('click', () => onPhotoSelect?.(photo));
      clusters.addLayer(marker);
    });
    layer.addLayer(clusters);
    layer.addTo(map);
    return undefined;
  }, [validPhotos, trips, showRoutes, showCoverage, onPhotoSelect]);

  useEffect(() => {
    if (!focusPhoto?.hasGps || !mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([focusPhoto.latitude, focusPhoto.longitude], Math.max(mapInstanceRef.current.getZoom(), 15), { duration: 0.45 });
  }, [focusPhoto]);

  const fitBounds = () => {
    if (!mapInstanceRef.current || validPhotos.length === 0) return;
    mapInstanceRef.current.fitBounds(L.latLngBounds(validPhotos.map((p) => [p.latitude, p.longitude])), { padding: [50, 50] });
  };
  const isEmpty = validPhotos.length === 0;

  return (
    <div className="map-view-container">
      <div ref={mapRef} className="map-full-screen" />
      {isEmpty && <div className="map-empty-state map-empty-overlay"><div className="glass-surface"><Compass size={48} className="empty-icon" /><p>지도에 표시할 GPS 사진이 없습니다.</p></div></div>}
      {!isEmpty && <div className="map-floating-controls">
        <button className="map-control-btn" onClick={() => setIsDark((value) => !value)} aria-label="지도 테마"><Layers size={20} /></button>
        <button className={`map-control-btn ${showRoutes ? 'active' : ''}`} onClick={() => setShowRoutes((value) => !value)} aria-label="이동 순서선"><Route size={20} /></button>
        <button className={`map-control-btn ${showCoverage ? 'active' : ''}`} onClick={() => setShowCoverage((value) => !value)} aria-label="방문 지역"><Grid2X2 size={20} /></button>
        <button className="map-control-btn" onClick={fitBounds} aria-label="전체 보기"><Maximize2 size={20} /></button>
      </div>}
      {!isEmpty && <div className="map-legend">파란 점선: 사진 촬영 시간순 연결선<br />초록 영역: 방문 밀집 지역</div>}
    </div>
  );
}
