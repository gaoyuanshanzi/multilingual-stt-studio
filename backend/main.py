import os
import io
import uuid
import logging
import threading
import tempfile
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, List
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response, FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

try:
    from .config import ADMIN_USERNAME, ADMIN_PASSWORD
    from .database import engine, Base, get_db, SessionLocal
    from .models import DBAudioFile, DBAudioChunk, DBSTTDocument
    from .stt_service import STTEngine
    from .templates import generate_txt_content, generate_html_content
except (ImportError, ValueError):
    from config import ADMIN_USERNAME, ADMIN_PASSWORD
    from database import engine, Base, get_db, SessionLocal
    from models import DBAudioFile, DBAudioChunk, DBSTTDocument
    from stt_service import STTEngine
    from templates import generate_txt_content, generate_html_content

logger = logging.getLogger("api")
logging.basicConfig(level=logging.INFO)

_thread_pool = ThreadPoolExecutor(max_workers=2)
_tasks_lock = threading.Lock()

try:
    Base.metadata.create_all(bind=engine)
    logger.info("Neon PostgreSQL tables verified.")
except Exception as e:
    logger.error("DB init failed: %s", e)

app = FastAPI(title="Neon DB Multi-Language STT Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

tasks_db = {}


class LoginRequest(BaseModel):
    username: str
    password: str


class AudioInitRequest(BaseModel):
    filename: str
    file_size: int
    total_chunks: int


class SaveRequest(BaseModel):
    task_id: Optional[str] = None
    audio_id: Optional[int] = None
    destination: str   # "db" | "local" | "both"
    format: str        # "txt" | "html"
    filename: Optional[str] = None


def verify_admin(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="인증 헤더가 누락되었습니다.")
    token = authorization.replace("Bearer ", "").strip()
    if token != "admin-token-123jesus":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")
    return True


# ── STT Worker that reads audio chunks directly from Neon DB ─────────────────
def _neon_db_stt_worker(task_id: str, audio_id: int):
    db: Session = SessionLocal()
    temp_path = None
    try:
        def update_progress(pct: float, msg: str):
            with _tasks_lock:
                if task_id in tasks_db:
                    tasks_db[task_id]["progress"] = pct
                    tasks_db[task_id]["message"] = msg

        with _tasks_lock:
            tasks_db[task_id]["status"] = "processing"
        update_progress(5.0, "Neon DB에서 오디오 청크 스트리밍 수신 중...")

        audio_file = db.query(DBAudioFile).filter(DBAudioFile.id == audio_id).first()
        if not audio_file:
            raise RuntimeError(f"Neon DB에서 오디오 ID {audio_id}를 찾을 수 없습니다.")

        ext = Path(audio_file.filename).suffix or ".mp3"
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            temp_path = tmp.name
            chunks = (
                db.query(DBAudioChunk)
                .filter(DBAudioChunk.audio_file_id == audio_id)
                .order_by(DBAudioChunk.chunk_index.asc())
                .all()
            )
            for chk in chunks:
                tmp.write(chk.chunk_data)

        update_progress(15.0, f"Neon DB 오디오 로드 완료 ({(os.path.getsize(temp_path)/1048576):.1f}MB). STT 모델 구동 중...")
        result = STTEngine.transcribe_audio(temp_path, progress_callback=update_progress)

        # Generate TXT and HTML representations
        filename = audio_file.filename
        dur = result.get("duration", 0.0)
        langs = result.get("detected_languages", [])
        segs = result.get("segments", [])
        txt_content = generate_txt_content(filename, dur, segs)
        html_content = generate_html_content(filename, dur, langs, segs)

        # Automatically save Document to Neon DB
        doc = DBSTTDocument(
            audio_file_id=audio_id,
            filename=filename,
            duration=dur,
            detected_languages=langs,
            segments=segs,
            content_txt=txt_content,
            content_html=html_content,
            created_at=datetime.utcnow()
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        result["document_id"] = doc.id
        result["txt_content"] = txt_content
        result["html_content"] = html_content

        with _tasks_lock:
            tasks_db[task_id]["status"] = "completed"
            tasks_db[task_id]["progress"] = 100.0
            tasks_db[task_id]["message"] = f"음성 인식이 성공적으로 완료되었습니다! (DB 문서 ID: {doc.id})"
            tasks_db[task_id]["result"] = result

        logger.info("STT Task %s completed for audio %d. Saved doc %d to Neon DB.", task_id, audio_id, doc.id)

    except Exception as exc:
        logger.exception("STT Task %s failed: %s", task_id, exc)
        with _tasks_lock:
            if task_id in tasks_db:
                tasks_db[task_id]["status"] = "failed"
                tasks_db[task_id]["message"] = f"오류: {exc}"
    finally:
        db.close()
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "Neon DB Multi-Language STT API is running", "status": "ok"}


@app.post("/api/auth/login")
def login(creds: LoginRequest):
    if creds.username == ADMIN_USERNAME and creds.password == ADMIN_PASSWORD:
        return {
            "success": True,
            "token": "admin-token-123jesus",
            "user": {"username": "admin", "role": "admin"},
        }
    raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")


@app.get("/api/auth/me")
def get_me(_: bool = Depends(verify_admin)):
    return {"authenticated": True, "username": "admin", "role": "admin"}


# ── 1. Neon DB 오디오 청크 직접 업로드 API ────────────────────────────────────

@app.post("/api/db/audio/init")
def audio_init(req: AudioInitRequest, db: Session = Depends(get_db)):
    """Neon PostgreSQL에 오디오 파일 레코드 초기화"""
    audio_file = DBAudioFile(
        filename=req.filename,
        file_size=req.file_size,
        total_chunks=req.total_chunks,
        uploaded_chunks=0,
        is_complete=False,
        created_at=datetime.utcnow()
    )
    db.add(audio_file)
    db.commit()
    db.refresh(audio_file)

    return {
        "audio_id": audio_file.id,
        "filename": audio_file.filename,
        "message": "Neon DB 오디오 업로드 세션 생성 완료"
    }


@app.post("/api/db/audio/chunk")
async def audio_chunk(
    audio_id: int = Form(...),
    chunk_index: int = Form(...),
    chunk: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """1MB 청크 바이너리를 Neon PostgreSQL BYTEA 컬럼에 직접 저장"""
    audio_file = db.query(DBAudioFile).filter(DBAudioFile.id == audio_id).first()
    if not audio_file:
        raise HTTPException(status_code=404, detail="오디오 레코드를 찾을 수 없습니다.")

    chunk_bytes = await chunk.read()

    db_chunk = DBAudioChunk(
        audio_file_id=audio_id,
        chunk_index=chunk_index,
        chunk_data=chunk_bytes
    )
    db.add(db_chunk)

    audio_file.uploaded_chunks = (audio_file.uploaded_chunks or 0) + 1
    if audio_file.uploaded_chunks >= audio_file.total_chunks:
        audio_file.is_complete = True

    db.commit()

    return {
        "audio_id": audio_id,
        "chunk_index": chunk_index,
        "uploaded_chunks": audio_file.uploaded_chunks,
        "total_chunks": audio_file.total_chunks,
        "is_complete": audio_file.is_complete
    }


@app.post("/api/db/audio/complete")
def audio_complete(audio_id: int = Form(...), db: Session = Depends(get_db)):
    """청크 업로드 완료 확인"""
    audio_file = db.query(DBAudioFile).filter(DBAudioFile.id == audio_id).first()
    if not audio_file:
        raise HTTPException(status_code=404, detail="오디오 레코드를 찾을 수 없습니다.")

    audio_file.is_complete = True
    db.commit()

    return {
        "audio_id": audio_file.id,
        "filename": audio_file.filename,
        "file_size": audio_file.file_size,
        "audio_url": f"/api/db/audio/{audio_file.id}",
        "message": "Neon DB 오디오 업로드 완료"
    }


# ── 2. Neon DB 오디오 스트리밍 재생 API ───────────────────────────────────────

@app.get("/api/db/audio/{audio_id}")
def stream_db_audio(audio_id: int, db: Session = Depends(get_db)):
    """Neon DB의 청크들을 순서대로 브라우저 오디오 플레이어에 스트리밍"""
    audio_file = db.query(DBAudioFile).filter(DBAudioFile.id == audio_id).first()
    if not audio_file:
        raise HTTPException(status_code=404, detail="오디오 파일을 찾을 수 없습니다.")

    def chunk_generator():
        stream_db = SessionLocal()
        try:
            chunks = (
                stream_db.query(DBAudioChunk)
                .filter(DBAudioChunk.audio_file_id == audio_id)
                .order_by(DBAudioChunk.chunk_index.asc())
                .yield_per(5)
            )
            for c in chunks:
                yield c.chunk_data
        finally:
            stream_db.close()

    return StreamingResponse(
        chunk_generator(),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f'inline; filename="{audio_file.filename}"',
            "Content-Length": str(audio_file.file_size) if audio_file.file_size else ""
        }
    )


# ── 3. Neon DB 오디오 기반 STT 작업 시작 및 상태 폴링 ─────────────────────────

@app.post("/api/db/audio/{audio_id}/stt")
def start_neon_db_stt(audio_id: int, db: Session = Depends(get_db)):
    """Neon DB에 저장된 오디오를 읽어 STT 변환 시작"""
    audio_file = db.query(DBAudioFile).filter(DBAudioFile.id == audio_id).first()
    if not audio_file:
        raise HTTPException(status_code=404, detail="오디오 파일을 찾을 수 없습니다.")

    task_id = str(uuid.uuid4())
    with _tasks_lock:
        tasks_db[task_id] = {
            "task_id": task_id,
            "audio_id": audio_id,
            "filename": audio_file.filename,
            "file_size": audio_file.file_size,
            "status": "processing",
            "progress": 5.0,
            "message": "Neon DB 오디오 로딩 및 STT 엔진 준비 중...",
            "result": None,
            "audio_url": f"/api/db/audio/{audio_id}",
            "created_at": datetime.utcnow().isoformat()
        }

    _thread_pool.submit(_neon_db_stt_worker, task_id, audio_id)
    return {"task_id": task_id, "audio_id": audio_id, "message": "STT 작업이 시작되었습니다."}


@app.get("/api/tasks/{task_id}")
def get_task_status(task_id: str):
    with _tasks_lock:
        if task_id not in tasks_db:
            raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
        return dict(tasks_db[task_id])


# ── 4. DB File Directory: Neon DB 파일 통합 목록 조회 (오디오, TXT, HTML) ─────

@app.get("/api/db/files")
def list_all_db_files(search: Optional[str] = None, db: Session = Depends(get_db)):
    """Neon DB의 모든 파일(오디오 파일, STT 텍스트/HTML 문서) 목록 반환"""
    files_list = []

    # 1. 오디오 파일 목록
    q_audio = db.query(DBAudioFile).order_by(DBAudioFile.id.desc())
    if search:
        q_audio = q_audio.filter(DBAudioFile.filename.ilike(f"%{search}%"))
    for af in q_audio.all():
        files_list.append({
            "id": af.id,
            "type": "audio",
            "filename": af.filename,
            "file_size": af.file_size,
            "is_complete": af.is_complete,
            "has_stt": len(af.stt_documents) > 0,
            "audio_url": f"/api/db/audio/{af.id}",
            "created_at": af.created_at.isoformat() if af.created_at else None
        })

    # 2. STT 문서 목록
    q_docs = db.query(DBSTTDocument).order_by(DBSTTDocument.id.desc())
    if search:
        q_docs = q_docs.filter(DBSTTDocument.filename.ilike(f"%{search}%"))
    for doc in q_docs.all():
        files_list.append({
            "id": doc.id,
            "type": "document",
            "filename": doc.filename,
            "audio_file_id": doc.audio_file_id,
            "duration": doc.duration,
            "detected_languages": doc.detected_languages or [],
            "segments_count": len(doc.segments) if doc.segments else 0,
            "created_at": doc.created_at.isoformat() if doc.created_at else None
        })

    return files_list


@app.get("/api/db/documents/{doc_id}")
def get_db_document(doc_id: int, db: Session = Depends(get_db)):
    """STT 문서 상세 데이터 (메인 화면 로드용)"""
    doc = db.query(DBSTTDocument).filter(DBSTTDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    data = doc.to_dict()
    if doc.audio_file_id:
        data["audio_url"] = f"/api/db/audio/{doc.audio_file_id}"
    return data


@app.get("/api/db/documents/{doc_id}/export")
def export_db_document(doc_id: int, format: str = Query("txt"), db: Session = Depends(get_db)):
    """다른 이름으로 저장: TXT 또는 HTML 파일 다운로드"""
    doc = db.query(DBSTTDocument).filter(DBSTTDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

    base = Path(doc.filename).stem
    if format == "html":
        content = doc.content_html or generate_html_content(doc.filename, doc.duration, doc.detected_languages or [], doc.segments or [])
        return Response(
            content=content.encode("utf-8"),
            media_type="text/html; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{base}_stt.html"'}
        )
    else:
        content = doc.content_txt or generate_txt_content(doc.filename, doc.duration, doc.segments or [])
        return Response(
            content=content.encode("utf-8"),
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{base}_stt.txt"'}
        )


# ── 5. Neon DB 파일 삭제 API (오디오 완전 삭제로 DB 용량 확보) ─────────────────

@app.delete("/api/db/audio/{audio_id}")
def delete_db_audio_file(audio_id: int, db: Session = Depends(get_db)):
    """오디오 파일 및 1MB 청크들을 Neon DB에서 완전 삭제하여 DB 용량 확보!"""
    audio_file = db.query(DBAudioFile).filter(DBAudioFile.id == audio_id).first()
    if not audio_file:
        raise HTTPException(status_code=404, detail="삭제할 오디오 파일을 찾을 수 없습니다.")

    size_mb = (audio_file.file_size or 0) / (1024 * 1024)
    filename = audio_file.filename

    # Delete all audio chunks and the audio record (Cascade)
    db.delete(audio_file)
    db.commit()

    logger.info("Deleted audio file %d (%s, %.1f MB) from Neon DB.", audio_id, filename, size_mb)
    return {
        "success": True,
        "message": f"오디오 파일 '{filename}' (약 {size_mb:.1f}MB)이 Neon DB에서 완전 삭제되어 저장 공간이 확보되었습니다."
    }


@app.delete("/api/db/documents/{doc_id}")
def delete_db_document(doc_id: int, db: Session = Depends(get_db)):
    """STT 문서 삭제"""
    doc = db.query(DBSTTDocument).filter(DBSTTDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="삭제할 문서를 찾을 수 없습니다.")

    db.delete(doc)
    db.commit()
    return {"success": True, "message": "STT 문서가 DB에서 삭제되었습니다."}


# ── 6. 기존 호환용 엔드포인트 ─────────────────────────────────────────────────

@app.get("/api/records")
def compat_records(search: Optional[str] = None, db: Session = Depends(get_db)):
    docs = db.query(DBSTTDocument).order_by(DBSTTDocument.id.desc()).all()
    return [d.to_dict() for d in docs]
