import React from 'react';
import { MapPin, Calendar, Camera, Compass, Aperture, X, Trash2 } from 'lucide-react';
import PhotoImage from './PhotoImage';

export default function ExifModal({ photo, onClose, onFocusMap, onDeletePhoto }) {
  if (!photo) return null;

  const handleDelete = () => {
    if (window.confirm(`'${photo.name}' 사진을 삭제하시겠습니까?`)) {
      if (onDeletePhoto) onDeletePhoto(photo.id);
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        
        <div style={{ position: 'relative' }}>
          <PhotoImage photo={photo} alt={photo.name} className="modal-photo" full />
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
          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
              <h3 className="text-truncate" style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '800', letterSpacing: '-0.02em', color: 'var(--paper)' }}>
                {photo.name}
              </h3>
              {photo.locationName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  <MapPin size={14} />
                  <span className="text-truncate">{photo.locationName}</span>
                </div>
              )}
            </div>

            {/* Individual Photo Delete Button */}
            <button
              onClick={handleDelete}
              style={{
                background: 'rgba(217, 96, 60, 0.14)',
                border: '1px solid rgba(217,96,60,0.35)',
                borderRadius: '10px',
                padding: '8px 12px',
                color: 'var(--rust)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <Trash2 size={14} />
              삭제
            </button>
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
                width: 'calc(100% - 32px)',
                margin: '16px',
                padding: '15px',
                background: 'linear-gradient(180deg, var(--amber), var(--amber-deep))',
                color: '#241a09',
                border: 'none',
                borderRadius: '13px',
                fontFamily: 'var(--font-mono)',
                fontSize: '14px',
                fontWeight: '700',
                letterSpacing: '0.03em',
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
