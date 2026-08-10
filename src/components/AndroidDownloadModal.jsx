import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, ShieldCheck, X } from 'lucide-react';

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function sha256(blob) {
  const bytes = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export default function AndroidDownloadModal({ onClose }) {
  const [state, setState] = useState({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    (async () => {
      try {
        const manifestResponse = await fetch('/downloads/apk-release.json', { cache: 'no-store', credentials: 'same-origin' });
        if (!manifestResponse.ok) throw new Error('릴리스 정보를 찾을 수 없습니다.');
        const manifest = await manifestResponse.json();
        if (!/^\/downloads\/[a-z0-9._-]+\.apk$/i.test(manifest.file) || !/^[A-F0-9]{64}$/.test(manifest.sha256 || '')) throw new Error('릴리스 정보 형식이 올바르지 않습니다.');
        const apkResponse = await fetch(manifest.file, { cache: 'no-store', credentials: 'same-origin' });
        if (!apkResponse.ok) throw new Error('APK 파일을 불러올 수 없습니다.');
        const apk = await apkResponse.blob();
        if (apk.size !== manifest.size || await sha256(apk) !== manifest.sha256) throw new Error('파일 무결성 검사에 실패했습니다. 다운로드를 중단했습니다.');
        objectUrl = URL.createObjectURL(apk);
        if (!cancelled) setState({ status: 'ready', manifest, objectUrl });
      } catch (error) {
        if (!cancelled) setState({ status: 'error', message: error.message || '다운로드를 준비하지 못했습니다.' });
      }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, []);

  return <div className="modal-overlay" onClick={onClose}>
    <section className="download-sheet" onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-label="Android APK 다운로드">
      <button className="download-close" onClick={onClose} aria-label="닫기"><X size={18} /></button>
      <div className="download-icon"><ShieldCheck size={30} /></div>
      <h2>안전한 APK 다운로드</h2>
      {state.status === 'checking' && <><Loader2 className="spin-icon" size={24} /><p>파일 무결성을 확인하고 있습니다…</p></>}
      {state.status === 'ready' && <>
        <p>버전 {state.manifest.version} · {formatBytes(state.manifest.size)}<br />SHA-256 무결성 검사를 완료했습니다.</p>
        <a className="apk-download-button" href={state.objectUrl} download={`travel-record-${state.manifest.version}.apk`}><Download size={19} />APK 다운로드</a>
        <div className="download-security-note"><CheckCircle2 size={16} />공식 사이트에서만 다운로드하세요. 설치 전 Android의 앱 서명 경고를 확인하세요.</div>
      </>}
      {state.status === 'error' && <><AlertTriangle color="var(--apple-red)" size={28} /><p>{state.message}</p><div className="download-security-note">보안을 위해 다운로드 링크를 표시하지 않았습니다.</div></>}
    </section>
  </div>;
}
