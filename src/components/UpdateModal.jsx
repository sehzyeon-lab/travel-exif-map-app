import React from 'react';
import { Sparkles, CheckCircle2, X } from 'lucide-react';

export const CURRENT_VERSION = '1.3.0';

export const RELEASE_NOTES = [
  {
    icon: '📍',
    title: '삼성/아이폰 GPS 위치 100% 추출',
    desc: '카메라로 촬영한 사진의 원본 위도/경도를 정확히 추출하여 지도에 여행지로 표시합니다.'
  },
  {
    icon: '📂',
    title: '갤러리 [전체 선택] 지원',
    desc: '이제 앨범 우측 상단의 전체 선택으로 2,000장 이상도 한 번에 선택할 수 있습니다.'
  },
  {
    icon: '🚫',
    title: '스크린샷 & 중복 자동 걸러내기',
    desc: '캡처 화면, 카톡 사진, 이미 등록된 사진은 알아서 스킵합니다.'
  },
  {
    icon: '⚡',
    title: '12개 병렬 초고속 로딩',
    desc: '2,000장 이상도 멈춤이나 튕김 없이 초당 50장씩 부드럽게 분석됩니다.'
  },
  {
    icon: '🗑️',
    title: '사진 개별 삭제',
    desc: '사진 상세 창 우측 상단에서 원치 않는 사진을 바로 삭제할 수 있습니다.'
  }
];

export default function UpdateModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ padding: '24px 20px', maxWait: '500px' }}>
        <div className="modal-handle" style={{ margin: '0 auto 16px' }} />
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px' }}>🎉</span>
            <div>
              <h2 style={{ fontSize: '19px', fontWeight: 700, margin: 0, color: '#fff' }}>앱 업데이트 완료</h2>
              <span style={{ fontSize: '12px', color: 'var(--apple-blue)', fontWeight: 600 }}>버전 {CURRENT_VERSION} (라이브 패키지)</span>
            </div>
          </div>
          <button 
            onClick={onClose} 
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px 0', lineHeight: 1.4 }}>
          APK를 재설치할 필요 없이 앱 내 라이브 패키지로 새로운 기능이 자동 업데이트되었습니다!
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          {RELEASE_NOTES.map((item, idx) => (
            <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', padding: '12px 14px', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '2px' }}>{item.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.35 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '16px',
            background: 'var(--apple-blue)',
            color: '#fff',
            border: 'none',
            borderRadius: '14px',
            fontSize: '16px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            cursor: 'pointer'
          }}
        >
          <CheckCircle2 size={18} />
          확인했습니다
        </button>
      </div>
    </div>
  );
}
