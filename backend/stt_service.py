import logging
import time
from typing import List, Dict, Any, Callable, Optional

logger = logging.getLogger("stt_service")
logging.basicConfig(level=logging.INFO)

try:
    from .config import WHISPER_MODEL_SIZE, WHISPER_COMPUTE_TYPE
except (ImportError, ValueError):
    from config import WHISPER_MODEL_SIZE, WHISPER_COMPUTE_TYPE

# Import faster-whisper — required for actual STT. Will raise on startup if missing.
try:
    from faster_whisper import WhisperModel
    HAS_FASTER_WHISPER = True
    logger.info("faster-whisper loaded successfully. STT is fully operational.")
except ImportError as _fw_err:
    WhisperModel = None
    HAS_FASTER_WHISPER = False
    logger.warning(
        "faster-whisper NOT available (%s). "
        "STT transcription will raise RuntimeError. Install it with: pip install faster-whisper",
        _fw_err
    )


class STTEngine:
    _model = None

    @classmethod
    def get_model(cls):
        """Load and cache the Whisper model. Raises if faster-whisper is not installed."""
        if not HAS_FASTER_WHISPER:
            raise RuntimeError(
                "faster-whisper is not installed. "
                "Run: pip install faster-whisper  (and ensure ffmpeg is on PATH)"
            )

        if cls._model is None:
            logger.info("Loading faster-whisper model: %s (%s) ...", WHISPER_MODEL_SIZE, WHISPER_COMPUTE_TYPE)
            try:
                cls._model = WhisperModel(
                    WHISPER_MODEL_SIZE,
                    device="auto",
                    compute_type=WHISPER_COMPUTE_TYPE
                )
                logger.info("faster-whisper model loaded successfully.")
            except Exception as e:
                logger.warning("auto device/compute failed: %s. Retrying with cpu/int8.", e)
                cls._model = WhisperModel(
                    WHISPER_MODEL_SIZE,
                    device="cpu",
                    compute_type="int8"
                )
                logger.info("faster-whisper model loaded in fallback cpu/int8 mode.")
        return cls._model

    @classmethod
    def transcribe_audio(
        cls,
        audio_path: str,
        progress_callback: Optional[Callable[[float, str], None]] = None
    ) -> Dict[str, Any]:
        """
        Transcribe the given audio file using faster-whisper.
        This performs REAL speech-to-text — no demo data.

        Args:
            audio_path: Absolute path to the audio/temp file.
            progress_callback: Optional (pct, message) callback for progress updates.

        Returns:
            dict with keys: duration, detected_languages, segments, full_text
        """
        model = cls.get_model()

        if progress_callback:
            progress_callback(10.0, "오디오 음성 구간 분석 중 (VAD Filter)...")

        logger.info("Starting transcription of: %s", audio_path)

        segments_gen, info = model.transcribe(
            audio_path,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
            language=None,      # auto-detect language per-segment
            task="transcribe",
            word_timestamps=False,
        )

        detected_languages_set = set()
        if info.language:
            detected_languages_set.add(info.language)

        total_duration = info.duration if info.duration and info.duration > 0 else 0.0
        segments_list: List[Dict[str, Any]] = []
        full_text_parts: List[str] = []

        logger.info(
            "Primary language: %s (probability: %.2f), Total duration: %.2fs",
            info.language, info.language_probability, total_duration
        )

        for segment in segments_gen:
            seg_lang = getattr(segment, "language", info.language) or info.language or "unknown"
            seg_prob = getattr(segment, "language_probability", info.language_probability) or 1.0

            detected_languages_set.add(seg_lang)
            text_cleaned = segment.text.strip()
            if text_cleaned:
                full_text_parts.append(text_cleaned)

            seg_data = {
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "language": seg_lang,
                "probability": round(float(seg_prob), 3),
                "text": text_cleaned,
            }
            segments_list.append(seg_data)

            if progress_callback and total_duration > 0:
                elapsed_pct = min(95.0, 10.0 + (segment.end / total_duration) * 85.0)
                progress_callback(
                    round(elapsed_pct, 1),
                    f"구간 변환 중... [{round(segment.end, 1)}s / {round(total_duration, 1)}s] "
                    f"({len(segments_list)}구간 완료)"
                )

        if progress_callback:
            progress_callback(100.0, f"변환 완료! 총 {len(segments_list)}개 구간 인식")

        logger.info(
            "Transcription done. Duration=%.2fs, Segments=%d, Languages=%s",
            total_duration, len(segments_list), sorted(detected_languages_set)
        )

        return {
            "duration": round(total_duration, 2),
            "detected_languages": sorted(list(detected_languages_set)),
            "segments": segments_list,
            "full_text": "\n".join(full_text_parts),
        }
