import React from 'react';
import { Globe2, MapPin, Navigation, Camera, Mountain, Cpu } from 'lucide-react';

export default function AnalyticsView({ photos = [], trips = [] }) {
  if (!photos || photos.length === 0) {
    return (
      <div className="analytics-empty-state">
        <Navigation size={48} className="empty-icon" />
        <p>분석할 데이터가 없습니다.</p>
      </div>
    );
  }

  // Only GPS-backed records contribute to travel analytics. Non-location photos remain available
  // in the gallery, but must not distort place, route, or distance figures.
  const locationPhotos = photos.filter((p) => p.hasGps);
  const totalTrips = trips ? trips.length : 0;
  const totalPhotos = locationPhotos.length;
  
  let totalDistance = 0;
  if (trips) {
    totalDistance = trips.reduce((sum, trip) => sum + (parseFloat(trip.totalDistanceKm) || 0), 0);
  }
  
  const uniqueLocations = new Set(locationPhotos.filter(p => p.locationName).map(p => p.locationName));
  const locationCount = uniqueLocations.size;

  let maxAltitude = 0;
  locationPhotos.forEach(p => {
    if (p.altitude && p.altitude > maxAltitude) {
      maxAltitude = p.altitude;
    }
  });

  const cameraCounts = {};
  locationPhotos.forEach(p => {
    const make = p.cameraMake || 'Unknown';
    cameraCounts[make] = (cameraCounts[make] || 0) + 1;
  });
  const sortedCameras = Object.entries(cameraCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div className="analytics-view">
      <div className="section-header">
        <h2>여정 통계</h2>
      </div>
      
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon-wrap bg-blue"><Globe2 size={24} color="#007AFF" /></div>
          <div className="stat-value">{locationCount}</div>
          <div className="stat-label">지역</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrap bg-green"><MapPin size={24} color="#34C759" /></div>
          <div className="stat-value">{totalTrips}</div>
          <div className="stat-label">여행</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrap bg-purple"><Navigation size={24} color="#AF52DE" /></div>
          <div className="stat-value">{totalDistance.toFixed(1)}</div>
          <div className="stat-label">거리 km</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrap bg-orange"><Camera size={24} color="#FF9500" /></div>
          <div className="stat-value">{totalPhotos}</div>
          <div className="stat-label">사진</div>
        </div>
      </div>

      <div className="info-card altitude-card">
        <div className="info-card-header">
          <div className="icon-circle bg-teal"><Mountain size={20} color="#5AC8FA" /></div>
          <h3>최고 고도</h3>
        </div>
        <div className="info-card-content">
          <span className="big-number">{Math.round(maxAltitude)}</span>
          <span className="unit">m</span>
        </div>
      </div>

      <div className="info-card camera-card">
        <div className="info-card-header">
          <div className="icon-circle"><Cpu size={20} /></div>
          <h3>기기별 사진 비율</h3>
        </div>
        <div className="camera-list">
          {sortedCameras.map(([make, count], idx) => {
            const percent = Math.round((count / totalPhotos) * 100);
            return (
              <div key={idx} className="camera-item">
                <div className="camera-info">
                  <span className="camera-make">{make}</span>
                  <span className="camera-percent">{percent}%</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${percent}%` }}></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
