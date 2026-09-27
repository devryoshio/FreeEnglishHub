from datetime import datetime,timezone
from sqlalchemy import String,Text,ForeignKey,DateTime
from sqlalchemy.orm import Mapped,mapped_column
from app.db.database import Base
class Vocabulary(Base):
    __tablename__="vocabulary"
    id:Mapped[int]=mapped_column(primary_key=True)
    word:Mapped[str]=mapped_column(String(200),index=True)
    ipa:Mapped[str|None]=mapped_column(String(500),nullable=True)
    meaning:Mapped[str|None]=mapped_column(Text,nullable=True)
    example:Mapped[str|None]=mapped_column(Text,nullable=True)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=lambda:datetime.now(timezone.utc))
class UserVocabulary(Base):
    __tablename__="user_vocabulary"
    id:Mapped[int]=mapped_column(primary_key=True)
    user_id:Mapped[int]=mapped_column(ForeignKey("users.id",ondelete="CASCADE"))
    vocabulary_id:Mapped[int]=mapped_column(ForeignKey("vocabulary.id",ondelete="CASCADE"))
    review_count:Mapped[int]=mapped_column(default=0)


