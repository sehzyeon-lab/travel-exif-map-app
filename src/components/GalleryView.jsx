import React from 'react';
import { Image } from 'lucide-react';
import PhotoImage from './PhotoImage';

export default function GalleryView({ photos = [], onPhotoSelect }) {
  if (!photos || photos.length === 0) {
    return (
      <div className="gallery-empty-state">
        <Image size={48} className="empty-icon" />
        <p>갤러리에 사진이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="gallery-view">
      <div className="gallery-header">
        <h2>갤러리 · {photos.length}장</h2>
      </div>
      
      <div className="gallery-grid">
        {photos.map((photo) => (
          <div 
            key={photo.id} 
            className="gallery-item"
            onClick={() => onPhotoSelect && onPhotoSelect(photo)}
          >
            <PhotoImage photo={photo} alt={photo.name || 'Gallery item'} className="gallery-thumb" />
            {photo.hasGps && <div className="gps-dot"></div>}
          </div>
        ))}
      </div>
    </div>
  );
}
