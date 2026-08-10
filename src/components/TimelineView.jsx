import React from 'react';
import { Calendar, Navigation, Camera, Compass, Pencil, Home, MapPin, Moon } from 'lucide-react';
import PhotoImage from './PhotoImage';

export default function TimelineView({ trips = [], onPhotoSelect, onFocusTripOnMap, onRenameTrip, home, onSetHome }) {
  const rename = (trip, e) => {
    e.stopPropagation();
    const next = window.prompt('여행 이름을 입력하세요', trip.title);
    if (next !== null) onRenameTrip?.(trip.tripKey, next);
  };

  if (!trips || trips.length === 0) {
    return (
      <div className="timeline-empty-state">
        <Compass size={48} className="empty-icon" />
        <p>기록된 여행이 없습니다.</p>
        {!home && <p className="timeline-home-hint">지도 화면에서 위치를 길게 눌러 <b>집</b>을 등록하면, 집 근처 사진은 여행에서 자동으로 제외됩니다.</p>}
      </div>
    );
  }

  return (
    <div className="timeline-view">
      <div className="section-header">
        <h2>여행 기록</h2>
        <span className="count-badge">{trips.length}</span>
      </div>

      {!home && (
        <div className="home-suggest-card">
          <Home size={16} />
          <span>집을 등록하면 외출과 여행을 구분해 드려요. 지도에서 위치를 길게 눌러 등록하세요.</span>
        </div>
      )}

      <div className="trips-list">
        {trips.map((trip, i) => (
          <div key={trip.id} className="trip-card">
            <div className="trip-card-header" onClick={() => onFocusTripOnMap && onFocusTripOnMap(trip)}>
              {trip.coverPhoto && (
                <PhotoImage photo={trip.coverPhoto} alt="cover" className="trip-card-cover" />
              )}
              <div className="trip-stub-perf" aria-hidden="true" />
              <div className="trip-card-info">
                <div className="trip-eyebrow">
                  <span className="idx">№ {String(trips.length - i).padStart(2, '0')}</span> · {trip.placeName ? trip.placeName.split(' ')[0] : 'LOG'}
                </div>
                <div className="trip-title-row">
                  <h3 className="truncate">{trip.title}</h3>
                  <button className="trip-rename-btn" onClick={(e) => rename(trip, e)} aria-label="이름 변경">
                    <Pencil size={12} />
                  </button>
                </div>
                <div className="trip-badges">
                  <span className={`trip-badge ${trip.kind === 'trip' ? 'badge-trip' : 'badge-outing'}`}>
                    {trip.nights >= 1 ? <Moon size={10} /> : <MapPin size={10} />}
                    {trip.durationLabel} {trip.kindLabel}
                  </span>
                </div>
                <span className="trip-date">{trip.startDateFormatted}{trip.startDateFormatted !== trip.endDateFormatted ? ` – ${trip.endDateFormatted}` : ''}</span>
                <div className="trip-stats-row">
                  <span><Camera size={11} /> {trip.photoCount || 0}장</span>
                  <span><Navigation size={11} /> {trip.totalDistanceKm || 0}km</span>
                  <span><Calendar size={11} /> {trip.durationDays || 0}일</span>
                </div>
              </div>
            </div>

            {trip.photos && trip.photos.length > 0 && (
              <div className="trip-photos-strip">
                {trip.photos.slice(0, 6).map((photo) => (
                  <PhotoImage
                    key={photo.id}
                    photo={photo}
                    alt="thumbnail"
                    className="strip-thumb"
                    onClick={() => onPhotoSelect && onPhotoSelect(photo)}
                  />
                ))}
                {trip.photos.length > 6 && (
                  <div className="strip-overflow">
                    +{trip.photos.length - 6}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
