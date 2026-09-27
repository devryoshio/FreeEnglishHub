
from difflib import SequenceMatcher
from pathlib import Path
import tempfile
import shutil

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
)

from pydantic import BaseModel, Field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import get_db

from app.models import (
    User,
    PracticeAttempt,
    Sentence,
    Video,
)

from app.api.auth import current

from app.services.whisper import transcribe_audio


router = APIRouter()


# =========================================================
# Practice manual
# =========================================================

class Practice(BaseModel):
    sentence_id: int

    score: float | None = Field(
        None,
        ge=0,
        le=100,
    )

    pronunciation_score: float | None = Field(
        None,
        ge=0,
        le=100,
    )

    similarity_score: float | None = Field(
        None,
        ge=0,
        le=100,
    )


@router.post("")
def create(
    x: Practice,
    u=Depends(current),
    db: Session = Depends(get_db),
):

    sentence = db.scalar(
        select(Sentence)
        .join(Video)
        .where(
            Sentence.id == x.sentence_id,
            Video.user_id == u.id,
        )
    )

    if not sentence:
        raise HTTPException(
            status_code=404,
            detail="Sentence not found",
        )

    attempt = PracticeAttempt(
        user_id=u.id,
        **x.model_dump(),
    )

    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return attempt


# =========================================================
# Similaridade entre textos
# =========================================================

def calculate_similarity(
    expected: str,
    recognized: str,
) -> float:

    expected_clean = (
        expected
        .lower()
        .strip()
    )

    recognized_clean = (
        recognized
        .lower()
        .strip()
    )

    if not expected_clean:
        return 0.0

    if not recognized_clean:
        return 0.0

    ratio = SequenceMatcher(
        None,
        expected_clean,
        recognized_clean,
    ).ratio()

    return round(
        ratio * 100,
        2,
    )


# =========================================================
# Shadowing
# =========================================================

@router.post(
    "/{sentence_id}/shadowing"
)
async def shadowing(
    sentence_id: int,
    audio: UploadFile = File(...),
    u=Depends(current),
    db: Session = Depends(get_db),
):

    # -----------------------------------------------------
    # Buscar frase
    # -----------------------------------------------------

    sentence = db.scalar(
        select(Sentence)
        .join(Video)
        .where(
            Sentence.id == sentence_id,
            Video.user_id == u.id,
        )
    )

    if not sentence:
        raise HTTPException(
            status_code=404,
            detail="Sentence not found",
        )

    # -----------------------------------------------------
    # Validar arquivo
    # -----------------------------------------------------

    if not audio.filename:
        raise HTTPException(
            status_code=400,
            detail="Audio file is required",
        )

    # -----------------------------------------------------
    # Criar arquivo temporário
    # -----------------------------------------------------

    temp_dir = tempfile.mkdtemp(
        prefix="shadowing_audio_"
    )

    audio_path = (
        Path(temp_dir)
        / "user_audio.webm"
    )

    try:

        # -------------------------------------------------
        # Salvar temporariamente
        # -------------------------------------------------

        with audio_path.open("wb") as buffer:

            shutil.copyfileobj(
                audio.file,
                buffer,
            )

        # -------------------------------------------------
        # Whisper
        # -------------------------------------------------

        segments = transcribe_audio(
            str(audio_path)
        )

        # -------------------------------------------------
        # Juntar segmentos
        # -------------------------------------------------

        recognized_text = " ".join(
            segment["text"]
            for segment in segments
        ).strip()

        # -------------------------------------------------
        # Similaridade
        # -------------------------------------------------

        similarity_score = calculate_similarity(
            sentence.text,
            recognized_text,
        )

        # -------------------------------------------------
        # Score inicial
        #
        # Nesta primeira versão:
        #
        # score = similarity
        #
        # Depois podemos combinar:
        #
        # similarity
        # +
        # pronunciation
        # +
        # fluency
        # -------------------------------------------------

        score = similarity_score

        # -------------------------------------------------
        # Salvar somente resultado
        # -------------------------------------------------

        attempt = PracticeAttempt(
            user_id=u.id,
            sentence_id=sentence.id,
            score=score,
            pronunciation_score=None,
            similarity_score=similarity_score,
        )

        db.add(attempt)
        db.commit()
        db.refresh(attempt)

        # -------------------------------------------------
        # Retornar resultado
        # -------------------------------------------------

        return {
            "attempt_id": attempt.id,
            "sentence_id": sentence.id,
            "expected_text": sentence.text,
            "recognized_text": recognized_text,
            "similarity_score": similarity_score,
            "score": score,
        }

    finally:

        # -------------------------------------------------
        # Apagar áudio temporário
        # -------------------------------------------------

        shutil.rmtree(
            temp_dir,
            ignore_errors=True,
        )

