import os
import uuid
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, List
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

try:
    from .config import UPLOAD_DIR, EXPORT_DIR, ADMIN_USERNAME, ADMIN_PASSWORD
    from .database import engine, Base, get_db
    from .models import STTRecord
    from .stt_service import STTEngine
    from .templates import generate_txt_content, generate_html_content
except (ImportError, ValueError):
    from config import UPLOAD_DIR, EXPORT_DIR, ADMIN_USERNAME, ADMIN_PASSWORD
    from database import engine, Base, get_db
    from models import STTRecord
    from stt_service import STTEngine
    from templates import generate_txt_content, generate_html_content

logger = logging.getLogger("api")
logging.basicConfig(level=logging.INFO)

# Use a dedicated thread pool for CPU-bound STT work (keeps asyncio loop free)
_thread_pool = ThreadPoolExecutor(max_workers=2)
_tasks_lock = threading.Lock()

try:
    Base.metadata.create_all(bind=engine)
    logger.info("DB tables verified on Neon PostgreSQL.")
except Exception as e:
    logger.error("DB migration failed: %s", e)

app = FastAPI(title="Multi-Language STT Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory task store: { task_id -> dict }
tasks_db = {}


class LoginRequest(BaseModel):
    username: str
    password: str


class SaveRequest(BaseModel):
    task_id: Optional[str] = None
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


# ── STT worker (runs in thread pool, never blocks event loop) ─────────────────
def _stt_worker(task_id: str, audio_path: str):
    def progress(pct: float, msg: str):
        with _tasks_lock:
            if task_id in tasks_db:
                tasks_db[task_id]["progress"] = pct
                tasks_db[task_id]["message"] = msg

    try:
        with _tasks_lock:
            tasks_db[task_id]["status"] = "processing"
        progress(5.0, "faster-whisper 모델 로딩 중...")
        result = STTEngine.transcribe_audio(audio_path, progress_callback=progress)
        with _tasks_lock:
            tasks_db[task_id]["status"] = "completed"
            tasks_db[task_id]["progress"] = 100.0
            tasks_db[task_id]["message"] = "음성 인식이 성공적으로 완료되었습니다."
            tasks_db[task_id]["result"] = result
        logger.info("Task %s completed. Duration=%.2fs, Segments=%d",
                    task_id, result.get("duration", 0), len(result.get("segments", [])))
    except Exception as exc:
        logger.exception("Task %s failed: %s", task_id, exc)
        with _tasks_lock:
            if task_id in tasks_db:
                tasks_db[task_id]["status"] = "failed"
                tasks_db[task_id]["message"] = f"오류: {exc}"


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "Multi-Language STT API is running", "status": "ok"}


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


@app.post("/api/upload")
async def upload_audio(file: UploadFile = File(...)):
    """Stream-write uploaded audio in 1 MB chunks to disk."""
    task_id = str(uuid.uuid4())
    safe_name = file.filename or f"audio_{task_id}.mp3"
    ext = Path(safe_name).suffix or ".mp3"
    file_path = UPLOAD_DIR / f"{task_id}{ext}"

    total = 0
    CHUNK = 1 * 1024 * 1024  # 1 MB
    with open(file_path, "wb") as fp:
        while True:
            chunk = await file.read(CHUNK)
            if not chunk:
                break
            fp.write(chunk)
            total += len(chunk)

    with _tasks_lock:
        tasks_db[task_id] = {
            "task_id": task_id,
            "filename": safe_name,
            "file_path": str(file_path),
            "file_size": total,
            "status": "uploaded",
            "progress": 0.0,
            "message": "업로드 완료. [작동] 버튼을 눌러 STT를 시작하세요.",
            "result": None,
            "audio_url": f"/api/audio/{task_id}",
            "created_at": datetime.utcnow().isoformat(),
        }

    logger.info("Uploaded %s → %s (%.1f MB)", safe_name, file_path, total / 1_048_576)
    return {
        "task_id": task_id,
        "filename": safe_name,
        "file_size": total,
        "audio_url": f"/api/audio/{task_id}",
        "message": "업로드 성공",
    }


@app.post("/api/tasks/{task_id}/start")
def start_stt(task_id: str):
    with _tasks_lock:
        if task_id not in tasks_db:
            raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
        info = tasks_db[task_id]
        if info["status"] == "processing":
            return {"message": "이미 진행 중입니다.", "task_id": task_id}
        info["status"] = "processing"
        info["message"] = "STT 준비 중 (모델 로딩)..."
        audio_path = info["file_path"]

    # Submit to thread pool — event loop stays responsive
    _thread_pool.submit(_stt_worker, task_id, audio_path)
    return {"message": "STT 작업이 시작되었습니다.", "task_id": task_id}


@app.get("/api/tasks/{task_id}")
def get_task_status(task_id: str):
    with _tasks_lock:
        if task_id not in tasks_db:
            raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
        return dict(tasks_db[task_id])  # return a copy


@app.get("/api/audio/{identifier}")
def stream_audio(identifier: str, db: Session = Depends(get_db)):
    with _tasks_lock:
        info = tasks_db.get(identifier)
    if info:
        fp = info["file_path"]
        if os.path.exists(fp):
            return FileResponse(fp, media_type="audio/mpeg")
    if identifier.isdigit():
        rec = db.query(STTRecord).filter(STTRecord.id == int(identifier)).first()
        if rec and rec.file_path and os.path.exists(rec.file_path):
            return FileResponse(rec.file_path, media_type="audio/mpeg")
    raise HTTPException(status_code=404, detail="오디오 파일을 찾을 수 없습니다.")


@app.post("/api/save")
def save_stt_result(req: SaveRequest, db: Session = Depends(get_db)):
    with _tasks_lock:
        info = tasks_db.get(req.task_id) if req.task_id else None
    if not info or not info.get("result"):
        raise HTTPException(status_code=400, detail="유효한 변환 결과가 없습니다. STT가 완료 후 저장하세요.")

    filename = req.filename or info["filename"]
    res = info["result"]
    duration = res.get("duration", 0.0)
    languages = res.get("detected_languages", [])
    segments = res.get("segments", [])
    full_text = res.get("full_text", "")
    audio_path = info["file_path"]
    file_size = info.get("file_size", 0)

    saved_id = None
    if req.destination in ("db", "both"):
        rec = STTRecord(
            filename=filename,
            file_path=audio_path,
            file_size=file_size,
            duration=duration,
            detected_languages=languages,
            segments=segments,
            full_text=full_text,
            created_at=datetime.utcnow(),
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        saved_id = rec.id

    base = Path(filename).stem
    ts = int(datetime.utcnow().timestamp())
    if req.format == "html":
        content = generate_html_content(filename, duration, languages, segments)
        ep = EXPORT_DIR / f"{base}_{ts}.html"
    else:
        content = generate_txt_content(filename, duration, segments)
        ep = EXPORT_DIR / f"{base}_{ts}.txt"
    ep.write_text(content, encoding="utf-8")

    return {
        "success": True,
        "record_id": saved_id,
        "download_url": f"/api/download/{ep.name}",
        "message": "저장 완료",
    }


@app.get("/api/download/{filename}")
def download_file(filename: str):
    fp = EXPORT_DIR / filename
    if not fp.exists():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
    mt = "text/html" if filename.endswith(".html") else "text/plain"
    return FileResponse(fp, media_type=mt, filename=filename,
                        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.get("/api/records")
def list_records(search: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(STTRecord).order_by(STTRecord.id.desc())
    if search:
        q = q.filter(STTRecord.filename.ilike(f"%{search}%"))
    return [r.to_dict() for r in q.all()]


@app.get("/api/records/{record_id}")
def get_record(record_id: int, db: Session = Depends(get_db)):
    rec = db.query(STTRecord).filter(STTRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="해당 기록을 찾을 수 없습니다.")
    data = rec.to_dict()
    data["audio_url"] = f"/api/audio/{rec.id}"
    return data


@app.get("/api/records/{record_id}/export")
def export_record(record_id: int, format: str = Query("txt"), db: Session = Depends(get_db)):
    rec = db.query(STTRecord).filter(STTRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="해당 기록을 찾을 수 없습니다.")
    base = Path(rec.filename).stem
    if format == "html":
        content = generate_html_content(rec.filename, rec.duration or 0, rec.detected_languages or [], rec.segments or [])
        return Response(content.encode("utf-8"), media_type="text/html",
                        headers={"Content-Disposition": f'attachment; filename="{base}.html"'})
    content = generate_txt_content(rec.filename, rec.duration or 0, rec.segments or [])
    return Response(content.encode("utf-8"), media_type="text/plain; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{base}.txt"'})


@app.delete("/api/records/{record_id}")
def delete_record(record_id: int, db: Session = Depends(get_db)):
    rec = db.query(STTRecord).filter(STTRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="삭제할 기록을 찾을 수 없습니다.")
    if rec.file_path and os.path.exists(rec.file_path):
        try:
            os.remove(rec.file_path)
        except Exception as e:
            logger.warning("Could not delete file: %s", e)
    db.delete(rec)
    db.commit()
    return {"success": True, "message": "DB에서 완전 삭제되었습니다."}
