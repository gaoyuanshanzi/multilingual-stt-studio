import React, { useState, useEffect } from 'react';
import {
  FolderArchive,
  Download,
  Trash2,
  Search,
  RefreshCw,
  FileAudio,
  FileText,
  Clock,
  CheckCircle,
  Play,
  HardDrive,
  Filter,
  Sparkles
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
  if (!secs || isNaN(secs)) return '00:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function DbFileDirectory({
  onSelectFile,
  currentFileId,
  refreshTrigger,
  onStartSttFromDb
}) {
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState('all'); // 'all', 'audio', 'document'
  const [actionId, setActionId] = useState(null);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/db/files', {
        params: { search: search.trim() || undefined }
      });
      setFiles(res.data);
    } catch (err) {
      console.error('Failed to fetch DB files:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [refreshTrigger]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchFiles();
  };

  // 오디오 파일 Neon DB에서 완전 삭제 (150MB 용량 회수)
  const handleDeleteAudio = async (e, fileItem) => {
    e.stopPropagation();
    const sizeStr = formatSize(fileItem.file_size);
    if (!window.confirm(`정말 "${fileItem.filename}" 오디오 파일을 Neon DB에서 완전 삭제하시겠습니까?\n(약 ${sizeStr}의 DB 저장 공간이 즉시 확보됩니다.)`)) {
      return;
    }
    setActionId(`delete_audio_${fileItem.id}`);
    try {
      const res = await axios.delete(`/api/db/audio/${fileItem.id}`);
      alert(res.data.message || '오디오 파일이 Neon DB에서 완전 삭제되었습니다.');
      setFiles(prev => prev.filter(f => !(f.type === 'audio' && f.id === fileItem.id)));
    } catch (err) {
      alert('오디오 삭제 중 오류가 발생했습니다.');
    } finally {
      setActionId(null);
    }
  };

  // STT 문서 삭제
  const handleDeleteDoc = async (e, docItem) => {
    e.stopPropagation();
    if (!window.confirm(`정말 "${docItem.filename}" STT 문서를 삭제하시겠습니까?`)) {
      return;
    }
    setActionId(`delete_doc_${docItem.id}`);
    try {
      await axios.delete(`/api/db/documents/${docItem.id}`);
      setFiles(prev => prev.filter(f => !(f.type === 'document' && f.id === docItem.id)));
    } catch (err) {
      alert('문서 삭제 중 오류가 발생했습니다.');
    } finally {
      setActionId(null);
    }
  };

  // 다른 이름으로 저장 (TXT 또는 HTML 다운로드 - 브라우저 직접 Blob 생성으로 100% 안전 다운로드)
  const handleExportDoc = async (e, docItem, format) => {
    e.stopPropagation();
    setActionId(`export_${docItem.id}_${format}`);
    try {
      // 1. Fetch document content from DB
      const res = await axios.get(`/api/db/documents/${docItem.id}`);
      const doc = res.data;
      const fileContent = format === 'html' ? doc.content_html : doc.content_txt;

      if (!fileContent) {
        throw new Error('문서 내용이 비어있습니다.');
      }

      // 2. Create UTF-8 Blob in browser
      const mimeType = format === 'html' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8';
      const blob = new Blob([fileContent], { type: mimeType });
      const url = window.URL.createObjectURL(blob);

      // 3. Trigger immediate download
      const link = document.createElement('a');
      link.href = url;
      const base = docItem.filename.replace(/\.[^/.]+$/, '');
      link.setAttribute('download', `${base}_stt.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      // Fallback: try direct server export endpoint
      try {
        const fallbackRes = await axios.get(`/api/db/documents/${docItem.id}/export?format=${format}`, {
          responseType: 'blob'
        });
        const url = window.URL.createObjectURL(new Blob([fallbackRes.data]));
        const link = document.createElement('a');
        link.href = url;
        const base = docItem.filename.replace(/\.[^/.]+$/, '');
        link.setAttribute('download', `${base}_stt.${format}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch (fallbackErr) {
        alert('다운로드 중 오류가 발생했습니다: ' + (err.message || ''));
      }
    } finally {
      setActionId(null);
    }
  };

  const filteredFiles = files.filter(f => {
    if (filterType === 'all') return true;
    return f.type === filterType;
  });

  const totalAudioBytes = files
    .filter(f => f.type === 'audio')
    .reduce((acc, cur) => acc + (cur.file_size || 0), 0);

  return (
    <div className="h-full flex flex-col bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-sm md:text-base leading-tight">DB File directory</h2>
              <p className="text-[11px] text-slate-500 font-medium">Neon PostgreSQL 클라우드 저장소</p>
            </div>
          </div>
          <button
            onClick={fetchFiles}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>

        {/* Filter Tabs: 전체 / 오디오 / 문서 */}
        <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold text-slate-600 mb-2">
          <button
            onClick={() => setFilterType('all')}
            className={`py-1 rounded-lg transition-all ${filterType === 'all' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'}`}
          >
            전체 ({files.length})
          </button>
          <button
            onClick={() => setFilterType('audio')}
            className={`py-1 rounded-lg transition-all ${filterType === 'audio' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'}`}
          >
            오디오 ({files.filter(f => f.type === 'audio').length})
          </button>
          <button
            onClick={() => setFilterType('document')}
            className={`py-1 rounded-lg transition-all ${filterType === 'document' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'}`}
          >
            문서 ({files.filter(f => f.type === 'document').length})
          </button>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Neon DB 파일 검색..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
          />
        </form>
      </div>

      {/* Files List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 divide-y divide-slate-50">
        {filteredFiles.length === 0 ? (
          <div className="text-center py-10 px-4">
            <FolderArchive className="w-10 h-10 mx-auto text-slate-300 mb-2 stroke-1" />
            <p className="text-xs text-slate-500 font-medium">저장된 파일이 없습니다.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">오디오를 업로드하면 Neon DB에 보관됩니다.</p>
          </div>
        ) : (
          filteredFiles.map((item) => {
            const isAudio = item.type === 'audio';
            const isSelected = currentFileId === `${item.type}_${item.id}`;

            return (
              <div
                key={`${item.type}_${item.id}`}
                onClick={() => onSelectFile(item)}
                className={`p-3 rounded-xl border transition-all cursor-pointer relative ${
                  isSelected
                    ? 'bg-blue-50/90 border-blue-400 shadow-sm'
                    : 'bg-white hover:bg-slate-50/80 border-slate-200/80 hover:border-slate-300'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {isAudio ? (
                      <div className="p-1 bg-amber-50 text-amber-600 rounded-lg flex-shrink-0">
                        <FileAudio className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="p-1 bg-blue-50 text-blue-600 rounded-lg flex-shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                    )}
                    <span className="text-xs font-semibold text-slate-800 truncate" title={item.filename}>
                      {item.filename}
                    </span>
                  </div>

                  {/* Type Badge */}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0 ${
                    isAudio ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-blue-100 text-blue-800 border border-blue-200'
                  }`}>
                    {isAudio ? 'AUDIO' : 'STT 문서'}
                  </span>
                </div>

                {/* Meta details */}
                <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-2">
                  {isAudio ? (
                    <>
                      <span className="font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-100">
                        {formatSize(item.file_size)}
                      </span>
                      {item.has_stt && (
                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> STT 완료
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                        {formatTime(item.duration)}
                      </span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {item.detected_languages?.map(lang => (
                          <span
                            key={lang}
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase ${LANG_COLORS[lang] || 'bg-slate-100 text-slate-700'}`}
                          >
                            {lang}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  <span className="text-[10px] text-slate-400 ml-auto">
                    {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                  </span>
                </div>

                {/* Actions Row */}
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[11px]">
                  {isAudio ? (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); onStartSttFromDb(item); }}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 shadow-xs transition-all"
                        title="이 오디오 파일로 STT 변환 작업 실행"
                      >
                        <Play className="w-3 h-3 fill-white" />
                        <span>STT 작업 시작</span>
                      </button>

                      {/* 오디오 완전 삭제 버튼 (DB 용량 회수) */}
                      <button
                        onClick={(e) => handleDeleteAudio(e, item)}
                        className="px-2 py-0.8 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 font-bold rounded-lg text-[10px] flex items-center gap-1 border border-red-200 transition-all"
                        title="Neon DB에서 오디오를 완전 삭제하여 저장 공간을 비웁니다."
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>오디오 완전삭제 (용량 확보)</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleExportDoc(e, item, 'txt')}
                          className="px-2 py-0.8 bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-600 font-bold rounded text-[10px] transition-colors"
                          title="TXT 텍스트로 저장"
                        >
                          TXT 저장
                        </button>
                        <button
                          onClick={(e) => handleExportDoc(e, item, 'html')}
                          className="px-2 py-0.8 bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-600 font-bold rounded text-[10px] transition-colors"
                          title="HTML 웹문서로 저장"
                        >
                          HTML 저장
                        </button>
                      </div>

                      <button
                        onClick={(e) => handleDeleteDoc(e, item)}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="문서 삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info: 오디오 용량 및 파일 수 요약 */}
      <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium px-4">
        <span>총 {files.length}개 항목</span>
        <span className="flex items-center gap-1 text-amber-700 font-bold">
          <HardDrive className="w-3.5 h-3.5" /> 오디오 점유: {formatSize(totalAudioBytes)}
        </span>
      </div>
    </div>
  );
}
