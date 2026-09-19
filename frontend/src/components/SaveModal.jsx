import React, { useState } from 'react';
import { Database, Download, Check, X, FileText, Globe, Layers } from 'lucide-react';
import axios from 'axios';

export default function SaveModal({ 
  isOpen, 
  onClose, 
  taskId, 
  filename, 
  onSaveCompleted 
}) {
  const [destination, setDestination] = useState('both'); // 'db', 'local', 'both'
  const [format, setFormat] = useState('txt');           // 'txt', 'html'
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await axios.post('/api/save', {
        task_id: taskId,
        filename: filename,
        destination: destination,
        format: format
      });

      if (res.data.download_url && (destination === 'local' || destination === 'both')) {
        // Trigger browser download
        const link = document.createElement('a');
        link.href = res.data.download_url;
        link.setAttribute('download', '');
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      alert('성공적으로 저장되었습니다!');
      onSaveCompleted(res.data);
      onClose();
    } catch (err) {
      alert(err.response?.data?.detail || '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="font-bold text-slate-800 text-base">STT 결과 저장 옵션</h3>
            <p className="text-xs text-slate-500 mt-0.5">저장할 위치와 파일 형식을 선택하세요.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Destination Selection */}
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2.5">
              1. 저장할 위치 선택
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setDestination('db')}
                className={`p-3 rounded-xl border text-left flex flex-col items-center justify-center text-center transition-all ${
                  destination === 'db'
                    ? 'border-blue-600 bg-blue-50/80 text-blue-700 shadow-sm ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <Database className="w-5 h-5 mb-1.5 text-blue-600" />
                <span className="text-xs font-bold">DB에 저장</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Neon DB 보관</span>
              </button>

              <button
                type="button"
                onClick={() => setDestination('local')}
                className={`p-3 rounded-xl border text-left flex flex-col items-center justify-center text-center transition-all ${
                  destination === 'local'
                    ? 'border-blue-600 bg-blue-50/80 text-blue-700 shadow-sm ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <Download className="w-5 h-5 mb-1.5 text-emerald-600" />
                <span className="text-xs font-bold">로컬 다운로드</span>
                <span className="text-[10px] text-slate-400 mt-0.5">내 컴퓨터 저장</span>
              </button>

              <button
                type="button"
                onClick={() => setDestination('both')}
                className={`p-3 rounded-xl border text-left flex flex-col items-center justify-center text-center transition-all ${
                  destination === 'both'
                    ? 'border-blue-600 bg-blue-50/80 text-blue-700 shadow-sm ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <Layers className="w-5 h-5 mb-1.5 text-indigo-600" />
                <span className="text-xs font-bold">둘 다 저장</span>
                <span className="text-[10px] text-slate-400 mt-0.5">DB + 다운로드</span>
              </button>
            </div>
          </div>

          {/* Format Selection */}
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2.5">
              2. 저장 파일 형식 선택
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label 
                className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                  format === 'txt' 
                    ? 'border-blue-600 bg-blue-50/80 text-blue-900 shadow-sm ring-2 ring-blue-500/20' 
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value="txt"
                  checked={format === 'txt'}
                  onChange={() => setFormat('txt')}
                  className="hidden"
                />
                <div className={`p-2 rounded-lg ${format === 'txt' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold">텍스트 문서 (.txt)</div>
                  <div className="text-[11px] text-slate-400">구간 타임스탬프 포함 텍스트</div>
                </div>
              </label>

              <label 
                className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                  format === 'html' 
                    ? 'border-blue-600 bg-blue-50/80 text-blue-900 shadow-sm ring-2 ring-blue-500/20' 
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value="html"
                  checked={format === 'html'}
                  onChange={() => setFormat('html')}
                  className="hidden"
                />
                <div className={`p-2 rounded-lg ${format === 'html' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold">웹 문서 (.html)</div>
                  <div className="text-[11px] text-slate-400">컬러 언어 배지 스타일 보고서</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-all"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>저장하기</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
