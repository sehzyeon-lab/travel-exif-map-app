import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { Moon, Sun, Route, Maximize2, Compass, LocateFixed, Home } from 'lucide-react';

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const MAX_ROUTE_POINTS = 180;

// OpenStreetMap standard renders place names in the local language — Korean inside Korea — which
// CartoDB's English-only basemaps do not. Dark mode is a CSS filter over the same tiles so labels
// stay Korean in both themes.
const OSM_TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function sampleRoute(photos) {
  if (photos.length <= MAX_ROUTE_POINTS) return photos;
  const step = Math.ceil(photos.length / MAX_ROUTE_POINTS);
  return photos.filter((_, index) => index % step === 0 || index === photos.length - 1);
}

/** Initial bearing from a → b, in degrees clockwise from north. */
function bearing(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Drops a handful of arrowheads along a route so the direction of travel reads at a glance. */
function addRouteArrows(layer, points) {
  if (points.length < 2) return;
  const maxArrows = 6;
  const stride = Math.max(1, Math.floor((points.length - 1) / maxArrows));
  for (let i = stride; i < points.length; i += stride) {
    const a = points[i - 1];
    const b = points[i];
    const deg = bearing(a, b);
    const mid = [(a.lat + b.lat) / 2, (a.lng + b.lng) / 2];
    const icon = L.divIcon({
      className: 'route-arrow',
      html: `<div class="route-arrow-glyph" style="transform:rotate(${deg}deg)">▲</div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
    L.marker(mid, { icon, interactive: false, keyboard: false }).addTo(layer);
  }
}

export default function MapView({ photos = [], trips = [], onPhotoSelect, focusPhoto = null, home = null, onSetHome }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const dataLayerRef = useRef(null);
  const overlayLayerRef = useRef(null);
  const locateMarkerRef = useRef(null);
  const [isDark, setIsDark] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);

  const validPhotos = useMemo(() => photos.filter((p) => p.hasGps), [photos]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return undefined;
    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false, center: [36.5, 127.5], zoom: 7 });
    L.tileLayer(OSM_TILE, { maxZoom: 19, crossOrigin: true }).addTo(map);
    mapInstanceRef.current = map;

    // Long-press (mobile) / right-click (desktop) drops a home pin at that spot.
    map.on('contextmenu', (e) => {
      if (window.confirm('이 위치를 집으로 등록할까요?\n(집 근처 사진은 여행에서 자동 제외됩니다)')) {
        onSetHome?.({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      dataLayerRef.current = null;
      overlayLayerRef.current = null;
      locateMarkerRef.current = null;
    };
    // onSetHome is stable (useCallback); the map must be built exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Photo pins + routes.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return undefined;
    if (dataLayerRef.current) map.removeLayer(dataLayerRef.current);

    const layer = L.layerGroup();
    dataLayerRef.current = layer;

    if (showRoutes) {
      trips.forEach((trip) => {
        const route = sampleRoute((trip.photos || []).filter((p) => p.hasGps));
        if (route.length > 1) {
          const latlngs = route.map((p) => ({ lat: p.latitude, lng: p.longitude }));
          L.polyline(latlngs.map((p) => [p.lat, p.lng]), {
            color: '#F2A03D', weight: 3, opacity: 0.92, lineCap: 'round', lineJoin: 'round', interactive: false
          }).addTo(layer);
          addRouteArrows(layer, latlngs);
        }
      });
    }

    const clusters = L.markerClusterGroup({
      chunkedLoading: true,
      chunkInterval: 60,
      chunkDelay: 20,
      removeOutsideVisibleBounds: true,
      maxClusterRadius: (zoom) => (zoom >= 15 ? 20 : 55),
      // At the deepest zoom, break clusters apart so individual photos always surface — this is
      // what stops a "number circle" from lingering when you zoom all the way in.
      disableClusteringAtZoom: 18,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
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
  }, [validPhotos, trips, showRoutes, onPhotoSelect]);

  // Home marker (its own layer so it survives photo/route re-renders).
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return undefined;
    if (overlayLayerRef.current) map.removeLayer(overlayLayerRef.current);
    if (!home) { overlayLayerRef.current = null; return undefined; }

    const layer = L.layerGroup();
    overlayLayerRef.current = layer;
    const icon = L.divIcon({
      className: 'home-marker',
      html: '<div class="home-marker-glyph">🏠</div>',
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });
    L.marker([home.lat, home.lng], { icon }).addTo(layer);
    layer.addTo(map);
    return undefined;
  }, [home]);

  useEffect(() => {
    if (!focusPhoto?.hasGps || !mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([focusPhoto.latitude, focusPhoto.longitude], Math.max(mapInstanceRef.current.getZoom(), 15), { duration: 0.45 });
  }, [focusPhoto]);

  const fitBounds = () => {
    if (!mapInstanceRef.current || validPhotos.length === 0) return;
    mapInstanceRef.current.fitBounds(L.latLngBounds(validPhotos.map((p) => [p.latitude, p.longitude])), { padding: [50, 50] });
  };

  const locateMe = () => {
    const map = mapInstanceRef.current;
    if (!map || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (locateMarkerRef.current) map.removeLayer(locateMarkerRef.current);
        const icon = L.divIcon({ className: 'locate-marker', html: '<div class="locate-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
        locateMarkerRef.current = L.marker([latitude, longitude], { icon }).addTo(map);
        map.flyTo([latitude, longitude], Math.max(map.getZoom(), 14), { duration: 0.5 });
      },
      () => window.alert('현재 위치를 가져올 수 없습니다. 위치 권한을 확인해 주세요.'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const isEmpty = validPhotos.length === 0;

  return (
    <div className={`map-view-container ${isDark ? 'map-dark' : ''}`}>
      <div ref={mapRef} className="map-full-screen" />
      {!isEmpty && (
        <div className="map-coord-frame" aria-hidden="true">
          <span className="corner tl" /><span className="corner tr" />
          <span className="corner bl" /><span className="corner br" />
          <span className="frame-label">여행 지도 · TRAVEL PLOT</span>
        </div>
      )}
      {isEmpty && <div className="map-empty-state map-empty-overlay"><div className="glass-surface"><Compass size={48} className="empty-icon" /><p>지도에 표시할 GPS 사진이 없습니다.</p></div></div>}
      <div className="map-floating-controls">
        <button className="map-control-btn" onClick={() => setIsDark((v) => !v)} aria-label="지도 테마">{isDark ? <Sun size={20} /> : <Moon size={20} />}</button>
        {!isEmpty && <button className={`map-control-btn ${showRoutes ? 'active' : ''}`} onClick={() => setShowRoutes((v) => !v)} aria-label="이동 순서선"><Route size={20} /></button>}
        <button className="map-control-btn" onClick={locateMe} aria-label="현재 위치"><LocateFixed size={20} /></button>
        <button className={`map-control-btn ${home ? 'active' : ''}`} onClick={() => {
          if (home && mapInstanceRef.current) mapInstanceRef.current.flyTo([home.lat, home.lng], 14, { duration: 0.5 });
          else window.alert('지도를 길게 눌러(또는 마우스 우클릭) 집 위치를 등록할 수 있습니다.');
        }} aria-label="집 위치"><Home size={20} /></button>
        {!isEmpty && <button className="map-control-btn" onClick={fitBounds} aria-label="전체 보기"><Maximize2 size={20} /></button>}
      </div>
      {!isEmpty && showRoutes && <div className="map-legend">— 이동 경로 · ▲ 진행 방향 · 시간순</div>}
    </div>
  );
}
