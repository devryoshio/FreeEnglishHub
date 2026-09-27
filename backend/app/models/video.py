from sqlalchemy import String,Text,Float,ForeignKey
from sqlalchemy.orm import Mapped,mapped_column,relationship
from app.db.database import Base
class Video(Base):
    __tablename__="videos"
    id:Mapped[int]=mapped_column(primary_key=True)
    user_id:Mapped[int]=mapped_column(ForeignKey("users.id",ondelete="CASCADE"))
    video_url:Mapped[str]=mapped_column(Text)
    title:Mapped[str|None]=mapped_column(String(500),nullable=True)
    user=relationship("User",back_populates="videos")
    sentences=relationship("Sentence",back_populates="video",cascade="all, delete-orphan")
class Sentence(Base):
    __tablename__="sentences"
    id:Mapped[int]=mapped_column(primary_key=True)
    video_id:Mapped[int]=mapped_column(ForeignKey("videos.id",ondelete="CASCADE"))
    text:Mapped[str]=mapped_column(Text)
    start_time:Mapped[float]=mapped_column(Float)
    end_time:Mapped[float]=mapped_column(Float)
    video=relationship("Video",back_populates="sentences")
