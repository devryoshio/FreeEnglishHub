
from pathlib import Path
import tempfile

from faster_whisper import WhisperModel
import yt_dlp


# ---------------------------------------------------------
# Modelo
# ---------------------------------------------------------

_model = None


def get_model():
    global _model

    if _model is None:
        _model = WhisperModel(
            "base",
            device="cpu",
            compute_type="int8",
        )

    return _model


# ---------------------------------------------------------
# Baixar áudio temporariamente (Odysee via yt-dlp)
# ---------------------------------------------------------

def download_audio(video_url: str) -> tuple[str, str]:
    temp_dir = tempfile.mkdtemp(prefix="shadowing_")

    output_template = str(
        Path(temp_dir) / "audio.%(ext)s"
    )

    options = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
    }

    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(
            video_url,
            download=True,
        )

        downloaded = Path(
            ydl.prepare_filename(info)
        )

    return str(downloaded), temp_dir


# ---------------------------------------------------------
# Transcrição
# ---------------------------------------------------------

def transcribe_video(video_url: str):
    audio_path = None
    temp_dir = None

    try:
        audio_path, temp_dir = download_audio(
            video_url
        )

        model = get_model()

        segments, info = model.transcribe(
            audio_path,
            beam_size=5,
            vad_filter=True,
        )

        result = []

        for segment in segments:
            text = segment.text.strip()

            if not text:
                continue

            result.append(
                {
                    "text": text,
                    "start_time": float(segment.start),
                    "end_time": float(segment.end),
                }
            )

        return result

    finally:
        # -------------------------------------------------
        # Remove áudio temporário
        # -------------------------------------------------

        if temp_dir:
            import shutil

            shutil.rmtree(
                temp_dir,
                ignore_errors=True,
            )




# ---------------------------------------------------------
# Transcrever áudio enviado pelo usuário
# ---------------------------------------------------------

def transcribe_audio(audio_path: str):
    model = get_model()

    segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        vad_filter=True,
        language="en",
    )

    result = []

    for segment in segments:
        text = segment.text.strip()

        if not text:
            continue

        result.append(
            {
                "text": text,
                "start_time": float(segment.start),
                "end_time": float(segment.end),
            }
        )

    return result

