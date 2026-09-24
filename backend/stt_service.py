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
                    cpu_threads=4
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
        progress_callback: Optional[Callable[[float, str, Optional[List[Dict[str, Any]]]], None]] = None,
        hint_languages: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Transcribe long audio with optional multi-language hint support.

        When hint_languages contains 2+ languages (multilingual mode):
        - Splits audio into 30-second windows
        - Detects language independently per window
        - Transcribes each window with detected language
        - Merges all segments in order

        When hint_languages has 1 language (forced):
        - Forces transcription in that language (fastest, most accurate for mono-language)

        When hint_languages is empty/None (auto):
        - Standard auto-detect (may miss language switches)
        """
        model = cls.get_model()

        is_multilingual = hint_languages and len(hint_languages) >= 2
        is_forced_single = hint_languages and len(hint_languages) == 1

        if is_multilingual:
            return cls._transcribe_multilingual(audio_path, hint_languages, model, progress_callback)
        else:
            forced_lang = hint_languages[0] if is_forced_single else None
            return cls._transcribe_standard(audio_path, forced_lang, model, progress_callback)

    @classmethod
    def _transcribe_standard(cls, audio_path, language, model, progress_callback):
        """Standard single-pass transcription (auto or forced single language)."""
        lang_label = language or "자동 감지"
        if progress_callback:
            progress_callback(10.0, f"오디오 음성 구간 분석 중 ({lang_label})...", None)

        logger.info("Standard transcription: path=%s language=%s", audio_path, language)

        segments_gen, info = model.transcribe(
            audio_path,
            beam_size=1,
            best_of=1,
            temperature=0.0,
            condition_on_previous_text=False,
            compression_ratio_threshold=2.4,
            no_speech_threshold=0.6,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500, speech_pad_ms=400),
            language=language,
            task="transcribe",
            word_timestamps=False
        )

        detected_languages_set = set()
        if info.language:
            detected_languages_set.add(info.language)

        total_duration = info.duration if info.duration and info.duration > 0 else 0.0
        segments_list: List[Dict[str, Any]] = []
        full_text_parts: List[str] = []
        last_update_time = time.time()

        logger.info("Primary language: %s (prob: %.2f), duration: %.2fs", info.language, info.language_probability, total_duration)

        for segment in segments_gen:
            seg_lang = getattr(segment, "language", info.language) or info.language or "unknown"
            detected_languages_set.add(seg_lang)
            text_cleaned = segment.text.strip()
            if text_cleaned:
                full_text_parts.append(text_cleaned)

            seg_data = {
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "language": seg_lang,
                "probability": round(float(getattr(segment, "language_probability", info.language_probability) or 1.0), 3),
                "text": text_cleaned,
            }
            segments_list.append(seg_data)

            now = time.time()
            if progress_callback and (now - last_update_time >= 1.0 or segment.end >= total_duration - 1.0):
                last_update_time = now
                elapsed_pct = min(98.0, 10.0 + (segment.end / total_duration) * 88.0) if total_duration > 0 else 50.0
                progress_callback(
                    round(elapsed_pct, 1),
                    f"구간 변환 중... [{round(segment.end, 1)}s / {round(total_duration, 1)}s] ({len(segments_list)}개 구간 인식) [{lang_label}]",
                    segments_list
                )

        if progress_callback:
            progress_callback(100.0, f"변환 완료! 총 {len(segments_list)}개 구간 인식", segments_list)

        logger.info("Transcription done: duration=%.2fs, segments=%d, languages=%s", total_duration, len(segments_list), sorted(detected_languages_set))

        return {
            "duration": round(total_duration, 2),
            "detected_languages": sorted(list(detected_languages_set)),
            "segments": segments_list,
            "full_text": "\n".join(full_text_parts),
        }

    @classmethod
    def _transcribe_multilingual(cls, audio_path, hint_languages, model, progress_callback):
        """
        Multilingual chunk-based transcription.
        Splits audio into WINDOW_SECS windows, detects language per window,
        then transcribes each window with the best-matching hint language.
        """
        import subprocess
        import tempfile
        import os
        import json

        WINDOW_SECS = 30  # 30-second windows for per-chunk language detection

        logger.info("Multilingual transcription: hints=%s", hint_languages)

        if progress_callback:
            progress_callback(5.0, f"다국어 모드: 오디오 길이 분석 중... (힌트 언어: {', '.join(hint_languages)})", None)

        # Get total duration using ffprobe or ffmpeg
        try:
            import imageio_ffmpeg
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            import shutil
            ffmpeg_exe = shutil.which("ffmpeg") or "ffmpeg"

        ffprobe_cmd = [
            ffmpeg_exe, "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", audio_path
        ]
        try:
            res = subprocess.run(ffprobe_cmd, capture_output=True, text=True, timeout=30)
            total_duration = float(res.stdout.strip() or "0")
        except Exception:
            total_duration = 0.0

        if total_duration <= 0:
            # Fallback: use standard auto-detect
            logger.warning("Could not determine audio duration, falling back to standard mode")
            return cls._transcribe_standard(audio_path, None, model, progress_callback)

        total_windows = max(1, int(total_duration / WINDOW_SECS) + (1 if total_duration % WINDOW_SECS > 0 else 0))
        logger.info("Multilingual: %.2fs audio => %d windows of %ds each", total_duration, total_windows, WINDOW_SECS)

        all_segments: List[Dict[str, Any]] = []
        all_texts: List[str] = []
        detected_languages_set = set()

        for win_idx in range(total_windows):
            win_start = win_idx * WINDOW_SECS
            win_end = min(total_duration, win_start + WINDOW_SECS)

            pct = 10.0 + (win_idx / total_windows) * 85.0
            win_label = f"창 {win_idx+1}/{total_windows} [{win_start:.0f}s-{win_end:.0f}s]"
            if progress_callback:
                progress_callback(
                    round(pct, 1),
                    f"다국어 분석 중... {win_label} | 감지된 구간: {len(all_segments)}개",
                    list(all_segments)
                )

            # Extract window audio to temp file
            tmp_win = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
            tmp_win.close()

            extract_cmd = [
                ffmpeg_exe, "-y", "-i", audio_path,
                "-ss", str(win_start), "-t", str(WINDOW_SECS),
                "-ac", "1", "-ar", "16000",
                "-f", "mp3", tmp_win.name
            ]
            try:
                subprocess.run(extract_cmd, capture_output=True, timeout=60)
            except Exception as e:
                logger.warning("Window extraction failed for window %d: %s", win_idx, e)
                if os.path.exists(tmp_win.name):
                    os.remove(tmp_win.name)
                continue

            if not os.path.exists(tmp_win.name) or os.path.getsize(tmp_win.name) < 1000:
                if os.path.exists(tmp_win.name):
                    os.remove(tmp_win.name)
                continue

            # Step 1: Detect language for this window
            try:
                win_segs_gen, win_info = model.transcribe(
                    tmp_win.name,
                    beam_size=1,
                    best_of=1,
                    temperature=0.0,
                    condition_on_previous_text=False,
                    no_speech_threshold=0.6,
                    vad_filter=True,
                    language=None,  # always auto-detect per window
                    task="transcribe",
                    word_timestamps=False
                )
                # Consume generator to get language info
                win_segs_raw = list(win_segs_gen)
            except Exception as e:
                logger.warning("Detection failed for window %d: %s", win_idx, e)
                if os.path.exists(tmp_win.name):
                    os.remove(tmp_win.name)
                continue

            detected_lang = win_info.language or "unknown"
            lang_prob = win_info.language_probability or 0.0

            # Step 2: Match detected language to best hint
            best_lang = detected_lang
            if detected_lang in hint_languages:
                best_lang = detected_lang
            else:
                # Use detected lang as-is, still label for user
                best_lang = detected_lang

            detected_languages_set.add(best_lang)
            logger.info("Window %d [%.0f-%.0fs]: detected=%s (%.2f)", win_idx, win_start, win_end, detected_lang, lang_prob)

            # Step 3: Collect segments with corrected time offset
            for seg in win_segs_raw:
                text_cleaned = seg.text.strip()
                if not text_cleaned:
                    continue
                abs_start = round(win_start + seg.start, 2)
                abs_end = round(win_start + seg.end, 2)
                seg_data = {
                    "start": abs_start,
                    "end": abs_end,
                    "language": best_lang,
                    "probability": round(float(lang_prob), 3),
                    "text": text_cleaned,
                }
                all_segments.append(seg_data)
                all_texts.append(text_cleaned)

            if os.path.exists(tmp_win.name):
                try:
                    os.remove(tmp_win.name)
                except Exception:
                    pass

        if progress_callback:
            progress_callback(100.0, f"다국어 변환 완료! 총 {len(all_segments)}개 구간, 감지 언어: {sorted(detected_languages_set)}", list(all_segments))

        logger.info("Multilingual done: segments=%d, languages=%s", len(all_segments), sorted(detected_languages_set))

        return {
            "duration": round(total_duration, 2),
            "detected_languages": sorted(list(detected_languages_set)),
            "segments": all_segments,
            "full_text": "\n".join(all_texts),
        }


def get_stt_engine():
    return STTEngine
