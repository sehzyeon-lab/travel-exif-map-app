import React, { useState } from 'react';
import { X, Trash2, Combine, Scissors, RotateCcw, Check } from 'lucide-react';
import PhotoImage from './PhotoImage';

/**
 * Bottom-sheet editor for one trip: rename, delete, merge into the previous trip, split into two at
 * a chosen photo, or reset back to automatic grouping.
 */
export default function TripEditSheet({ trip, canMerge, onRename, onDelete, onMerge, onSplitAt, onReset, onClose }) {
  const [name, setName] = useState(trip.title);
  if (!trip) return null;

  const saveName = () => {
    if (name.trim() !== trip.title) onRename?.(trip.tripKey, name);
  };

  const confirmDelete = () => {
    if (window.confirm(`'${trip.title}' 기록(사진 ${trip.photoCount}장)을 삭제할까요?\n사진이 앱에서 제거됩니다.`)) {
      onDelete?.(trip);
      onClose?.();
    }
  };

  const splitHere = (photoId) => {
    onSplitAt?.(photoId);
    onClose?.();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet trip-edit-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />

        <div className="edit-sheet-head">
          <span className="eyebrow">여행 편집 · EDIT TRIP</span>
          <button className="edit-sheet-close" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>

        {/* Rename */}
        <div className="edit-name-row">
          <input
            className="edit-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            placeholder="여행 이름"
            maxLength={40}
          />
          <button className="edit-name-save" onClick={saveName} aria-label="이름 저장"><Check size={18} /></button>
        </div>

        {/* Grouping actions */}
        <div className="edit-actions">
          {canMerge && (
            <button className="edit-action" onClick={() => { onMerge?.(trip); onClose?.(); }}>
              <Combine size={18} />
              <div><b>이전 여행과 합치기</b><span>바로 앞(먼저 간) 여행과 하나로 묶습니다</span></div>
            </button>
          )}
          <button className="edit-action" onClick={() => { onReset?.(trip); onClose?.(); }}>
            <RotateCcw size={18} />
            <div><b>자동 분류로 되돌리기</b><span>이 구간에 적용한 합치기·나누기를 취소합니다</span></div>
          </button>
          <button className="edit-action danger" onClick={confirmDelete}>
            <Trash2 size={18} />
            <div><b>이 기록 삭제</b><span>사진 {trip.photoCount}장이 앱에서 제거됩니다</span></div>
          </button>
        </div>

        {/* Split */}
        {trip.photos.length > 1 && (
          <div className="edit-split">
            <div className="edit-split-head"><Scissors size={14} /> 여기서부터 새 여행으로 나누기</div>
            <div className="edit-split-strip">
              {trip.photos.map((photo, idx) => (
                <button
                  key={photo.id}
                  className="edit-split-item"
                  disabled={idx === 0}
                  onClick={() => splitHere(photo.id)}
                  title={idx === 0 ? '첫 사진에서는 나눌 수 없습니다' : '이 사진부터 새 여행'}
                >
                  <PhotoImage photo={photo} alt="" className="edit-split-thumb" />
                  {idx > 0 && <span className="edit-split-cut">✂</span>}
                </button>
              ))}
            </div>
            <p className="edit-split-hint">선택한 사진부터 마지막 사진까지 새로운 여행으로 분리됩니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
