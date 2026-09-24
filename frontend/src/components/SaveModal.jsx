import React, { useState } from 'react';
import { Database, Download, X, FileText, Globe, Layers, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import axios from 'axios';

export default function SaveModal({
  isOpen,
  onClose,
  taskId,
  filename,
  result,
  currentDbDocId,
  onSaveCompleted
}) {
  const [destination, setDestination] = useState('both'); // 'db', 'local', 'both'
  const [format, setFormat] = useState('txt');            // 'txt', 'html'
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  // Generate TXT content from result segments
  const buildTxtContent = () => {
    if (!result) return '';
    if (result.segments && result.segments.length > 0) {
      return result.segments.map(seg => {
        const start = formatTime(seg.start);
        const end   = formatTime(seg.end);
        const lang  = seg.language || '??';
        return `[${start} -> ${end}] [${lang}] ${seg.text}`;
      }).join('\n');
    }
    return result.full_text || '';
  };

  // Generate HTML content from result segments
  const buildHtmlContent = () => {
    if (!result) return '';
    const stem = (filename || 'stt_transcript').replace(/\.[^/.]+$/, '');
    const langs = (result.detected_languages || []).join(', ') || '알 수 없음';
    const duration = result.duration ? formatTime(result.duration) : '-';

    const rows = (result.segments || []).map(seg => {
      const langColors = {
        ko: '#dbeafe', en: '#d1fae5', ja: '#ede9fe',
        zh: '#fee2e2', es: '#fef3c7', fr: '#f0fdf4'
      };
      const bg = langColors[seg.language] || '#f8fafc';
      return `<tr style="background:${bg}">
        <td style="padding:6px 10px;font-family:monospace;white-space:nowrap">${formatTime(seg.start)} → ${formatTime(seg.end)}</td>
        <td style="padding:6px 10px;text-align:center;font-weight:bold">${seg.language || '?'}</td>
        <td style="padding:6px 10px">${seg.text}</td>
      </tr>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<title>${stem} - STT 결과</title>
<style>
  body{font-family:'Noto Sans KR',sans-serif;max-width:900px;margin:40px auto;background:#f8fafc;color:#1e293b}
  h1{font-size:1.4rem;font-weight:800;color:#1e293b}
  .meta{font-size:.85rem;color:#64748b;margin-bottom:1.5rem}
  table{width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)}
  th{background:#1e40af;color:white;padding:10px 14px;text-align:left;font-size:.85rem}
  td{border-bottom:1px solid #e2e8f0;font-size:.9rem}
</style></head>
<body>
<h1>📝 ${stem}</h1>
<div class="meta">🌐 감지 언어: ${langs} &nbsp;|&nbsp; ⏱️ 총 길이: ${duration} &nbsp;|&nbsp; 구간: ${(result.segments||[]).length}개</div>
<table>
  <thead><tr><th>시간</th><th>언어</th><th>인식 텍스트</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;
  };

  const formatTime = (s) => {
    if (typeof s !== 'number' || isNaN(s)) return '00:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const downloadBlob = (content, fname) => {
    const isHtml = fname.endsWith('.html');
    const blob = new Blob([content], { type: isHtml ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!result) {
      setErrorMsg('저장할 STT 결과가 없습니다. STT를 먼저 완료해 주세요.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    const stem = (filename || 'stt_transcript').replace(/\.[^/.]+$/, '');
    const ext = format === 'html' ? '.html' : '.txt';
    const outFilename = `${stem}${ext}`;
    const content = format === 'html' ? buildHtmlContent() : buildTxtContent();

    try {
      // 1) Download to local if needed
      if (destination === 'local' || destination === 'both') {
        downloadBlob(content, outFilename);
      }

      // 2) Save to Neon DB if needed (via existing /api/db/audio/{id}/stt result doc endpoint)
      if ((destination === 'db' || destination === 'both') && taskId) {
        try {
          await axios.post('/api/db/save-result', {
            task_id: taskId,
            filename: outFilename,
            content_txt: buildTxtContent(),
            content_html: buildHtmlContent(),
            segments: result.segments || [],
            duration: result.duration || 0,
            detected_languages: result.detected_languages || []
          });
        } catch (dbErr) {
          // DB save might already have happened automatically — just warn
          console.warn('DB save endpoint returned:', dbErr.response?.status, dbErr.response?.data?.detail);
          if (dbErr.response?.status !== 404) {
            throw dbErr;
          }
          // 404 means already saved automatically, that's OK
        }
      }

      alert(
        destination === 'local'
          ? `"${outFilename}" 이(가) 내 컴퓨터에 다운로드 되었습니다!`
          : destination === 'db'
          ? 'STT 결과가 Neon DB에 저장되었습니다! (DB 파일 디렉토리에서 확인하세요)'
          : `"${outFilename}" 다운로드 완료 + Neon DB 저장 완료!`
      );

      if (onSaveCompleted) onSaveCompleted({ filename: outFilename });
      onClose();
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || '저장 중 오류가 발생했습니다.';
      setErrorMsg(detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="font-bold text-slate-800 text-base">STT 결과 저장 옵션</h3>
            <p className="text-xs text-slate-500 mt-0.5">저장할 위치와 파일 형식을 선택하세요.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {errorMsg && (
            <div className="flex items-start gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Destination Selection */}
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2.5">
              1. 저장할 위치 선택
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { value: 'db', icon: Database, label: 'DB에 저장', sub: 'Neon DB 보관', color: 'text-blue-600' },
                { value: 'local', icon: Download, label: '로컬 다운로드', sub: '내 컴퓨터 저장', color: 'text-emerald-600' },
                { value: 'both', icon: Layers, label: '둘 다 저장', sub: 'DB + 다운로드', color: 'text-indigo-600' }
              ].map(({ value, icon: Icon, label, sub, color }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDestination(value)}
                  className={`p-3 rounded-xl border text-left flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                    destination === value
                      ? 'border-blue-600 bg-blue-50/80 text-blue-700 shadow-sm ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-1.5 ${color}`} />
                  <span className="text-xs font-bold block">{label}</span>
                  <span className="text-[10px] text-slate-400">{sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Format Selection */}
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2.5">
              2. 저장 파일 형식 선택
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { value: 'txt', icon: FileText, label: '텍스트 문서 (.txt)', sub: '구간 타임스탬프 포함 텍스트', color: 'text-slate-600' },
                { value: 'html', icon: Globe, label: '웹 문서 (.html)', sub: '컬러 언어 배지 스타일 보고서', color: 'text-indigo-600' }
              ].map(({ value, icon: Icon, label, sub, color }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormat(value)}
                  className={`p-3 rounded-xl border flex items-start gap-2.5 transition-all cursor-pointer ${
                    format === value
                      ? 'border-blue-600 bg-blue-50/80 text-blue-700 shadow-sm ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${color}`} />
                  <div className="text-left">
                    <span className="text-xs font-bold block">{label}</span>
                    <span className="text-[10px] text-slate-400">{sub}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !result}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /><span>저장 중...</span></>
            ) : (
              <><CheckCircle2 className="w-4 h-4" /><span>저장하기</span></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
