import os
import uuid
import logging
from typing import Optional, List
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, BackgroundTasks, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .config import (
    UPLOAD_DIR, EXPORT_DIR,
    ADMIN_USERNAME, ADMIN_PASSWORD
)
from .database import engine, Base, get_db
from .models import STTRecord
from .stt_service import STTEngine
from .templates import generate_txt_content, generate_html_content

logger = logging.getLogger("api")
logging.basicConfig(level=logging.INFO)

# Create tables on startup
try:
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables verified/created successfully on Neon PostgreSQL.")
except Exception as e:
    logger.error(f"Failed to connect or migrate DB: {e}")

app = FastAPI(title="Multi-Language STT Service", version="1.0.0")

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

class SaveRequest(BaseModel):
    task_id: Optional[str] = None
    record_id: Optional[int] = None
    destination: str  # "db", "local", "both"
    format: str       # "txt", "html"
    filename: Optional[str] = None

def verify_admin(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="인증 헤더가 누락되었습니다.")
    token = authorization.replace("Bearer ", "").strip()
    if token != "admin-token-123jesus":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")
    return True

def run_stt_task(task_id: str, audio_path: str):
    try:
        tasks_db[task_id]["status"] = "processing"
        tasks_db[task_id]["message"] = "STT 분석 시작 중..."
        
        def on_progress(percent: float, message: str):
            if task_id in tasks_db:
                tasks_db[task_id]["progress"] = percent
                tasks_db[task_id]["message"] = message

        result = STTEngine.transcribe_audio(audio_path, progress_callback=on_progress)
        
        tasks_db[task_id]["status"] = "completed"
        tasks_db[task_id]["progress"] = 100.0
        tasks_db[task_id]["message"] = "음성 인식이 성공적으로 완료되었습니다."
        tasks_db[task_id]["result"] = result
    except Exception as e:
        logger.exception(f"Task {task_id} failed: {e}")
        if task_id in tasks_db:
            tasks_db[task_id]["status"] = "failed"
            tasks_db[task_id]["message"] = f"오류 발생: {str(e)}"
            tasks_db[task_id]["error"] = str(e)


@app.get("/")
def root():
    return {"message": "Multi-Language STT API Server is running", "status": "ok"}

@app.post("/api/auth/login")
def login(creds: LoginRequest):
    if creds.username == ADMIN_USERNAME and creds.password == ADMIN_PASSWORD:
        return {
            "success": True,
            "token": "admin-token-123jesus",
            "user": {"username": "admin", "role": "admin"}
        }
    raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 일치하지 않습니다.")

@app.get("/api/auth/me")
def get_me(is_admin: bool = Depends(verify_admin)):
    return {"authenticated": True, "username": "admin", "role": "admin"}

@app.post("/api/upload")
async def upload_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    task_id = str(uuid.uuid4())
    safe_filename = file.filename or f"audio_{task_id}.mp3"
    saved_ext = Path(safe_filename).suffix or ".mp3"
    file_path = UPLOAD_DIR / f"{task_id}{saved_ext}"

    total_bytes = 0
    chunk_size = 1024 * 1024  # 1MB chunk

    with open(file_path, "wb") as f_out:
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            f_out.write(chunk)
            total_bytes += len(chunk)

    tasks_db[task_id] = {
        "task_id": task_id,
        "filename": safe_filename,
        "file_path": str(file_path),
        "file_size": total_bytes,
        "status": "uploaded",
        "progress": 0.0,
        "message": "파일 업로드 완료. 작동 대기 중",
        "result": None,
        "audio_url": f"/api/audio/{task_id}",
        "created_at": datetime.utcnow().isoformat()
    }

    return {
        "task_id": task_id,
        "filename": safe_filename,
        "file_size": total_bytes,
        "audio_url": f"/api/audio/{task_id}",
        "message": "업로드 성공"
    }

@app.post("/api/tasks/{task_id}/start")
def start_stt(task_id: str, background_tasks: BackgroundTasks):
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    
    task_info = tasks_db[task_id]
    if task_info["status"] == "processing":
        return {"message": "이미 작업이 진행 중입니다.", "task_id": task_id}

    audio_path = task_info["file_path"]
    background_tasks.add_task(run_stt_task, task_id, audio_path)
    task_info["status"] = "processing"
    task_info["message"] = "STT 프로세스 시작 중..."

    return {"message": "STT 작업이 시작되었습니다.", "task_id": task_id}

@app.get("/api/tasks/{task_id}")
def get_task_status(task_id: str):
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    return tasks_db[task_id]

@app.get("/api/audio/{identifier}")
def stream_audio(identifier: str, db: Session = Depends(get_db)):
    if identifier in tasks_db:
        file_path = tasks_db[identifier]["file_path"]
        if os.path.exists(file_path):
            return FileResponse(file_path, media_type="audio/mpeg")

    if identifier.isdigit():
        record = db.query(STTRecord).filter(STTRecord.id == int(identifier)).first()
        if record and record.file_path and os.path.exists(record.file_path):
            return FileResponse(record.file_path, media_type="audio/mpeg")

    raise HTTPException(status_code=404, detail="오디오 파일을 찾을 수 없습니다.")

@app.post("/api/save")
def save_stt_result(req: SaveRequest, db: Session = Depends(get_db)):
    task_info = tasks_db.get(req.task_id) if req.task_id else None
    if not task_info or not task_info.get("result"):
        raise HTTPException(status_code=400, detail="유효한 변환 결과가 없습니다.")

    filename = req.filename or task_info["filename"]
    res = task_info["result"]
    duration = res.get("duration", 0.0)
    languages = res.get("detected_languages", [])
    segments = res.get("segments", [])
    full_text = res.get("full_text", "")
    audio_path = task_info["file_path"]
    file_size = task_info.get("file_size", 0)

    saved_record_id = None

    if req.destination in ["db", "both"]:
        record = STTRecord(
            filename=filename,
            file_path=audio_path,
            file_size=file_size,
            duration=duration,
            detected_languages=languages,
            segments=segments,
            full_text=full_text,
            created_at=datetime.utcnow()
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        saved_record_id = record.id

    base_name = Path(filename).stem
    download_url = None
    if req.format == "html":
        content = generate_html_content(filename, duration, languages, segments)
        export_file = EXPORT_DIR / f"{base_name}_{int(datetime.utcnow().timestamp())}.html"
        export_file.write_text(content, encoding="utf-8")
        download_url = f"/api/download/{export_file.name}"
    else:
        content = generate_txt_content(filename, duration, segments)
        export_file = EXPORT_DIR / f"{base_name}_{int(datetime.utcnow().timestamp())}.txt"
        export_file.write_text(content, encoding="utf-8")
        download_url = f"/api/download/{export_file.name}"

    return {
        "success": True,
        "record_id": saved_record_id,
        "download_url": download_url,
        "message": "저장 처리가 완료되었습니다."
    }

@app.get("/api/download/{filename}")
def download_exported_file(filename: str):
    file_path = EXPORT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
    media_type = "text/html" if filename.endswith(".html") else "text/plain"
    return FileResponse(
        file_path,
        media_type=media_type,
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@app.get("/api/records")
def list_db_records(search: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(STTRecord).order_by(STTRecord.id.desc())
    if search:
        query = query.filter(STTRecord.filename.ilike(f"%{search}%"))
    records = query.all()
    return [r.to_dict() for r in records]

@app.get("/api/records/{record_id}")
def get_db_record(record_id: int, db: Session = Depends(get_db)):
    record = db.query(STTRecord).filter(STTRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="해당 기록을 찾을 수 없습니다.")
    
    data = record.to_dict()
    data["audio_url"] = f"/api/audio/{record.id}"
    return data

@app.get("/api/records/{record_id}/export")
def export_db_record(record_id: int, format: str = Query("txt"), db: Session = Depends(get_db)):
    record = db.query(STTRecord).filter(STTRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="해당 기록을 찾을 수 없습니다.")

    base_name = Path(record.filename).stem
    if format == "html":
        content = generate_html_content(
            record.filename,
            record.duration or 0.0,
            record.detected_languages or [],
            record.segments or []
        )
        export_name = f"{base_name}.html"
        return Response(
            content=content.encode("utf-8"),
            media_type="text/html",
            headers={"Content-Disposition": f'attachment; filename="{export_name}"'}
        )
    else:
        content = generate_txt_content(
            record.filename,
            record.duration or 0.0,
            record.segments or []
        )
        export_name = f"{base_name}.txt"
        return Response(
            content=content.encode("utf-8"),
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{export_name}"'}
        )

@app.delete("/api/records/{record_id}")
def delete_db_record(record_id: int, db: Session = Depends(get_db)):
    record = db.query(STTRecord).filter(STTRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="삭제할 기록을 찾을 수 없습니다.")

    if record.file_path and os.path.exists(record.file_path):
        try:
            os.remove(record.file_path)
        except Exception as e:
            logger.warning(f"Could not delete physical file: {e}")

    db.delete(record)
    db.commit()
    return {"success": True, "message": "DB에서 안전하게 완전 삭제되었습니다."}
