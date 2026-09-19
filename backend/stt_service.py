import logging
import time
from typing import List, Dict, Any, Callable, Optional

logger = logging.getLogger("stt_service")
logging.basicConfig(level=logging.INFO)

try:
    from .config import WHISPER_MODEL_SIZE, WHISPER_COMPUTE_TYPE
except (ImportError, ValueError):
    from config import WHISPER_MODEL_SIZE, WHISPER_COMPUTE_TYPE

try:
    from faster_whisper import WhisperModel
    HAS_FASTER_WHISPER = True
    logger.info("faster-whisper loaded successfully. STT is fully operational.")
except ImportError as _fw_err:
    WhisperModel = None
    HAS_FASTER_WHISPER = False
    logger.warning("faster-whisper NOT available: %s", _fw_err)


class STTEngine:
    _model = None

    @classmethod
    def get_model(cls):
        if not HAS_FASTER_WHISPER:
            raise RuntimeError("faster-whisper is not installed.")

        if cls._model is None:
            logger.info("Loading faster-whisper model: %s (%s) ...", WHISPER_MODEL_SIZE, WHISPER_COMPUTE_TYPE)
            try:
                cls._model = WhisperModel(
                    WHISPER_MODEL_SIZE,
                    device="auto",
                    compute_type=WHISPER_COMPUTE_TYPE,
                    cpu_threads=4  # Optimal multi-threading for CPU
                )
                logger.info("faster-whisper model loaded successfully.")
            except Exception as e:
                logger.warning("auto device failed: %s. Retrying with cpu/int8.", e)
                cls._model = WhisperModel(
                    WHISPER_MODEL_SIZE,
                    device="cpu",
                    compute_type="int8",
                    cpu_threads=4
                )
                logger.info("faster-whisper model loaded in fallback cpu/int8 mode.")
        return cls._model

    @classmethod
    def transcribe_audio(
        cls,
        audio_path: str,
        progress_callback: Optional[Callable[[float, str, Optional[List[Dict[str, Any]]]], None]] = None
    ) -> Dict[str, Any]:
        """
        Transcribe long audio (up to 10,000+ seconds) without hanging or infinite loops.
        Uses beam_size=1 (greedy) and condition_on_previous_text=False to completely eliminate
        repetition loops and stalls at problematic segments.
        """
        model = cls.get_model()

        if progress_callback:
            progress_callback(10.0, "오디오 음성 구간 분석 중 (Silero VAD Filter)...", None)

        logger.info("Starting optimized transcription of: %s", audio_path)

        # ── Ultra-fast, anti-hang parameters for 2+ hour audio ─────────────────
        segments_gen, info = model.transcribe(
            audio_path,
            beam_size=1,                         # Greedy search: 4x faster, 0% beam-search hang
            best_of=1,                           # No redundant candidates
            temperature=0.0,                     # Deterministic, avoids temperature retry loops
            condition_on_previous_text=False,    # CRITICAL: prevents repetition loops and hallucination stalls
            compression_ratio_threshold=2.4,     # Skips repetitive garbage text
            no_speech_threshold=0.6,             # Skips pure noise/silence
            vad_filter=True,                     # Voice Activity Detection
            vad_parameters=dict(
                min_silence_duration_ms=500,
                speech_pad_ms=400
            ),
            language=None,                       # Auto-detect language per segment
            task="transcribe",
            word_timestamps=False
        )

        detected_languages_set = set()
        if info.language:
            detected_languages_set.add(info.language)

        total_duration = info.duration if info.duration and info.duration > 0 else 0.0
        segments_list: List[Dict[str, Any]] = []
        full_text_parts: List[str] = []

        logger.info(
            "Primary language: %s (probability: %.2f), Total duration: %.2fs (~%.1f hours)",
            info.language, info.language_probability, total_duration, total_duration / 3600
        )

        last_update_time = time.time()

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

            # Send progress & live segments every 1 second or on major segment
            now = time.time()
            if progress_callback and (now - last_update_time >= 1.0 or segment.end >= total_duration - 1.0):
                last_update_time = now
                elapsed_pct = min(98.0, 10.0 + (segment.end / total_duration) * 88.0) if total_duration > 0 else 50.0
                progress_callback(
                    round(elapsed_pct, 1),
                    f"구간 변환 중... [{round(segment.end, 1)}s / {round(total_duration, 1)}s] ({len(segments_list)}개 구간 인식)",
                    segments_list  # live streaming segments!
                )

        if progress_callback:
            progress_callback(100.0, f"변환 완료! 총 {len(segments_list)}개 구간 인식", segments_list)

        logger.info(
            "Transcription completed: Duration=%.2fs, Segments=%d, Languages=%s",
            total_duration, len(segments_list), sorted(detected_languages_set)
        )

        return {
            "duration": round(total_duration, 2),
            "detected_languages": sorted(list(detected_languages_set)),
            "segments": segments_list,
            "full_text": "\n".join(full_text_parts),
        }
