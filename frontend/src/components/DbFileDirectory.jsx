import React, { useState, useEffect } from 'react';
import { 
  FolderArchive, 
  Download, 
  Trash2, 
  Search, 
  RefreshCw, 
  FileAudio, 
  Clock, 
  CheckCircle,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import axios from 'axios';

const LANG_COLORS = {
  ko: 'bg-blue-100 text-blue-800 border-blue-200',
  en: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  es: 'bg-orange-100 text-orange-800 border-orange-200',
  zh: 'bg-red-100 text-red-800 border-red-200',
  ja: 'bg-purple-100 text-purple-800 border-purple-200',
  pt: 'bg-pink-100 text-pink-800 border-pink-200',
};

function formatTime(secs) {
  if (!secs) return '00:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function DbFileDirectory({ 
  onSelectRecord, 
  currentRecordId,
  refreshTrigger 
}) {
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [exportingId, setExportingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/records', {
        params: { search: search.trim() || undefined }
      });
      setRecords(res.data);
    } catch (err) {
      console.error('Failed to fetch DB records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [refreshTrigger]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchRecords();
  };

  const handleExport = async (e, record, format) => {
    e.stopPropagation();
    setExportingId(record.id);
    try {
      const response = await axios.get(`/api/records/${record.id}/export`, {
        params: { format },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const base = record.filename.replace(/\.[^/.]+$/, '');
      link.setAttribute('download', `${base}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('파일 다운로드에 실패했습니다.');
    } finally {
      setExportingId(null);
    }
  };

  const handleDelete = async (e, record) => {
    e.stopPropagation();
    if (!window.confirm(`정말 "${record.filename}" 기록을 DB에서 완전 삭제하시겠습니까?`)) {
      return;
    }
    setDeletingId(record.id);
    try {
      await axios.delete(`/api/records/${record.id}`);
      setRecords(prev => prev.filter(r => r.id !== record.id));
      if (currentRecordId === record.id) {
        onSelectRecord(null);
      }
    } catch (err) {
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-sm md:text-base leading-tight">DB File directory</h2>
              <p className="text-[11px] text-slate-500 font-medium">Neon PostgreSQL 연동 저장소</p>
            </div>
          </div>
          <button 
            onClick={fetchRecords} 
            disabled={loading}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="파일명 검색..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
          />
        </form>
      </div>

      {/* Record List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 divide-y divide-slate-50">
        {records.length === 0 ? (
          <div className="text-center py-12 px-4">
            <FolderArchive className="w-10 h-10 mx-auto text-slate-300 mb-2 stroke-1" />
            <p className="text-xs text-slate-500 font-medium">저장된 STT 파일이 없습니다.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">오디오 변환 후 DB에 저장해 보세요.</p>
          </div>
        ) : (
          records.map((record) => {
            const isSelected = currentRecordId === record.id;
            return (
              <div
                key={record.id}
                onClick={() => onSelectRecord(record)}
                className={`group p-3 rounded-xl border transition-all cursor-pointer relative ${
                  isSelected 
                    ? 'bg-blue-50/80 border-blue-300 shadow-sm' 
                    : 'bg-white hover:bg-slate-50/80 border-slate-200/70 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileAudio className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-500'}`} />
                    <span className="text-xs font-semibold text-slate-800 truncate" title={record.filename}>
                      {record.filename}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                    {formatTime(record.duration)}
                  </span>
                </div>

                {/* Languages Badges */}
                <div className="flex items-center gap-1 flex-wrap mb-2">
                  {record.detected_languages && record.detected_languages.map(lang => (
                    <span 
                      key={lang}
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase ${
                        LANG_COLORS[lang] || 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {lang}
                    </span>
                  ))}
                  <span className="text-[10px] text-slate-400 ml-auto">
                    {record.created_at ? new Date(record.created_at).toLocaleDateString() : ''}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleExport(e, record, 'txt')}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-600 font-medium rounded transition-colors text-[10px]"
                      title="텍스트 파일로 저장"
                    >
                      TXT 저장
                    </button>
                    <button
                      onClick={(e) => handleExport(e, record, 'html')}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-600 font-medium rounded transition-colors text-[10px]"
                      title="HTML 보고서로 저장"
                    >
                      HTML 저장
                    </button>
                  </div>

                  <button
                    onClick={(e) => handleDelete(e, record)}
                    disabled={deletingId === record.id}
                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="DB에서 완전 삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer info */}
      <div className="p-3 bg-slate-50 border-t border-slate-100 text-center text-[11px] text-slate-400 font-medium">
        총 {records.length}건의 음성 인식 기록
      </div>
    </div>
  );
}
