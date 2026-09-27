from fastapi import APIRouter,Depends,HTTPException,Response,Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from pydantic import BaseModel,EmailStr
from app.db.database import get_db
from app.models import User
from app.core.security import hash_password,verify_password,token,user_id
router=APIRouter()
class Auth(BaseModel): email:EmailStr; password:str
def current(request:Request,db:Session=Depends(get_db)):
    t=request.cookies.get("access_token")
    if not t: raise HTTPException(401,"Not authenticated")
    try: uid=user_id(t)
    except Exception: raise HTTPException(401,"Invalid authentication")
    u=db.get(User,uid)
    if not u: raise HTTPException(401,"User not found")
    return u
@router.post("/register")
def register(data:Auth,response:Response,db:Session=Depends(get_db)):
    if len(data.password)<8: raise HTTPException(400,"Password must have at least 8 characters")
    if db.scalar(select(User).where(User.email==data.email)): raise HTTPException(409,"Email already registered")
    u=User(email=data.email,password_hash=hash_password(data.password)); db.add(u); db.commit(); db.refresh(u)
    response.set_cookie("access_token",token(u.id),httponly=True,samesite="lax",secure=False,max_age=3600)
    return {"id":u.id,"email":u.email}
@router.post("/login")
def login(data:Auth,response:Response,db:Session=Depends(get_db)):
    u=db.scalar(select(User).where(User.email==data.email))
    if not u or not verify_password(data.password,u.password_hash): raise HTTPException(401,"Invalid credentials")
    response.set_cookie("access_token",token(u.id),httponly=True,samesite="lax",secure=False,max_age=3600); return {"id":u.id,"email":u.email}
@router.post("/logout")
def logout(response:Response): response.delete_cookie("access_token"); return {"ok":True}
@router.get("/me")
def me(u=Depends(current)): return {"id":u.id,"email":u.email}
