from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.database import Base, engine
from app.models import user, video, practice, vocabulary
from app.api import auth, videos, practice as practice_api, vocabulary as vocabulary_api

Base.metadata.create_all(bind=engine)
app = FastAPI(title="English Shadowing API")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(videos.router, prefix="/videos", tags=["videos"])
app.include_router(practice_api.router, prefix="/practice", tags=["practice"])
app.include_router(vocabulary_api.router, prefix="/vocabulary", tags=["vocabulary"])
@app.get("/health")
def health(): return {"status":"ok"}
