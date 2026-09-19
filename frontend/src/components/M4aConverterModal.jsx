import React, { useState, useEffect } from 'react';
import { 
  X, 
  Music, 
  ArrowRight, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sparkles,
  FileAudio,
  Database
} from 'lucide-react';
import axios from 'axios';

export default function M4aConverterModal({ isOpen, onClose, onConversionSuccess }) {
  const [activeTab, setActiveTab] = useState('local'); // 'local' or 'db'
  const [selectedFile, setSelectedFile] = useState(null);
  const [converting, setConverting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [convertedFilename, setConvertedFilename] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // DB m4a files
  const [dbM4aFiles, setDbM4aFiles] = useState([]);
  const [loadingDbFiles, setLoadingDbFiles] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setConverting(false);
      setDownloadUrl(null);
      setConvertedFilename('');
      setError('');
      setSuccessMsg('');
      fetchDbM4aFiles();
    }
  }, [isOpen]);

  const fetchDbM4aFiles = async () => {
    setLoadingDbFiles(true);
    try {
      const res = await axios.get('/api/db/files?type=audio');
      const m4as = (res.data || []).filter(f => 
        f.type === 'audio' && (f.filename.toLowerCase().endsWith('.m4a') || f.filename.toLowerCase().endsWith('.aac'))
      );
      setDbM4aFiles(m4as);
    } catch (err) {
      console.warn('Failed to fetch DB audio files:', err);
    } finally {
      setLoadingDbFiles(false);
    }
  };

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setError('');
      setDownloadUrl(null);
      setSuccessMsg('');
    }
  };

  // Convert uploaded local M4A file
  const handleConvertLocal = async () => {
    if (!selectedFile) {
      setError('M4A 오디오 파일을 먼저 선택해 주세요.');
      return;
    }
    setConverting(true);
    setError('');
    setSuccessMsg('');
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await axios.post('/api/convert/m4a-to-mp3', formData, {
        responseType: 'blob'
      });

      const mp3Name = selectedFile.name.replace(/\.[^/.]+$/, "") + ".mp3";
      const blob = new Blob([res.data], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setConvertedFilename(mp3Name);
      setSuccessMsg(`"${mp3Name}" 변환이 성공적으로 완료되었습니다!`);
    } catch (err) {
      setError(err.response?.data?.detail || 'M4A 변환 중 오류가 발생했습니다.');
    } finally {
      setConverting(false);
    }
  };

  // Convert DB-stored M4A file
  const handleConvertDbAudio = async (audioItem) => {
    setConverting(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await axios.post(`/api/convert/db-audio/${audioItem.id}/to-mp3`);
      setSuccessMsg(res.data.message || 'Neon DB에 새 MP3로 등록되었습니다!');
      if (onConversionSuccess) onConversionSuccess();
      fetchDbM4aFiles();
    } catch (err) {
      setError(err.response?.data?.detail || 'DB 오디오 변환 중 오류가 발생했습니다.');
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Music className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">M4A ➔ MP3 고음질 변환기</h3>
              <p className="text-[11px] text-purple-100">192kbps 고음질 LAME 엔진 · STT 전 완벽 호환</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-100 bg-slate-50/70 p-1.5 gap-1.5">
          <button
            onClick={() => { setActiveTab('local'); setError(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'local' 
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/80' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>내 컴퓨터 파일 변환</span>
          </button>
          <button
            onClick={() => { setActiveTab('db'); setError(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'db' 
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/80' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Neon DB 보관 M4A 변환</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl font-medium">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Tab 1: Local file */}
          {activeTab === 'local' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-6 text-center transition-colors bg-slate-50/50">
                <input 
                  type="file" 
                  accept=".m4a,.aac,.mp4,audio/m4a,audio/x-m4a" 
                  onChange={handleFileChange}
                  id="m4a-modal-file-input" 
                  className="hidden" 
                />
                <label 
                  htmlFor="m4a-modal-file-input" 
                  className="cursor-pointer flex flex-col items-center justify-center gap-2"
                >
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <FileAudio className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-700">M4A 오디오 파일 선택하기</span>
                    <p className="text-xs text-slate-400 mt-0.5">또는 파일을 이곳으로 드래그하세요 (.m4a, .aac)</p>
                  </div>
                </label>

                {selectedFile && (
                  <div className="mt-4 p-2.5 bg-white border border-indigo-100 rounded-xl flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 truncate max-w-[280px]">
                      {selectedFile.name}
                    </span>
                    <span className="text-slate-400 font-mono">
                      {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleConvertLocal}
                  disabled={!selectedFile || converting}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold rounded-xl shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer text-xs transition-all"
                >
                  {converting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>고음질 MP3 변환 중...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>MP3로 변환하기 (192kbps)</span>
                    </>
                  )}
                </button>

                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download={convertedFilename}
                    className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 text-xs transition-all animate-bounce"
                  >
                    <Download className="w-4 h-4" />
                    <span>MP3 다운로드</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Neon DB file */}
          {activeTab === 'db' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 font-medium">
                Neon DB 클라우드에 보관 중인 M4A 파일을 원클릭으로 MP3로 변환하여 새 오디오 항목으로 추가합니다:
              </p>

              {loadingDbFiles ? (
                <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                  <span>DB 오디오 목록 조회 중...</span>
                </div>
              ) : dbM4aFiles.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                  Neon DB에 보관된 M4A 파일이 없습니다.
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {dbM4aFiles.map((file) => (
                    <div 
                      key={file.id} 
                      className="p-3 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/80 hover:border-indigo-200 rounded-xl flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="min-w-0">
                        <h5 className="text-xs font-bold text-slate-800 truncate">{file.filename}</h5>
                        <p className="text-[11px] text-slate-400 font-mono">
                          {(file.file_size / (1024 * 1024)).toFixed(1)} MB
                        </p>
                      </div>
                      <button
                        onClick={() => handleConvertDbAudio(file)}
                        disabled={converting}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 flex-shrink-0 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {converting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ArrowRight className="w-3.5 h-3.5" />
                        )}
                        <span>MP3로 변환</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>변환된 MP3는 Whisper 음성인식 최적 표준 규격입니다.</span>
          <button 
            onClick={onClose}
            className="font-bold text-slate-600 hover:text-slate-800"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
}
