from datetime import datetime,timezone
from sqlalchemy import Float,ForeignKey,DateTime
from sqlalchemy.orm import Mapped,mapped_column
from app.db.database import Base
class PracticeAttempt(Base):
    __tablename__="practice_attempts"
    id:Mapped[int]=mapped_column(primary_key=True)
    user_id:Mapped[int]=mapped_column(ForeignKey("users.id",ondelete="CASCADE"))
    sentence_id:Mapped[int]=mapped_column(ForeignKey("sentences.id",ondelete="CASCADE"))
    score:Mapped[float|None]=mapped_column(Float,nullable=True)
    pronunciation_score:Mapped[float|None]=mapped_column(Float,nullable=True)
    similarity_score:Mapped[float|None]=mapped_column(Float,nullable=True)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=lambda:datetime.now(timezone.utc))
