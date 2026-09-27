from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.db.database import get_db
from app.models import User
from app.core.security import (
    hash_password,
    verify_password,
    token,
    user_id,
)

router = APIRouter()


class Auth(BaseModel):
    email: EmailStr
    password: str


def current(
    request: Request,
    db: Session = Depends(get_db),
):
    access_token = request.cookies.get("access_token")

    if not access_token:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
        )

    try:
        uid = user_id(access_token)
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication",
        )

    user = db.get(User, uid)

    if not user:
        raise HTTPException(
            status_code=401,
            detail="User not found",
        )

    return user


def set_auth_cookie(
    response: Response,
    access_token: str,
):
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,

        # HTTPS no Render
        secure=True,

        # Frontend e backend estão em domínios diferentes
        samesite="none",

        max_age=3600,

        # Proteção adicional
        path="/",
    )


@router.post("/register")
def register(
    data: Auth,
    response: Response,
    db: Session = Depends(get_db),
):
    if len(data.password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must have at least 8 characters",
        )

    existing_user = db.scalar(
        select(User).where(User.email == data.email)
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="Email already registered",
        )

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    set_auth_cookie(
        response,
        token(user.id),
    )

    return {
        "id": user.id,
        "email": user.email,
    }


@router.post("/login")
def login(
    data: Auth,
    response: Response,
    db: Session = Depends(get_db),
):
    user = db.scalar(
        select(User).where(User.email == data.email)
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
        )

    if not verify_password(
        data.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
        )

    set_auth_cookie(
        response,
        token(user.id),
    )

    return {
        "id": user.id,
        "email": user.email,
    }


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(
        key="access_token",
        path="/",
    )

    return {"ok": True}


@router.get("/me")
def me(
    user=Depends(current),
):
    return {
        "id": user.id,
        "email": user.email,
    }