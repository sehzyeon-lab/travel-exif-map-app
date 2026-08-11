import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { Moon, Sun, Maximize2, Compass, LocateFixed, Home, X, Route } from 'lucide-react';

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const MAX_ROUTE_POINTS = 180;

// OpenStreetMap standard renders place names in the local language — Korean inside Korea.
const OSM_TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function sampleRoute(photos) {
  if (photos.length <= MAX_ROUTE_POINTS) return photos;
  const step = Math.ceil(photos.length / MAX_ROUTE_POINTS);
  return photos.filter((_, index) => index % step === 0 || index === photos.length - 1);
}

/** Initial bearing a → b, in degrees clockwise from north. */
function bearing(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

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

export default function MapView({
  photos = [], trips = [], onPhotoSelect,
  focusPhoto = null, focusTrip = null, onClearFocusTrip,
  home = null, onSetHome
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const dataLayerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const overlayLayerRef = useRef(null);
  const locateMarkerRef = useRef(null);
  const [isDark, setIsDark] = useState(false);

  const validPhotos = useMemo(() => photos.filter((p) => p.hasGps), [photos]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return undefined;
    const map = L.map(mapRef.current, {
      zoomControl: false, attributionControl: false,
      center: [36.5, 127.5], zoom: 7,
      preferCanvas: true // vector routes render on canvas — far cheaper when panning
    });
    L.tileLayer(OSM_TILE, {
      maxZoom: 19, crossOrigin: true,
      keepBuffer: 2, updateWhenZooming: false, updateWhenIdle: true // fewer tile churns while moving
    }).addTo(map);
    mapInstanceRef.current = map;

    map.on('contextmenu', (e) => {
      if (window.confirm('이 위치를 집으로 등록할까요?\n(집 근처 사진은 여행에서 자동 제외됩니다)')) {
        onSetHome?.({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      dataLayerRef.current = null;
      routeLayerRef.current = null;
      overlayLayerRef.current = null;
      locateMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Photo pins (clustered). Kept independent of the route layer so toggling a trip focus never
  // rebuilds thousands of markers.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return undefined;
    if (dataLayerRef.current) map.removeLayer(dataLayerRef.current);

    const clusters = L.markerClusterGroup({
      chunkedLoading: true,
      chunkInterval: 60,
      chunkDelay: 20,
      removeOutsideVisibleBounds: true,
      maxClusterRadius: (zoom) => (zoom >= 15 ? 24 : 60),
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
        html: `<div class="photo-pin"><img src="${safeUrl}" alt="" loading="lazy" /></div>`,
        className: 'custom-photo-marker', iconSize: [44, 44], iconAnchor: [22, 22]
      });
      const marker = L.marker([photo.latitude, photo.longitude], { icon: customIcon }).on('click', () => onPhotoSelect?.(photo));
      clusters.addLayer(marker);
    });
    dataLayerRef.current = clusters;
    clusters.addTo(map);
    return undefined;
  }, [validPhotos, onPhotoSelect]);

  // Route + arrows for the FOCUSED trip only. No focus → no route (keeps the map clean and fast).
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return undefined;
    if (routeLayerRef.current) { map.removeLayer(routeLayerRef.current); routeLayerRef.current = null; }
    if (!focusTrip) return undefined;

    const route = sampleRoute((focusTrip.photos || []).filter((p) => p.hasGps));
    if (route.length < 2) return undefined;

    const layer = L.layerGroup();
    routeLayerRef.current = layer;
    const latlngs = route.map((p) => ({ lat: p.latitude, lng: p.longitude }));
    L.polyline(latlngs.map((p) => [p.lat, p.lng]), {
      color: '#F2A03D', weight: 3.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false
    }).addTo(layer);
    addRouteArrows(layer, latlngs);
    layer.addTo(map);

    map.fitBounds(L.latLngBounds(latlngs.map((p) => [p.lat, p.lng])), { padding: [60, 60], maxZoom: 15 });
    return undefined;
  }, [focusTrip]);

  // Home marker (own layer, survives other re-renders).
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return undefined;
    if (overlayLayerRef.current) map.removeLayer(overlayLayerRef.current);
    if (!home) { overlayLayerRef.current = null; return undefined; }

    const layer = L.layerGroup();
    overlayLayerRef.current = layer;
    const icon = L.divIcon({ className: 'home-marker', html: '<div class="home-marker-glyph">🏠</div>', iconSize: [34, 34], iconAnchor: [17, 17] });
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
    onClearFocusTrip?.();
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

      {focusTrip && (
        <div className="map-focus-chip">
          <Route size={14} />
          <span className="text-truncate">{focusTrip.title}</span>
          <button onClick={() => onClearFocusTrip?.()} aria-label="경로 지우기"><X size={14} /></button>
        </div>
      )}

      <div className="map-floating-controls">
        <button className="map-control-btn" onClick={() => setIsDark((v) => !v)} aria-label="지도 테마">{isDark ? <Sun size={20} /> : <Moon size={20} />}</button>
        <button className="map-control-btn" onClick={locateMe} aria-label="현재 위치"><LocateFixed size={20} /></button>
        <button className={`map-control-btn ${home ? 'active' : ''}`} onClick={() => {
          if (home && mapInstanceRef.current) mapInstanceRef.current.flyTo([home.lat, home.lng], 14, { duration: 0.5 });
          else window.alert('지도를 길게 눌러(또는 마우스 우클릭) 집 위치를 등록할 수 있습니다.');
        }} aria-label="집 위치"><Home size={20} /></button>
        {!isEmpty && <button className="map-control-btn" onClick={fitBounds} aria-label="전체 보기"><Maximize2 size={20} /></button>}
      </div>

      {focusTrip && <div className="map-legend">— 이동 경로 · ▲ 진행 방향 · 시간순</div>}
    </div>
  );
}
