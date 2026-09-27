
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models import User, Video, Sentence
from app.api.auth import current
from app.services.whisper import transcribe_video

router = APIRouter()


# ============================================================
# Schemas de entrada
# ============================================================

class VideoIn(BaseModel):
    video_url: str
    title: str | None = None


class SentenceIn(BaseModel):
    text: str
    start_time: float = Field(ge=0)
    end_time: float = Field(gt=0)


# ============================================================
# Criar vídeo
# ============================================================

@router.post("")
def create(
    x: VideoIn,
    u=Depends(current),
    db: Session = Depends(get_db),
):
    v = Video(
        user_id=u.id,
        **x.model_dump(),
    )

    db.add(v)
    db.commit()
    db.refresh(v)

    return v


# ============================================================
# Listar vídeos do usuário
# ============================================================

@router.get("")
def list_(
    u=Depends(current),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(Video)
        .where(Video.user_id == u.id)
    ).all()


# ============================================================
# Buscar um vídeo específico
# ============================================================

@router.get("/{video_id}")
def get_video(
    video_id: int,
    u=Depends(current),
    db: Session = Depends(get_db),
):
    video = db.scalar(
        select(Video)
        .where(
            Video.id == video_id,
            Video.user_id == u.id,
        )
    )

    if not video:
        raise HTTPException(
            status_code=404,
            detail="Video not found",
        )

    return {
        "id": video.id,
        "video_url": video.video_url,
        "title": video.title,
        "sentences": [
            {
                "id": sentence.id,
                "text": sentence.text,
                "start_time": sentence.start_time,
                "end_time": sentence.end_time,
            }
            for sentence in video.sentences
        ],
    }




# ============================================================
# Gerar frases usando Whisper
# ============================================================

@router.post("/{video_id}/transcribe")
def transcribe(
    video_id: int,
    u=Depends(current),
    db: Session = Depends(get_db),
):
    # --------------------------------------------------------
    # Busca o vídeo garantindo que pertence ao usuário
    # --------------------------------------------------------

    video = db.scalar(
        select(Video).where(
            Video.id == video_id,
            Video.user_id == u.id,
        )
    )

    if not video:
        raise HTTPException(
            status_code=404,
            detail="Video not found",
        )

    # --------------------------------------------------------
    # Gera transcrição
    # --------------------------------------------------------

    try:
        segments = transcribe_video(
            video.video_url
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {exc}",
        )

    # --------------------------------------------------------
    # Remove frases antigas
    #
    # Isso evita duplicação se o usuário clicar
    # novamente em "Gerar frases".
    # --------------------------------------------------------

    video.sentences.clear()

    db.flush()

    # --------------------------------------------------------
    # Salva novas frases
    # --------------------------------------------------------

    for segment in segments:
        sentence = Sentence(
            video_id=video.id,
            text=segment["text"],
            start_time=segment["start_time"],
            end_time=segment["end_time"],
        )

        db.add(sentence)

    db.commit()

    # --------------------------------------------------------
    # Retorna resultado
    # --------------------------------------------------------

    return {
        "video_id": video.id,
        "sentences_created": len(segments),
        "sentences": segments,
    }





# ============================================================
# Adicionar frase a um vídeo
# ============================================================

@router.post("/{video_id}/sentences")
def sentence(
    video_id: int,
    x: SentenceIn,
    u=Depends(current),
    db: Session = Depends(get_db),
):
    video = db.scalar(
        select(Video)
        .where(
            Video.id == video_id,
            Video.user_id == u.id,
        )
    )

    if not video:
        raise HTTPException(
            status_code=404,
            detail="Video not found",
        )

    if x.end_time <= x.start_time:
        raise HTTPException(
            status_code=400,
            detail="Invalid timestamps",
        )

    s = Sentence(
        video_id=video.id,
        **x.model_dump(),
    )

    db.add(s)
    db.commit()
    db.refresh(s)

    return s

