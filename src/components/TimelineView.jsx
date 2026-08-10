import React from 'react';
import { Calendar, Navigation, Camera, Compass } from 'lucide-react';
import PhotoImage from './PhotoImage';

export default function TimelineView({ trips = [], onPhotoSelect, onFocusTripOnMap }) {
  if (!trips || trips.length === 0) {
    return (
      <div className="timeline-empty-state">
        <Compass size={48} className="empty-icon" />
        <p>기록된 여행이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="timeline-view">
      <div className="section-header">
        <h2>여행 기록</h2>
        <span className="count-badge">{trips.length}</span>
      </div>
      
      <div className="trips-list">
        {trips.map(trip => (
          <div key={trip.id} className="trip-card">
            <div className="trip-card-header" onClick={() => onFocusTripOnMap && onFocusTripOnMap(trip)}>
              {trip.coverPhoto && (
                <PhotoImage photo={trip.coverPhoto} alt="cover" className="trip-card-cover" />
              )}
              <div className="trip-card-info">
                <h3 className="truncate">{trip.title}</h3>
                <span className="trip-date">{trip.startDateFormatted} - {trip.endDateFormatted}</span>
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
