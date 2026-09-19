import logging
import time
from typing import List, Dict, Any, Callable, Optional
from faster_whisper import WhisperModel
try:
    from .config import WHISPER_MODEL_SIZE, WHISPER_COMPUTE_TYPE
except (ImportError, ValueError):
    from config import WHISPER_MODEL_SIZE, WHISPER_COMPUTE_TYPE

logger = logging.getLogger("stt_service")
logging.basicConfig(level=logging.INFO)

class STTEngine:
    _instance = None
    _model = None

    @classmethod
    def get_model(cls) -> WhisperModel:
        if cls._model is None:
            logger.info("Loading faster-whisper model: %s (%s)...", WHISPER_MODEL_SIZE, WHISPER_COMPUTE_TYPE)
            try:
                cls._model = WhisperModel(
                    WHISPER_MODEL_SIZE,
                    device="auto",
                    compute_type=WHISPER_COMPUTE_TYPE
                )
            except Exception as e:
                logger.warning("Failed to load with auto device/int8: %s. Falling back to cpu/default.", e)
                cls._model = WhisperModel(
                    WHISPER_MODEL_SIZE,
                    device="cpu",
                    compute_type="int8"
                )
            logger.info("faster-whisper model successfully loaded.")
        return cls._model

    @classmethod
    def transcribe_audio(
        cls,
        audio_path: str,
        progress_callback: Optional[Callable[[float, str], None]] = None
    ) -> Dict[str, Any]:
        model = cls.get_model()
        if progress_callback:
            progress_callback(10.0, "오디오 음성 구간 및 언어 분석 중 (VAD Filter)...")

        # language=None triggers automatic cross-language detection
        segments_gen, info = model.transcribe(
            audio_path,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
            language=None,
            task="transcribe"
        )

        detected_languages_set = set()
        if info.language:
            detected_languages_set.add(info.language)

        total_duration = info.duration if info.duration and info.duration > 0 else 0.0
        segments_list: List[Dict[str, Any]] = []
        full_text_parts = []

        logger.info("Detected primary language: %s (probability: %.2f), Duration: %.2fs", info.language, info.language_probability, total_duration)

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
                "text": text_cleaned
            }
            segments_list.append(seg_data)

            if progress_callback and total_duration > 0:
                calc_prog = min(95.0, 10.0 + (segment.end / total_duration) * 85.0)
                progress_callback(round(calc_prog, 1), f"구간 변환 중... [{round(segment.end, 1)}s / {round(total_duration, 1)}s]")

        if progress_callback:
            progress_callback(100.0, "변환 완료!")

        return {
            "duration": round(total_duration, 2),
            "detected_languages": sorted(list(detected_languages_set)),
            "segments": segments_list,
            "full_text": "\n".join(full_text_parts)
        }
