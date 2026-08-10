import React, { useRef } from 'react';
import { Check, Image, Trash2, X } from 'lucide-react';
import PhotoImage from './PhotoImage';

const LONG_PRESS_MS = 480;

export default function GalleryView({ photos = [], onPhotoSelect, selectedIds = new Set(), onToggleSelection, onDeleteSelected, onClearSelection }) {
  const pressTimerRef = useRef(null);
  const didLongPressRef = useRef(false);
  const selectionMode = selectedIds.size > 0;
  const clearTimer = () => { if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current); pressTimerRef.current = null; };
  const startPress = (photo) => {
    clearTimer();
    didLongPressRef.current = false;
    pressTimerRef.current = window.setTimeout(() => { didLongPressRef.current = true; onToggleSelection?.(photo.id); }, LONG_PRESS_MS);
  };
  const openOrSelect = (photo) => {
    if (didLongPressRef.current) { didLongPressRef.current = false; return; }
    selectionMode ? onToggleSelection?.(photo.id) : onPhotoSelect?.(photo);
  };

  if (!photos.length) return <div className="gallery-empty-state"><Image size={48} className="empty-icon" /><p>갤러리에 사진이 없습니다.</p></div>;

  return <div className="gallery-view">
    <div className="gallery-header">
      <h2>{selectionMode ? `${selectedIds.size}개 선택됨` : `갤러리 · ${photos.length}장`}</h2>
      {selectionMode && <div className="gallery-selection-actions"><button onClick={onClearSelection} aria-label="선택 취소"><X size={19} /></button><button className="delete-selection-btn" onClick={onDeleteSelected} aria-label="선택 항목 삭제"><Trash2 size={18} /> 삭제</button></div>}
    </div>
    <p className="gallery-hint">사진을 길게 눌러 여러 항목을 선택할 수 있습니다.</p>
    <div className="gallery-grid">
      {photos.map((photo) => {
        const selected = selectedIds.has(photo.id);
        return <div key={photo.id} className={`gallery-item ${selected ? 'selected' : ''}`} onPointerDown={() => startPress(photo)} onPointerUp={clearTimer} onPointerCancel={clearTimer} onPointerLeave={clearTimer} onClick={() => openOrSelect(photo)}>
          <PhotoImage photo={photo} alt={photo.name || 'Gallery item'} className="gallery-thumb" />
          {photo.hasGps && <div className="gps-dot" />}
          {selected && <div className="gallery-selection-check"><Check size={16} /></div>}
        </div>;
      })}
    </div>
  </div>;
}
