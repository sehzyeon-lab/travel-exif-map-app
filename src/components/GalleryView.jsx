import React, { useEffect, useRef, useState } from 'react';
import { Check, Image, Trash2, X, MapPinOff } from 'lucide-react';
import PhotoImage from './PhotoImage';

const LONG_PRESS_MS = 380;

export default function GalleryView({
  photos = [],
  onPhotoSelect,
  selectedIds = new Set(),
  onToggleSelection,
  onSelectionChange,
  onDeleteSelected,
  onClearSelection
}) {
  const pressTimerRef = useRef(null);
  const didLongPressRef = useRef(false);
  const dragBaseRef = useRef(new Set());
  const draggedRef = useRef(new Set());
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [dragSelecting, setDragSelecting] = useState(false);
  const selectionMode = selectedIds.size > 0;

  const clearTimer = () => { if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current); pressTimerRef.current = null; };

  const startPress = (photo) => {
    clearTimer();
    didLongPressRef.current = false;
    pressTimerRef.current = window.setTimeout(() => {
      didLongPressRef.current = true;
      dragBaseRef.current = new Set(selectedIds);
      draggedRef.current = new Set([photo.id]);
      setDragSelecting(true);
      onSelectionChange?.(new Set([...selectedIds, photo.id]));
      if (navigator.vibrate) navigator.vibrate(12);
    }, LONG_PRESS_MS);
  };

  // While dragging, whichever thumbnail is under the finger joins the selection. Document-level
  // listeners (rather than per-item handlers) keep working through Pointer Events' implicit capture.
  useEffect(() => {
    if (!dragSelecting) return undefined;
    const onMove = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const item = el?.closest('[data-photo-id]');
      if (!item) return;
      const id = item.getAttribute('data-photo-id');
      if (draggedRef.current.has(id)) return;
      draggedRef.current.add(id);
      onSelectionChange?.(new Set([...dragBaseRef.current, ...draggedRef.current]));
    };
    const onUp = () => setDragSelecting(false);
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, [dragSelecting, onSelectionChange]);

  const openOrSelect = (photo) => {
    if (didLongPressRef.current) { didLongPressRef.current = false; return; }
    selectionMode ? onToggleSelection?.(photo.id) : onPhotoSelect?.(photo);
  };

  const requestDelete = () => {
    if (!deleteArmed) { setDeleteArmed(true); return; }
    onDeleteSelected?.();
  };
  useEffect(() => { if (!selectionMode) setDeleteArmed(false); }, [selectionMode]);

  if (!photos.length) return <div className="gallery-empty-state"><Image size={48} className="empty-icon" /><p>갤러리에 사진이 없습니다.</p></div>;

  return (
    <div className="gallery-view">
      <div className="gallery-header">
        <h2>{selectionMode ? `${selectedIds.size}개 선택됨` : `갤러리 · ${photos.length}장`}</h2>
      </div>
      <p className="gallery-hint">사진을 <b>길게 눌러</b> 선택하고, 그대로 <b>드래그</b>하면 여러 장을 한 번에 고를 수 있어요.</p>

      <div className={`gallery-grid ${dragSelecting ? 'drag-selecting' : ''}`}>
        {photos.map((photo) => {
          const selected = selectedIds.has(photo.id);
          return (
            <div
              key={photo.id}
              data-photo-id={photo.id}
              className={`gallery-item ${selected ? 'selected' : ''}`}
              onPointerDown={(event) => { if (event.isPrimary) startPress(photo); }}
              onPointerUp={clearTimer}
              onPointerCancel={clearTimer}
              onPointerLeave={clearTimer}
              onContextMenu={(event) => event.preventDefault()}
              onClick={() => openOrSelect(photo)}
            >
              <PhotoImage photo={photo} alt={photo.name || 'Gallery item'} className="gallery-thumb" />
              {photo.hasGps
                ? <div className="gps-dot" title="위치 정보 있음" />
                : <div className="no-gps-badge" title="위치 정보 없음"><MapPinOff size={11} /></div>}
              {selected && <div className="gallery-selection-check"><Check size={16} /></div>}
            </div>
          );
        })}
      </div>

      {selectionMode && (
        <div className="gallery-action-bar glass-surface">
          <button className="action-bar-btn ghost" onClick={onClearSelection}><X size={18} /> 취소</button>
          <span className="action-bar-count">{selectedIds.size}개 선택됨</span>
          <button
            className={`action-bar-btn danger ${deleteArmed ? 'armed' : ''}`}
            onClick={requestDelete}
          >
            <Trash2 size={18} /> {deleteArmed ? '삭제 확인' : '삭제'}
          </button>
        </div>
      )}
    </div>
  );
}
