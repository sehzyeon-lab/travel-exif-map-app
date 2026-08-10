import React from 'react';
import { Sparkles, CheckCircle2, X } from 'lucide-react';

export const CURRENT_VERSION = '2.0.0';

export const RELEASE_NOTES = [
  {
    icon: '🛠️',
    title: '사진 불러오기 오류 해결',
    desc: '안드로이드 10 이상에서 갤러리 스캔이 항상 실패하던 문제를 고쳤습니다. 이제 정상적으로 사진을 읽어옵니다.'
  },
  {
    icon: '📍',
    title: 'GPS 위치 정상 추출',
    desc: '사진 원본의 EXIF 헤더에서 위도/경도를 직접 읽습니다. 삼성·아이폰 사진의 위치가 지도에 제대로 찍힙니다.'
  },
  {
    icon: '🔐',
    title: '권한 요청 방식 개선',
    desc: '안드로이드 13/14의 사진 권한과 "일부만 선택" 접근을 지원하고, 권한이 없을 때 이유를 안내합니다.'
  },
  {
    icon: '⚡',
    title: '변경분만 다시 읽기',
    desc: '앱을 다시 켜면 마지막 스캔 이후 추가된 사진만 확인해 즉시 시작합니다.'
  },
  {
    icon: '🖼️',
    title: '갤러리 썸네일 안정화',
    desc: '앱을 껐다 켜도 사진이 깨지지 않도록 썸네일을 캐시에서 불러옵니다.'
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
