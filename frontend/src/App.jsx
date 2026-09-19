import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  LogOut, 
  Layers, 
  ShieldCheck, 
  Globe2, 
  Database 
} from 'lucide-react';
import AdminLogin from './components/AdminLogin';
import DbFileDirectory from './components/DbFileDirectory';
import MainWorkspace from './components/MainWorkspace';
import AudioProgressPlayer from './components/AudioProgressPlayer';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTime, setSeekTime] = useState(null);
  const [refreshDbTrigger, setRefreshDbTrigger] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token === 'admin-token-123jesus') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setIsAuthenticated(false);
  };

  const handleSelectDbRecord = (record) => {
    if (!record) {
      setCurrentAudio(null);
      return;
    }
    setCurrentAudio({
      id: record.id,
      url: record.audio_url || `/api/audio/${record.id}`,
      filename: record.filename,
      duration: record.duration,
      detected_languages: record.detected_languages,
      segments: record.segments,
      full_text: record.full_text,
      isFromDb: true
    });
  };

  return (
    <div className="h-screen flex flex-col bg-[#f8fafc] text-slate-800 select-none overflow-hidden font-sans">
      {/* Admin Login Modal if not logged in */}
      {!isAuthenticated && (
        <AdminLogin onLoginSuccess={() => setIsAuthenticated(true)} />
      )}

      {/* Top Header */}
      <header className="h-14 bg-white border-b border-slate-200/80 px-5 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Globe2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm md:text-base font-bold text-slate-800 leading-none">
              AI 다국어 음성인식 & 타임스탬프 스튜디오
            </h1>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              faster-whisper Small · int8 · VAD 자동 감지 · Neon DB
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                관리자 (admin)
              </span>
              <button
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="로그아웃"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              인증 대기 중
            </span>
          )}
        </div>
      </header>

      {/* Main 3-Area Body Layout */}
      <div className="flex-1 p-3.5 md:p-4 flex flex-col gap-3 min-h-0">
        {/* Top 2 Columns: [DB File directory] (Left) & [Text Workspace] (Right) */}
        <div className="flex-1 grid grid-cols-12 gap-3 min-h-0">
          {/* Left: DB File directory (3 cols on lg, 4 cols on md) */}
          <div className="col-span-12 md:col-span-4 lg:col-span-3 min-h-0">
            <DbFileDirectory
              onSelectRecord={handleSelectDbRecord}
              currentRecordId={currentAudio?.id}
              refreshTrigger={refreshDbTrigger}
            />
          </div>

          {/* Right: text (Main Workspace) (9 cols on lg, 8 cols on md) */}
          <div className="col-span-12 md:col-span-8 lg:col-span-9 min-h-0">
            <MainWorkspace
              currentAudio={currentAudio}
              onAudioLoaded={(audioData) => setCurrentAudio(audioData)}
              onSeekAudio={(time) => setSeekTime(time)}
              currentTime={currentTime}
              onSaveCompleted={() => setRefreshDbTrigger(prev => prev + 1)}
            />
          </div>
        </div>

        {/* Bottom Fixed Area: Audio file play progress */}
        <div className="h-20 flex-shrink-0">
          <AudioProgressPlayer
            currentAudio={currentAudio}
            seekTime={seekTime}
            onTimeUpdate={(time) => setCurrentTime(time)}
          />
        </div>
      </div>
    </div>
  );
}
