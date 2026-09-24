import React, { useState } from 'react';
import {
  X, Languages, Sparkles, ChevronRight, Globe2, Mic
} from 'lucide-react';

// Supported languages with native names and flags
const SUPPORTED_LANGUAGES = [
  { code: 'ko', name: '한국어', nativeName: '한국어', flag: '🇰🇷', color: 'bg-blue-50 border-blue-300 text-blue-800' },
  { code: 'en', name: '영어', nativeName: 'English', flag: '🇺🇸', color: 'bg-emerald-50 border-emerald-300 text-emerald-800' },
  { code: 'es', name: '스페인어', nativeName: 'Español', flag: '🇪🇸', color: 'bg-orange-50 border-orange-300 text-orange-800' },
  { code: 'zh', name: '중국어', nativeName: '中文', flag: '🇨🇳', color: 'bg-red-50 border-red-300 text-red-800' },
  { code: 'ja', name: '일본어', nativeName: '日本語', flag: '🇯🇵', color: 'bg-purple-50 border-purple-300 text-purple-800' },
  { code: 'fr', name: '프랑스어', nativeName: 'Français', flag: '🇫🇷', color: 'bg-indigo-50 border-indigo-300 text-indigo-800' },
  { code: 'de', name: '독일어', nativeName: 'Deutsch', flag: '🇩🇪', color: 'bg-yellow-50 border-yellow-300 text-yellow-800' },
  { code: 'pt', name: '포르투갈어', nativeName: 'Português', flag: '🇧🇷', color: 'bg-green-50 border-green-300 text-green-800' },
  { code: 'ru', name: '러시아어', nativeName: 'Русский', flag: '🇷🇺', color: 'bg-slate-50 border-slate-300 text-slate-800' },
  { code: 'ar', name: '아랍어', nativeName: 'العربية', flag: '🇸🇦', color: 'bg-teal-50 border-teal-300 text-teal-800' },
  { code: 'vi', name: '베트남어', nativeName: 'Tiếng Việt', flag: '🇻🇳', color: 'bg-rose-50 border-rose-300 text-rose-800' },
  { code: 'id', name: '인도네시아어', nativeName: 'Bahasa Indonesia', flag: '🇮🇩', color: 'bg-amber-50 border-amber-300 text-amber-800' },
];

export default function LangSelectModal({ isOpen, onClose, onStart, filename }) {
  const [selectedLangs, setSelectedLangs] = useState([]);
  const [mode, setMode] = useState('manual'); // 'auto' | 'manual'

  if (!isOpen) return null;

  const toggleLang = (code) => {
    setSelectedLangs(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleStart = () => {
    if (mode === 'auto') {
      onStart([]);  // empty = auto detect
    } else {
      onStart(selectedLangs);  // pass selected hints
    }
  };

  const canStart = mode === 'auto' || selectedLangs.length >= 1;

  const modeLabel = mode === 'auto'
    ? '자동 언어 감지'
    : selectedLangs.length === 0
      ? '언어를 선택해 주세요'
      : selectedLangs.length === 1
        ? `${SUPPORTED_LANGUAGES.find(l => l.code === selectedLangs[0])?.name} (단일 언어)`
        : `${selectedLangs.length}개 언어 혼합 (다국어 청크 분석)`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <Languages className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base leading-tight">STT 언어 설정</h3>
                <p className="text-[11px] text-blue-100 mt-0.5 truncate max-w-[320px]">
                  {filename ? `"${filename}"` : '오디오 파일'} 의 언어를 선택하세요
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">

          {/* Mode Selection */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5 block">
              감지 방식 선택
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setMode('auto')}
                className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                  mode === 'auto'
                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Globe2 className={`w-4 h-4 ${mode === 'auto' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className={`text-xs font-bold ${mode === 'auto' ? 'text-blue-700' : 'text-slate-700'}`}>
                    자동 감지
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  오디오 시작 부분 언어를 감지하여 전체 적용 (빠름, 단일 언어에 최적)
                </p>
              </button>

              <button
                onClick={() => setMode('manual')}
                className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                  mode === 'manual'
                    ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Mic className={`w-4 h-4 ${mode === 'manual' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span className={`text-xs font-bold ${mode === 'manual' ? 'text-indigo-700' : 'text-slate-700'}`}>
                    언어 직접 선택
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  녹음된 언어를 직접 선택 (2개 이상 선택 시 30초 단위 다국어 분석)
                </p>
              </button>
            </div>
          </div>

          {/* Language Grid (only in manual mode) */}
          {mode === 'manual' && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  녹음된 언어 선택 (복수 선택 가능)
                </label>
                {selectedLangs.length > 0 && (
                  <button
                    onClick={() => setSelectedLangs([])}
                    className="text-[11px] text-slate-400 hover:text-red-500 font-medium cursor-pointer"
                  >
                    전체 해제
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {SUPPORTED_LANGUAGES.map(lang => {
                  const selected = selectedLangs.includes(lang.code);
                  return (
                    <button
                      key={lang.code}
                      onClick={() => toggleLang(lang.code)}
                      className={`p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer flex items-center gap-2 ${
                        selected
                          ? `${lang.color} border-current shadow-sm ring-2 ring-current/20`
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <span className="text-base leading-none">{lang.flag}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{lang.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{lang.nativeName}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Multilingual notice */}
              {selectedLangs.length >= 2 && (
                <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-800">
                  <span className="font-bold">💡 다국어 청크 분석 모드 활성화:</span>
                  <span className="ml-1">
                    오디오를 30초 단위로 분할하여 각 구간의 언어를 독립적으로 감지합니다. 시간이 더 소요되지만 정확도가 높습니다.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Current selection summary */}
          <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            canStart ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
          }`}>
            <Sparkles className="w-4 h-4 flex-shrink-0" />
            <span>{modeLabel}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
          >
            취소
          </button>
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
          >
            <Sparkles className="w-4 h-4" />
            STT 시작
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
}
