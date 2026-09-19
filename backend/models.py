from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, BigInteger, DateTime, JSON, LargeBinary, ForeignKey, Boolean
from sqlalchemy.orm import relationship

try:
    from .database import Base
except (ImportError, ValueError):
    from database import Base


class DBAudioFile(Base):
    """Neon PostgreSQL에 저장되는 오디오 파일 메타데이터"""
    __tablename__ = "db_audio_files"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    filename = Column(String(255), nullable=False)
    file_size = Column(BigInteger, default=0)
    total_chunks = Column(Integer, default=0)
    uploaded_chunks = Column(Integer, default=0)
    is_complete = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 1MB 청크 데이터 관계
    chunks = relationship("DBAudioChunk", back_populates="audio_file", cascade="all, delete-orphan")
    stt_documents = relationship("DBSTTDocument", back_populates="audio_file")

    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "file_size": self.file_size,
            "file_type": "audio",
            "is_complete": self.is_complete,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "has_stt": len(self.stt_documents) > 0 if self.stt_documents else False
        }


class DBAudioChunk(Base):
    """Neon PostgreSQL에 1MB 단위로 직접 저장되는 오디오 청크 바이너리 (BYTEA)"""
    __tablename__ = "db_audio_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    audio_file_id = Column(Integer, ForeignKey("db_audio_files.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False, index=True)
    chunk_data = Column(LargeBinary, nullable=False)

    audio_file = relationship("DBAudioFile", back_populates="chunks")


class DBSTTDocument(Base):
    """Neon PostgreSQL에 저장되는 STT 변환 텍스트 및 HTML 문서"""
    __tablename__ = "db_stt_documents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    audio_file_id = Column(Integer, ForeignKey("db_audio_files.id", ondelete="SET NULL"), nullable=True)
    filename = Column(String(255), nullable=False)
    duration = Column(Float, default=0.0)
    detected_languages = Column(JSON, default=list)
    segments = Column(JSON, default=list)
    content_txt = Column(Text, default="")
    content_html = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    audio_file = relationship("DBAudioFile", back_populates="stt_documents")

    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "file_type": "doc",
            "audio_file_id": self.audio_file_id,
            "duration": self.duration,
            "detected_languages": self.detected_languages or [],
            "segments": self.segments or [],
            "content_txt": self.content_txt or "",
            "content_html": self.content_html or "",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
