from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, BigInteger, DateTime, JSON
from .database import Base

class STTRecord(Base):
    __tablename__ = "stt_records"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    file_size = Column(BigInteger, default=0)
    duration = Column(Float, default=0.0)
    detected_languages = Column(JSON, default=list)
    segments = Column(JSON, default=list)
    full_text = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "file_size": self.file_size,
            "duration": self.duration,
            "detected_languages": self.detected_languages or [],
            "segments": self.segments or [],
            "full_text": self.full_text or "",
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
