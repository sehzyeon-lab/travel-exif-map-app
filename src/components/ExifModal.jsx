import React from 'react';
import { MapPin, Calendar, Camera, Compass, Aperture, X } from 'lucide-react';

export default function ExifModal({ photo, onClose, onFocusMap }) {
  if (!photo) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        
        <div style={{ position: 'relative' }}>
          <img src={photo.url} alt={photo.name} className="modal-photo" />
          <button 
            onClick={onClose}
            style={{ 
              position: 'absolute', top: '12px', right: '12px', 
              width: '32px', height: '32px', borderRadius: '16px', 
              background: 'rgba(28, 28, 30, 0.7)', backdropFilter: 'blur(10px)',
              border: 'none', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px 16px' }}>
          <div style={{ marginBottom: '20px' }}>
            <h3 className="text-truncate" style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '600', color: '#FFF' }}>
              {photo.name}
            </h3>
            {photo.locationName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '13px' }}>
                <MapPin size={14} />
                <span className="text-truncate">{photo.locationName}</span>
              </div>
            )}
          </div>

          <div className="modal-meta-grid">
            <div className="modal-meta-item">
              <span className="modal-meta-label"><Calendar size={14} /> 날짜</span>
              <span className="modal-meta-value">{photo.dateFormatted || '알 수 없음'}</span>
            </div>
            
            <div className="modal-meta-item">
              <span className="modal-meta-label"><Compass size={14} /> GPS</span>
              <span className="modal-meta-value">
                {photo.hasGps 
                  ? `${photo.latitude.toFixed(4)}, ${photo.longitude.toFixed(4)}` 
                  : '위치 정보 없음'}
              </span>
            </div>

            <div className="modal-meta-item">
              <span className="modal-meta-label"><Camera size={14} /> 기기</span>
              <span className="modal-meta-value text-truncate">
                {photo.cameraMake || photo.cameraModel 
                  ? `${photo.cameraMake} ${photo.cameraModel}`.trim() 
                  : '알 수 없음'}
              </span>
            </div>

            <div className="modal-meta-item">
              <span className="modal-meta-label"><Aperture size={14} /> 설정</span>
              <span className="modal-meta-value text-truncate">
                {photo.iso ? `ISO ${photo.iso}` : ''} {photo.aperture ? `f/${photo.aperture}` : ''}
                {!photo.iso && !photo.aperture && '알 수 없음'}
              </span>
            </div>
          </div>

          {photo.hasGps && (
            <button 
              onClick={onFocusMap}
              style={{
                width: '100%',
                padding: '16px',
                marginTop: '16px',
                backgroundColor: 'var(--apple-blue)',
                color: '#FFF',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
            >
              <MapPin size={18} />
              지도에서 보기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
