import React, { useMemo } from 'react';
import { Globe2, MapPin, Navigation, Camera, Mountain, Cpu, CalendarRange, Plane, Home, Trophy } from 'lucide-react';

/** country / city / district from a geocoded "대한민국 서울특별시 종로구" string. */
function splitPlace(name) {
  if (!name || name === '위치 확인 중...' || name === '위치 정보 없음') return {};
  const parts = name.split(' ').filter(Boolean);
  return { country: parts[0], city: parts[1], full: parts.slice(0, 2).join(' ') || name };
}

const MONTH_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

export default function AnalyticsView({ photos = [], trips = [], home = null }) {
  const stats = useMemo(() => {
    const locationPhotos = photos.filter((p) => p.hasGps);
    const totalDistance = trips.reduce((sum, t) => sum + (parseFloat(t.totalDistanceKm) || 0), 0);

    const countries = new Set();
    const cities = new Set();
    const regionCounts = {};
    let maxAltitude = 0;
    const cameraCounts = {};
    let earliest = Infinity;
    let latest = -Infinity;

    // 12-month rolling activity histogram, oldest → newest.
    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, year: d.getFullYear(), month: d.getMonth(), count: 0 });
    }
    const monthIndex = new Map(months.map((m, i) => [m.key, i]));

    for (const p of locationPhotos) {
      const { country, city, full } = splitPlace(p.locationName);
      if (country) countries.add(country);
      if (city) cities.add(`${country} ${city}`);
      if (full) regionCounts[full] = (regionCounts[full] || 0) + 1;
      if (p.altitude && p.altitude > maxAltitude) maxAltitude = p.altitude;
      const make = p.cameraMake || 'Unknown';
      cameraCounts[make] = (cameraCounts[make] || 0) + 1;
      if (p.timestamp < earliest) earliest = p.timestamp;
      if (p.timestamp > latest) latest = p.timestamp;
      const d = new Date(p.timestamp);
      const idx = monthIndex.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (idx != null) months[idx].count++;
    }

    const sortedCameras = Object.entries(cameraCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topRegions = Object.entries(regionCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const overnightTrips = trips.filter((t) => t.kind === 'trip');
    const outings = trips.filter((t) => t.kind !== 'trip');
    const longestTrip = trips.reduce((best, t) => (t.durationDays > (best?.durationDays || 0) ? t : best), null);
    const farthest = home
      ? trips.reduce((max, t) => Math.max(max, t.distanceFromHome || 0), 0)
      : null;

    const span = (earliest !== Infinity && latest !== -Infinity)
      ? { start: new Date(earliest), end: new Date(latest) }
      : null;

    return {
      totalPhotos: locationPhotos.length,
      totalTrips: trips.length,
      totalDistance,
      countryCount: countries.size,
      cityCount: cities.size,
      maxAltitude,
      sortedCameras,
      topRegions,
      months,
      overnightCount: overnightTrips.length,
      outingCount: outings.length,
      longestTrip,
      farthest,
      span
    };
  }, [photos, trips, home]);

  if (!photos || photos.length === 0) {
    return (
      <div className="analytics-empty-state">
        <Navigation size={48} className="empty-icon" />
        <p>분석할 데이터가 없습니다.</p>
      </div>
    );
  }

  const maxMonth = Math.max(1, ...stats.months.map((m) => m.count));
  const fmt = (d) => d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short' });

  return (
    <div className="analytics-view">
      <div className="section-header"><h2>여정 통계</h2></div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon-wrap bg-green"><MapPin size={22} color="#34C759" /></div>
          <div className="stat-value">{stats.totalTrips}</div>
          <div className="stat-label">여행·나들이</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrap bg-blue"><Globe2 size={22} color="#0A84FF" /></div>
          <div className="stat-value">{stats.cityCount}</div>
          <div className="stat-label">방문 도시</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrap bg-purple"><Navigation size={22} color="#AF52DE" /></div>
          <div className="stat-value">{stats.totalDistance.toFixed(0)}</div>
          <div className="stat-label">이동 거리 km</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrap bg-orange"><Camera size={22} color="#FF9500" /></div>
          <div className="stat-value">{stats.totalPhotos}</div>
          <div className="stat-label">위치 사진</div>
        </div>
      </div>

      {/* Trip vs outing breakdown */}
      <div className="info-card">
        <div className="info-card-header">
          <div className="icon-circle bg-blue"><Plane size={18} color="#0A84FF" /></div>
          <h3>여행 vs 나들이</h3>
        </div>
        <div className="split-stat-row">
          <div className="split-stat">
            <span className="split-stat-value" style={{ color: '#4da3ff' }}>{stats.overnightCount}</span>
            <span className="split-stat-label">숙박 여행</span>
          </div>
          <div className="split-stat">
            <span className="split-stat-value" style={{ color: '#4cd964' }}>{stats.outingCount}</span>
            <span className="split-stat-label">당일 나들이</span>
          </div>
          <div className="split-stat">
            <span className="split-stat-value">{stats.countryCount}</span>
            <span className="split-stat-label">방문 국가</span>
          </div>
        </div>
      </div>

      {/* 12-month activity */}
      <div className="info-card">
        <div className="info-card-header">
          <div className="icon-circle bg-teal"><CalendarRange size={18} color="#5AC8FA" /></div>
          <h3>최근 12개월 활동</h3>
        </div>
        <div className="month-chart">
          {stats.months.map((m) => (
            <div key={m.key} className="month-col" title={`${m.year}년 ${m.month + 1}월 · ${m.count}장`}>
              <div className="month-bar-track">
                <div className="month-bar-fill" style={{ height: `${(m.count / maxMonth) * 100}%` }} />
              </div>
              <span className="month-label">{MONTH_LABELS[m.month]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Highlights */}
      <div className="info-card">
        <div className="info-card-header">
          <div className="icon-circle bg-orange"><Trophy size={18} color="#FF9500" /></div>
          <h3>하이라이트</h3>
        </div>
        <div className="highlight-list">
          {stats.longestTrip && (
            <div className="highlight-row">
              <span className="highlight-label">최장 여행</span>
              <span className="highlight-value">{stats.longestTrip.title} · {stats.longestTrip.durationDays}일</span>
            </div>
          )}
          {stats.span && (
            <div className="highlight-row">
              <span className="highlight-label">기록 기간</span>
              <span className="highlight-value">{fmt(stats.span.start)} – {fmt(stats.span.end)}</span>
            </div>
          )}
          <div className="highlight-row">
            <span className="highlight-label">최고 고도</span>
            <span className="highlight-value">{Math.round(stats.maxAltitude)} m</span>
          </div>
          {home && stats.farthest != null && (
            <div className="highlight-row">
              <span className="highlight-label"><Home size={12} /> 집에서 최대</span>
              <span className="highlight-value">{stats.farthest} km</span>
            </div>
          )}
        </div>
      </div>

      {/* Most visited */}
      {stats.topRegions.length > 0 && (
        <div className="info-card">
          <div className="info-card-header">
            <div className="icon-circle bg-green"><MapPin size={18} color="#34C759" /></div>
            <h3>자주 간 곳</h3>
          </div>
          <div className="camera-list">
            {stats.topRegions.map(([region, count]) => {
              const percent = Math.round((count / stats.totalPhotos) * 100);
              return (
                <div key={region} className="camera-item">
                  <div className="camera-info">
                    <span className="camera-make text-truncate">{region}</span>
                    <span className="camera-percent">{count}장</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill" style={{ width: `${percent}%`, background: '#34C759' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Devices */}
      <div className="info-card">
        <div className="info-card-header">
          <div className="icon-circle"><Cpu size={18} /></div>
          <h3>기기별 사진 비율</h3>
        </div>
        <div className="camera-list">
          {stats.sortedCameras.map(([make, count], idx) => {
            const percent = Math.round((count / stats.totalPhotos) * 100);
            return (
              <div key={idx} className="camera-item">
                <div className="camera-info">
                  <span className="camera-make">{make}</span>
                  <span className="camera-percent">{percent}%</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
