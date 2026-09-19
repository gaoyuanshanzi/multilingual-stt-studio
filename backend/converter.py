import os
import subprocess
import logging

logger = logging.getLogger("audio_converter")

def get_ffmpeg_binary() -> str:
    """ffmpeg 실행 파일 경로 반환 (imageio_ffmpeg 우선 사용)"""
    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if os.path.exists(exe):
            return exe
    except Exception as e:
        logger.warning("imageio_ffmpeg lookup failed: %s", e)
    
    import shutil
    sys_ffmpeg = shutil.which("ffmpeg")
    if sys_ffmpeg:
        return sys_ffmpeg
    
    raise RuntimeError("ffmpeg 바이너리를 찾을 수 없습니다. (pip install imageio-ffmpeg)")


def convert_m4a_to_mp3(input_path: str, output_path: str, bitrate: str = "192k") -> str:
    """
    m4a (또는 aac, mp4 등) 오디오 파일을 고음질 MP3로 변환합니다.
    """
    ffmpeg_exe = get_ffmpeg_binary()
    logger.info("Converting %s to %s with bitrate %s using %s", input_path, output_path, bitrate, ffmpeg_exe)

    cmd = [
        ffmpeg_exe,
        "-y",               # Overwrite output
        "-i", input_path,   # Input file
        "-vn",              # Disable video if present
        "-codec:a", "libmp3lame",
        "-b:a", bitrate,    # Bitrate (e.g. 192k)
        output_path
    ]

    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        logger.error("ffmpeg conversion error: %s", result.stderr)
        raise RuntimeError(f"오디오 변환 실패: {result.stderr[-300:]}")

    if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
        raise RuntimeError("변환된 MP3 파일이 생성되지 않았습니다.")

    logger.info("Successfully converted to MP3: %d bytes", os.path.getsize(output_path))
    return output_path
