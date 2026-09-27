from datetime import datetime,timedelta,timezone
import jwt
from pwdlib import PasswordHash
from app.core.config import settings
ph=PasswordHash.recommended()
def hash_password(p): return ph.hash(p)
def verify_password(p,h): return ph.verify(p,h)
def token(uid): return jwt.encode({"sub":str(uid),"exp":datetime.now(timezone.utc)+timedelta(hours=1)},settings.jwt_secret,algorithm="HS256")
def user_id(t): return int(jwt.decode(t,settings.jwt_secret,algorithms=["HS256"])["sub"])
