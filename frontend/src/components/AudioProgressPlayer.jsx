import React, { useRef, useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  RotateCcw, 
  RotateCw,
  FileAudio,
  Radio
} from 'lucide-react';

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function AudioProgressPlayer({ 
  currentAudio, 
  seekTime, 
  onTimeUpdate 
}) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Audio source change
  useEffect(() => {
    if (audioRef.current && currentAudio?.url) {
      audioRef.current.src = currentAudio.url;
      audioRef.current.load();
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, [currentAudio?.url]);

  // Handle external seek
  useEffect(() => {
    if (audioRef.current && typeof seekTime === 'number' && !isNaN(seekTime)) {
      audioRef.current.currentTime = seekTime;
      setCurrentTime(seekTime);
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [seekTime]);

  const togglePlay = () => {
    if (!audioRef.current || !currentAudio?.url) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime;
      setCurrentTime(cur);
      onTimeUpdate(cur);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleSeek = (e) => {
    const target = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = target;
      setCurrentTime(target);
      onTimeUpdate(target);
    }
  };

  const skipTime = (offset) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + offset));
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      if (val === 0) setIsMuted(true);
      else setIsMuted(false);
    }
  };

  return (
    <div className="h-full bg-white border border-slate-200/80 rounded-2xl shadow-sm px-4 md:px-6 py-3 flex items-center justify-between gap-4">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Track info & Play button */}
      <div className="flex items-center gap-3 min-w-[200px] md:min-w-[260px]">
        <button
          onClick={togglePlay}
          disabled={!currentAudio?.url}
          className="w-11 h-11 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl flex items-center justify-center shadow-md shadow-blue-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
          title="작동 (재생/일시정지)"
        >
          {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <FileAudio className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
            <h4 className="text-xs font-bold text-slate-800 truncate">
              {currentAudio?.filename || '오디오 파일을 로드하세요'}
            </h4>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">Audio file play progress</p>
        </div>
      </div>

      {/* Progress timeline */}
      <div className="flex-1 flex items-center gap-3 max-w-3xl">
        <button
          onClick={() => skipTime(-10)}
          disabled={!currentAudio?.url}
          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-30"
          title="10초 뒤로"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <span className="font-mono text-xs font-semibold text-slate-500 min-w-[42px] text-right">
          {formatTime(currentTime)}
        </span>

        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          disabled={!currentAudio?.url}
          className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 border border-slate-200/80"
        />

        <span className="font-mono text-xs font-semibold text-slate-500 min-w-[42px]">
          {formatTime(duration)}
        </span>

        <button
          onClick={() => skipTime(10)}
          disabled={!currentAudio?.url}
          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-30"
          title="10초 앞으로"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>

      {/* Volume control */}
      <div className="hidden md:flex items-center gap-2 min-w-[140px]">
        <button
          onClick={toggleMute}
          disabled={!currentAudio?.url}
          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
        >
          {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          disabled={!currentAudio?.url}
          className="w-20 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
      </div>
    </div>
  );
}
