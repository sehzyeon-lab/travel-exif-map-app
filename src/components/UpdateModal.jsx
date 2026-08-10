import React from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { CURRENT_VERSION, RELEASE_NOTES } from '../releaseNotes';

export default function UpdateModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(event) => event.stopPropagation()} style={{ padding: '24px 20px', maxHeight: '500px' }}>
        <div className="modal-handle" style={{ margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px' }}>✨</span>
            <div><h2 style={{ fontSize: '19px', fontWeight: 700, margin: 0, color: '#fff' }}>업데이트 완료</h2><span style={{ fontSize: '12px', color: 'var(--apple-blue)', fontWeight: 600 }}>버전 {CURRENT_VERSION}</span></div>
          </div>
          <button onClick={onClose} aria-label="닫기" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.4 }}>여행 기록을 더 빠르게 탐색하고 관리할 수 있도록 개선했습니다.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          {RELEASE_NOTES.map((item) => <div key={item.title} style={{ background: 'rgba(255,255,255,0.05)', padding: '12px 14px', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}><span style={{ fontSize: '20px', flexShrink: 0 }}>{item.icon}</span><div><div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '2px' }}>{item.title}</div><div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.35 }}>{item.desc}</div></div></div>)}
        </div>
        <button onClick={onClose} style={{ width: '100%', padding: '16px', background: 'var(--apple-blue)', color: '#fff', border: 'none', borderRadius: '14px', fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}><CheckCircle2 size={18} />확인했습니다</button>
      </div>
    </div>
  );
}
