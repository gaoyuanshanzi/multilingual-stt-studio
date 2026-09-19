import React, { useState, useRef } from 'react';
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
  if (typeof seconds !== 'number') return '00:00';
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
  const [taskStatus, setTaskStatus] = useState('idle'); // idle, uploading, processing, completed, failed
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [result, setResult] = useState(null);
  
  const [selectedLangFilter, setSelectedLangFilter] = useState('all');
  const [copied, setCopied] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  const fileInputRef = useRef(null);

  // Sync if currentAudio changes from DB file directory selection
  React.useEffect(() => {
    if (currentAudio && currentAudio.isFromDb) {
      setFile(null);
      setTaskId(null);
      setTaskStatus('completed');
      setProgress(100);
      setStatusMessage('DB에서 불러온 기록');
      setResult({
        duration: currentAudio.duration,
        detected_languages: currentAudio.detected_languages || [],
        segments: currentAudio.segments || [],
        full_text: currentAudio.full_text || ''
      });
    }
  }, [currentAudio]);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setTaskStatus('ready');
      setProgress(0);
      setStatusMessage(`선택된 파일: ${selected.name} (${(selected.size / (1024*1024)).toFixed(1)}MB)`);
      setResult(null);

      // Local audio preview URL
      const localUrl = URL.createObjectURL(selected);
      onAudioLoaded({
        url: localUrl,
        filename: selected.name,
        duration: 0,
        isFromDb: false
      });
    }
  };

  const startUploadAndStt = async () => {
    if (!file) return;

    setTaskStatus('uploading');
    setProgress(5);
    setStatusMessage('오디오 파일 스트리밍 업로드 중 (1MB 청크)...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadRes = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 30) / progressEvent.total);
            setProgress(percent);
          }
        }
      });

      const newTaskId = uploadRes.data.task_id;
      setTaskId(newTaskId);

      // Update audio to backend URL
      onAudioLoaded({
        url: uploadRes.data.audio_url,
        filename: uploadRes.data.filename,
        duration: 0,
        isFromDb: false
      });

      // Start STT process
      setTaskStatus('processing');
      setStatusMessage('faster-whisper 모델 구동 및 VAD 구간 감지 시작...');
      await axios.post(`/api/tasks/${newTaskId}/start`);

      // Poll status
      pollTaskStatus(newTaskId);
    } catch (err) {
      setTaskStatus('failed');
      setStatusMessage(err.response?.data?.detail || '업로드 및 STT 요청에 실패했습니다.');
    }
  };

  const pollTaskStatus = (tId) => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`/api/tasks/${tId}`);
        const data = res.data;

        if (data.status === 'processing') {
          setProgress(Math.max(30, Math.round(data.progress || 35)));
          setStatusMessage(data.message || '다국어 음성 인식 분석 중...');
        } else if (data.status === 'completed') {
          clearInterval(interval);
          setTaskStatus('completed');
          setProgress(100);
          setStatusMessage('음성 인식이 성공적으로 완료되었습니다!');
          setResult(data.result);
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setTaskStatus('failed');
          setStatusMessage(data.message || 'STT 처리에 실패했습니다.');
        }
      } catch (err) {
        clearInterval(interval);
        setTaskStatus('failed');
        setStatusMessage('작업 상태 조회 실패');
      }
    }, 1500);
  };

  const copyToClipboard = () => {
    if (!result) return;
    const textToCopy = result.segments
      ? result.segments.map(s => `[${formatTimestamp(s.start)} -> ${formatTimestamp(s.end)}] [${s.language}] ${s.text}`).join('\n')
      : result.full_text;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const segments = result?.segments || [];
  const filteredSegments = selectedLangFilter === 'all'
    ? segments
    : segments.filter(s => s.language?.toLowerCase() === selectedLangFilter.toLowerCase());

  const detectedLanguages = result?.detected_languages || [];

  return (
    <div className="h-full flex flex-col bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
      {/* Top Action & Control Bar */}
      <div className="p-4 border-b border-slate-100 bg-gradient-to-b from-slate-50/60 to-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* File Upload Trigger */}
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
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200/80 active:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-2 border border-slate-200"
            >
              <UploadCloud className="w-4 h-4 text-blue-600" />
              <span>오디오 파일 선택</span>
            </button>

            {/* File info pill */}
            {file && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl text-xs font-semibold text-blue-800">
                <FileAudio className="w-3.5 h-3.5 text-blue-600" />
                <span className="max-w-[160px] md:max-w-[240px] truncate">{file.name}</span>
              </div>
            )}
          </div>

          {/* Action Buttons: 작동 (STT 시작) & 저장 */}
          <div className="flex items-center gap-2">
            <button
              onClick={startUploadAndStt}
              disabled={!file || taskStatus === 'uploading' || taskStatus === 'processing'}
              className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:from-blue-800 active:to-indigo-800 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {taskStatus === 'uploading' || taskStatus === 'processing' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>인식 진행 중...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>작동 (STT 시작)</span>
                </>
              )}
            </button>

            <button
              onClick={() => setIsSaveModalOpen(true)}
              disabled={!result}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>저장</span>
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

        {/* Progress bar and Status Banner */}
        {(taskStatus === 'uploading' || taskStatus === 'processing') && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                {statusMessage}
              </span>
              <span className="font-mono text-blue-600">{progress}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
              <div 
                className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Language Filter & Meta Bar */}
      {result && (
        <div className="px-4 py-2 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-400 font-bold flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" /> 언어 필터:
            </span>
            <button
              onClick={() => setSelectedLangFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                selectedLangFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              전체 ({segments.length})
            </button>
            {detectedLanguages.map(l => (
              <button
                key={l}
                onClick={() => setSelectedLangFilter(l)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase transition-all ${
                  selectedLangFilter.toLowerCase() === l.toLowerCase()
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {l} ({segments.filter(s => s.language?.toLowerCase() === l.toLowerCase()).length})
              </button>
            ))}
          </div>

          <div className="text-slate-400 font-medium">
            총 {result.duration ? `${formatTimestamp(result.duration)}` : ''} · 구간 {filteredSegments.length}개
          </div>
        </div>
      )}

      {/* Text Area (Main Transcript visualization) */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 bg-slate-50/30">
        {!result ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 bg-blue-50 border border-blue-100 rounded-3xl flex items-center justify-center text-blue-600 mb-4 shadow-sm">
              <Languages className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-slate-800 text-base mb-1">STT 변환 결과 공간</h3>
            <p className="text-xs text-slate-500 max-w-sm leading-relaxed mb-4">
              MP3 또는 M4A 오디오 파일을 업로드하고 <strong>[작동]</strong> 버튼을 누르면 구간별 다국어 인식 결과가 타임스탬프와 함께 시각화됩니다.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span> 한국어
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> 영어
              <span className="w-2 h-2 rounded-full bg-orange-500"></span> 스페인어
              <span className="w-2 h-2 rounded-full bg-red-500"></span> 중국어
              <span className="w-2 h-2 rounded-full bg-purple-500"></span> 일본어
              <span className="w-2 h-2 rounded-full bg-pink-500"></span> 포르투갈어
            </div>
          </div>
        ) : (
          filteredSegments.map((seg, idx) => {
            const isCurrentlyPlaying = currentTime >= seg.start && currentTime <= seg.end;
            const langCode = (seg.language || 'unk').toLowerCase();
            const langStyle = LANG_CONFIG[langCode] || { 
              name: langCode.toUpperCase(), 
              color: 'bg-slate-100 text-slate-800 border-slate-200' 
            };

            return (
              <div
                key={idx}
                onClick={() => onSeekAudio(seg.start)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  isCurrentlyPlaying
                    ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-400/30 shadow-md'
                    : 'bg-white hover:bg-slate-50/80 border-slate-200/80 hover:border-slate-300 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2">
                    {/* Clickable timestamp */}
                    <button
                      className="font-mono text-xs font-bold text-blue-700 hover:underline flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded border border-blue-100"
                      title="이 구간부터 오디오 재생"
                    >
                      <Clock className="w-3 h-3" />
                      [{formatTimestamp(seg.start)} &rarr; {formatTimestamp(seg.end)}]
                    </button>

                    {/* Language Badge */}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${langStyle.color}`}>
                      {seg.language} ({langStyle.name})
                    </span>

                    {/* Probability */}
                    <span className="text-[10px] text-slate-400 font-medium">
                      신뢰도 {(seg.probability * 100).toFixed(0)}%
                    </span>
                  </div>

                  {isCurrentlyPlaying && (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-blue-600 animate-pulse">
                      <Volume2 className="w-3.5 h-3.5" /> 재생 중
                    </span>
                  )}
                </div>

                {/* Segment Text */}
                <p className="text-sm font-medium text-slate-800 leading-relaxed pl-1">
                  {seg.text}
                </p>
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
        filename={file ? file.name : currentAudio?.filename || 'stt_transcript'}
        onSaveCompleted={(data) => {
          onSaveCompleted(data);
        }}
      />
    </div>
  );
}
