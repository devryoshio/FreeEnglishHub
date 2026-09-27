
from fastapi import APIRouter, Depends, HTTPException

from pydantic import BaseModel

from sqlalchemy import select

from sqlalchemy.orm import Session

from app.db.database import get_db

from app.models import User, Vocabulary, UserVocabulary

from app.api.auth import current

from app.services.dictionary import lookup_word


router = APIRouter()


class Word(BaseModel):
    word: str
    ipa: str | None = None
    meaning: str | None = None
    example: str | None = None


# ============================================================
# Consultar palavra
# ============================================================

@router.get("/lookup/{word}")
async def lookup(
    word: str,
    u=Depends(current),
):
    result = await lookup_word(word)

    if not result:
        raise HTTPException(
            status_code=404,
            detail="Word not found",
        )

    return result


# ============================================================
# Salvar palavra na memória do usuário
# ============================================================

@router.post("")
def save(
    x: Word,
    u=Depends(current),
    db: Session = Depends(get_db),
):
    v = db.scalar(
        select(Vocabulary).where(
            Vocabulary.word == x.word
        )
    )

    if not v:
        v = Vocabulary(
            **x.model_dump()
        )

        db.add(v)
        db.flush()

    existing = db.scalar(
        select(UserVocabulary).where(
            UserVocabulary.user_id == u.id,
            UserVocabulary.vocabulary_id == v.id,
        )
    )

    if not existing:
        db.add(
            UserVocabulary(
                user_id=u.id,
                vocabulary_id=v.id,
            )
        )

    db.commit()

    return {
        "word": v.word
    }
