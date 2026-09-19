import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  Play,
  Save,
  Copy,
  Check,
  Volume2,
  Languages,
  Sparkles,
  Clock,
  FileAudio,
  Loader2,
  Filter,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import axios from 'axios';
import SaveModal from './SaveModal';

const LANG_CONFIG = {
  ko: { name: '한국어', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  en: { name: '영어', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  es: { name: '스페인어', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  zh: { name: '중국어', color: 'bg-red-100 text-red-800 border-red-200' },
  ja: { name: '일본어', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  pt: { name: '포르투갈어', color: 'bg-pink-100 text-pink-800 border-pink-200' },
};

function formatTimestamp(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function MainWorkspace({
  currentAudio,
  onAudioLoaded,
  onSeekAudio,
  currentTime,
  onSaveCompleted
}) {
  const [file, setFile] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedLangFilter, setSelectedLangFilter] = useState('all');
  const [copied, setCopied] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  const fileInputRef = useRef(null);
  const pollingRef = useRef(null);

  useEffect(() => {
    if (currentAudio && currentAudio.isFromDb) {
      setFile(null);
      setTaskId(null);
      setTaskStatus('completed');
      setProgress(100);
      setStatusMessage('DB에서 불러온 기록');
      setErrorMsg('');
      setResult({
        duration: currentAudio.duration,
        detected_languages: currentAudio.detected_languages || [],
        segments: currentAudio.segments || [],
        full_text: currentAudio.full_text || ''
      });
    }
  }, [currentAudio]);

  useEffect(() => () => stopPolling(), []);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    stopPolling();
    setFile(selected);
    setTaskId(null);
    setTaskStatus('ready');
    setProgress(0);
    setStatusMessage(`선택된 파일: ${selected.name} (${(selected.size / (1024 * 1024)).toFixed(1)} MB)`);
    setResult(null);
    setErrorMsg('');

    const localUrl = URL.createObjectURL(selected);
    onAudioLoaded({ url: localUrl, filename: selected.name, duration: 0, isFromDb: false });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      const fakeEvent = { target: { files: [dropped] } };
      handleFileChange(fakeEvent);
    }
  };

  // ── 1MB Chunked Streaming Upload (150MB+ Safe) ───────────────────
  const startUploadAndStt = async () => {
    if (!file) return;
    stopPolling();
    setErrorMsg('');
    setTaskStatus('uploading');
    setProgress(1);

    const CHUNK_SIZE = 1 * 1024 * 1024; // 1 MB chunk
    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
    const totalMbStr = (totalSize / (1024 * 1024)).toFixed(1);

    setStatusMessage(`대용량 청크 전송 초기화 중... (총 ${totalMbStr} MB / ${totalChunks}개 청크)`);

    let finalTaskId = null;

    try {
      // 1. Initialize chunked upload session
      const initRes = await axios.post('/api/upload/init', {
        filename: file.name,
        total_size: totalSize,
        total_chunks: totalChunks
      });
      const uploadId = initRes.data.upload_id;

      // 2. Upload chunks in loop (1MB each, completely bypasses Vercel 4.5MB payload limit)
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(totalSize, start + CHUNK_SIZE);
        const chunkBlob = file.slice(start, end);

        const chunkFormData = new FormData();
        chunkFormData.append('upload_id', uploadId);
        chunkFormData.append('chunk_index', i);
        chunkFormData.append('chunk', chunkBlob, `${file.name}.part${i}`);

        await axios.post('/api/upload/chunk', chunkFormData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        const uploadedMb = ((end) / (1024 * 1024)).toFixed(1);
        const uploadPercent = Math.round(((i + 1) / totalChunks) * 35); // 0% ~ 35% for upload
        setProgress(uploadPercent);
        setStatusMessage(`1MB 청크 스트리밍 전송 중... [${uploadedMb} MB / ${totalMbStr} MB] (${i + 1}/${totalChunks})`);
      }

      // 3. Complete chunked upload and merge
      setStatusMessage('오디오 청크 결합 및 검증 중...');
      const completeFormData = new FormData();
      completeFormData.append('upload_id', uploadId);
      const completeRes = await axios.post('/api/upload/complete', completeFormData);

      finalTaskId = completeRes.data.task_id;
      setTaskId(finalTaskId);
      onAudioLoaded({
        url: completeRes.data.audio_url,
        filename: completeRes.data.filename,
        duration: 0,
        isFromDb: false
      });

      // 4. Trigger STT processing
      setTaskStatus('processing');
      setProgress(38);
      setStatusMessage('faster-whisper 모델 구동 및 VAD 음성 구간 분석 시작...');

      await axios.post(`/api/tasks/${finalTaskId}/start`);
      startPolling(finalTaskId);

    } catch (err) {
      setTaskStatus('failed');
      const errDetail = err.response?.data?.detail || err.message || '업로드 중 오류가 발생했습니다.';
      setErrorMsg(`업로드 오류: ${errDetail}`);
      setStatusMessage('');
    }
  };

  const startPolling = (tId) => {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`/api/tasks/${tId}`);
        const data = res.data;

        if (data.status === 'processing') {
          const pct = Math.max(38, Math.round(data.progress || 38));
          setProgress(pct);
          setStatusMessage(data.message || '다국어 음성 인식 분석 중...');
        } else if (data.status === 'completed') {
          stopPolling();
          setTaskStatus('completed');
          setProgress(100);
          setStatusMessage(`✅ 완료! 총 ${data.result?.segments?.length || 0}개 구간 인식`);
          setResult(data.result);
        } else if (data.status === 'failed') {
          stopPolling();
          setTaskStatus('failed');
          setErrorMsg(data.message || 'STT 처리에 실패했습니다.');
          setStatusMessage('');
        }
      } catch (err) {
        console.warn('Polling error (will retry):', err.message);
      }
    }, 2000);
  };

  const copyToClipboard = () => {
    if (!result) return;
    const text = result.segments
      ? result.segments.map(s => `[${formatTimestamp(s.start)} -> ${formatTimestamp(s.end)}] [${s.language}] ${s.text}`).join('\n')
      : result.full_text;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const segments = result?.segments || [];
  const filteredSegments = selectedLangFilter === 'all'
    ? segments
    : segments.filter(s => (s.language || '').toLowerCase() === selectedLangFilter);
  const detectedLanguages = result?.detected_languages || [];

  const isWorking = taskStatus === 'uploading' || taskStatus === 'processing';

  return (
    <div
      className="h-full flex flex-col bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* ── Control Bar ─────────────────────────────────────────────── */}
      <div className="p-4 border-b border-slate-100 bg-gradient-to-b from-slate-50/60 to-white">
        <div className="flex flex-wrap items-center justify-between gap-3">

          {/* File picker */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 flex items-center gap-2 transition-all"
            >
              <UploadCloud className="w-4 h-4 text-blue-600" />
              오디오 파일 선택
            </button>
            {file && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl text-xs font-semibold text-blue-800 max-w-[240px] truncate">
                <FileAudio className="w-3.5 h-3.5 flex-shrink-0 text-blue-600" />
                {file.name}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={startUploadAndStt}
              disabled={!file || isWorking}
              className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isWorking
                ? <><Loader2 className="w-4 h-4 animate-spin" /><span>인식 진행 중...</span></>
                : <><Play className="w-4 h-4 fill-white" /><span>작동 (STT 시작)</span></>}
            </button>

            <button
              onClick={() => setIsSaveModalOpen(true)}
              disabled={!result}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" /><span>저장</span>
            </button>

            <button
              onClick={copyToClipboard}
              disabled={!result}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all disabled:opacity-40"
              title="전체 텍스트 복사"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {isWorking && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
              <span className="flex items-center gap-1.5 truncate max-w-[80%]">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 flex-shrink-0" />
                {statusMessage}
              </span>
              <span className="font-mono text-blue-600 ml-2">{progress}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
              <div
                className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1 text-center font-medium">
              ⚡ 1MB 청크 스트리밍 방식으로 대용량 오디오(150MB+)를 메모리 과부하 없이 안정적으로 전송합니다.
            </p>
          </div>
        )}

        {/* Status messages */}
        {taskStatus === 'completed' && !isWorking && (
          <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            {statusMessage}
          </div>
        )}

        {errorMsg && (
          <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {errorMsg}
          </div>
        )}
      </div>

      {/* ── Language Filter Bar ─────────────────────────────────────── */}
      {result && (
        <div className="px-4 py-2 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-400 font-bold flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" /> 언어 필터:
            </span>
            <button
              onClick={() => setSelectedLangFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${selectedLangFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
            >
              전체 ({segments.length})
            </button>
            {detectedLanguages.map(l => (
              <button
                key={l}
                onClick={() => setSelectedLangFilter(l)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase transition-all ${selectedLangFilter === l ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
              >
                {l} ({segments.filter(s => (s.language || '').toLowerCase() === l).length})
              </button>
            ))}
          </div>
          <span className="text-slate-400 font-medium">
            {result.duration ? formatTimestamp(result.duration) : ''} · {filteredSegments.length}개 구간
          </span>
        </div>
      )}

      {/* ── Transcript Area ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-2.5 bg-slate-50/30">
        {!result ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 bg-blue-50 border border-blue-100 rounded-3xl flex items-center justify-center text-blue-600 mb-4 shadow-sm">
              <Languages className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-slate-800 text-base mb-1">STT 변환 결과 공간</h3>
            <p className="text-xs text-slate-500 max-w-sm leading-relaxed mb-4">
              MP3 또는 M4A 오디오 파일을 업로드하고 <strong>[작동]</strong> 버튼을 누르면 구간별 다국어 인식 결과가 타임스탬프와 함께 시각화됩니다.
            </p>
            <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap justify-center">
              {Object.entries(LANG_CONFIG).map(([code, cfg]) => (
                <span key={code} className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${cfg.color.split(' ')[0]}`}></span>
                  {cfg.name}
                </span>
              ))}
            </div>
          </div>
        ) : filteredSegments.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            선택된 언어로 인식된 구간이 없습니다.
          </div>
        ) : (
          filteredSegments.map((seg, idx) => {
            const isActive = currentTime >= seg.start && currentTime <= seg.end;
            const langCode = (seg.language || 'unk').toLowerCase();
            const langCfg = LANG_CONFIG[langCode] || { name: langCode.toUpperCase(), color: 'bg-slate-100 text-slate-800 border-slate-200' };

            return (
              <div
                key={idx}
                onClick={() => onSeekAudio(seg.start)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-50/90 border-blue-400 ring-2 ring-blue-400/30 shadow-md'
                    : 'bg-white hover:bg-slate-50 border-slate-200/80 hover:border-slate-300 shadow-sm'
                }`}
              >
                <div className="flex items-center flex-wrap gap-2 mb-1.5">
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    [{formatTimestamp(seg.start)} → {formatTimestamp(seg.end)}]
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${langCfg.color}`}>
                    {seg.language} ({langCfg.name})
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    신뢰도 {((seg.probability || 0) * 100).toFixed(0)}%
                  </span>
                  {isActive && (
                    <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-blue-600 animate-pulse">
                      <Volume2 className="w-3.5 h-3.5" /> 재생 중
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-slate-800 leading-relaxed pl-1">{seg.text}</p>
              </div>
            );
          })
        )}
      </div>

      {/* Save Modal */}
      <SaveModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        taskId={taskId}
        filename={file?.name || currentAudio?.filename || 'stt_transcript'}
        onSaveCompleted={(data) => { onSaveCompleted(data); }}
      />
    </div>
  );
}
