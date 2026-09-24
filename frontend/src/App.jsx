import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  LogOut,
  ShieldCheck,
  Globe2,
  Music
} from 'lucide-react';
import axios from 'axios';
import AdminLogin from './components/AdminLogin';
import DbFileDirectory from './components/DbFileDirectory';
import MainWorkspace from './components/MainWorkspace';
import AudioProgressPlayer from './components/AudioProgressPlayer';
import M4aConverterModal from './components/M4aConverterModal';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTime, setSeekTime] = useState(null);
  const [refreshDbTrigger, setRefreshDbTrigger] = useState(0);
  const [sttTriggerItem, setSttTriggerItem] = useState(null);
  const [showConverterModal, setShowConverterModal] = useState(false);

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

  const handleSelectDbFile = async (fileItem) => {
    if (!fileItem) {
      setCurrentAudio(null);
      return;
    }

    if (fileItem.type === 'audio') {
      setCurrentAudio({
        id: fileItem.id,
        url: `/api/db/audio/${fileItem.id}`,
        filename: fileItem.filename,
        duration: 0,
        type: 'audio',
        isFromDb: true
      });
    } else if (fileItem.type === 'document') {
      try {
        const res = await axios.get(`/api/db/documents/${fileItem.id}`);
        const doc = res.data;
        setCurrentAudio({
          id: doc.id,
          url: doc.audio_url || null,
          filename: doc.filename,
          duration: doc.duration,
          detected_languages: doc.detected_languages,
          segments: doc.segments,
          content_txt: doc.content_txt,
          content_html: doc.content_html,
          type: 'document',
          isFromDb: true
        });
      } catch (err) {
        alert('문서 데이터를 불러오는 중 오류가 발생했습니다.');
      }
    }
  };

  const handleStartSttFromDb = (audioItem) => {
    setCurrentAudio({
      id: audioItem.id,
      url: `/api/db/audio/${audioItem.id}`,
      filename: audioItem.filename,
      duration: 0,
      type: 'audio',
      isFromDb: true
    });
    setSttTriggerItem(audioItem);
  };

  return (
    <div className="h-screen flex flex-col bg-[#f8fafc] text-slate-800 select-none overflow-hidden font-sans">
      {/* Admin Login Modal if not logged in */}
      {!isAuthenticated && (
        <AdminLogin onLoginSuccess={() => setIsAuthenticated(true)} />
      )}

      {/* M4A → MP3 Converter Modal */}
      <M4aConverterModal
        isOpen={showConverterModal}
        onClose={() => setShowConverterModal(false)}
        onConversionSuccess={() => {
          setRefreshDbTrigger(t => t + 1);
          setShowConverterModal(false);
        }}
      />

      {/* Top Header */}
      <header className="h-14 bg-white border-b border-slate-200/80 px-5 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Globe2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm md:text-base font-bold text-slate-800 leading-none">
              AI 다국어 음성인식 &amp; Neon DB 스튜디오
            </h1>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              faster-whisper · Neon PostgreSQL 클라우드 오디오/문서 통합 저장소
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* M4A → MP3 변환 버튼 */}
          {isAuthenticated && (
            <button
              onClick={() => setShowConverterModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-xl shadow-sm shadow-indigo-500/20 text-xs transition-all cursor-pointer"
              title="M4A / AAC 오디오 파일을 고음질 MP3(192kbps)로 변환"
            >
              <Music className="w-3.5 h-3.5" />
              <span>M4A → MP3 변환</span>
            </button>
          )}

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
        {/* Top 2 Columns */}
        <div className="flex-1 grid grid-cols-12 gap-3 min-h-0">
          {/* Left: DB File directory */}
          <div className="col-span-12 md:col-span-4 lg:col-span-4 min-h-0">
            <DbFileDirectory
              onSelectFile={handleSelectDbFile}
              onStartSttFromDb={handleStartSttFromDb}
              refreshTrigger={refreshDbTrigger}
            />
          </div>

          {/* Right: Main Workspace */}
          <div className="col-span-12 md:col-span-8 lg:col-span-8 min-h-0">
            <MainWorkspace
              currentAudio={currentAudio}
              currentTime={currentTime}
              onAudioLoaded={setCurrentAudio}
              onSeek={(t) => setSeekTime(t)}
              onSaveCompleted={() => setRefreshDbTrigger(t => t + 1)}
              sttTriggerItem={sttTriggerItem}
              onSttTriggerConsumed={() => setSttTriggerItem(null)}
            />
          </div>
        </div>

        {/* Bottom: Audio Player */}
        <div className="h-16 flex-shrink-0">
          <AudioProgressPlayer
            currentAudio={currentAudio}
            seekTime={seekTime}
            onTimeUpdate={(t) => setCurrentTime(t)}
          />
        </div>
      </div>
    </div>
  );
}
