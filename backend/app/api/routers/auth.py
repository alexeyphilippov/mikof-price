import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Response, Cookie, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.db import get_db
from app.core.config import settings
from app.core.ratelimit import limiter
from app.models.models import User, RefreshToken
from app.auth.auth import (
    verify_password, create_access_token, create_refresh_token, hash_token
)
from app.schemas.schemas import LoginRequest, UserOut
from app.api.deps import get_current_user, log_action, client_ip

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
@limiter.limit(settings.login_rate_limit)
async def login(
    body: LoginRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.email == body.email, User.is_active == True)
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access = create_access_token(user.id, user.role.value, user.token_version)
    raw_refresh, expires = create_refresh_token(user.id)

    db.add(RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw_refresh),
        expires_at=expires,
    ))
    await db.execute(
        update(User).where(User.id == user.id).values(last_login=datetime.now(timezone.utc))
    )
    await db.commit()

    secure = settings.cookie_secure
    response.set_cookie("access_token", access, httponly=True, samesite="lax", secure=secure)
    response.set_cookie("refresh_token", raw_refresh, httponly=True, samesite="lax", secure=secure)
    response.set_cookie("XSRF-TOKEN", secrets.token_urlsafe(32), httponly=False, samesite="lax", secure=secure)
    await log_action(db, user.id, "login", ip=client_ip(request))
    return {"ok": True}


@router.post("/logout")
async def logout(
    response: Response,
    refresh_token: str = Cookie(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if refresh_token:
        rt_res = await db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token))
        )
        rt = rt_res.scalar_one_or_none()
        if rt:
            rt.revoked = True
    user.token_version += 1
    await db.commit()
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    response.delete_cookie("XSRF-TOKEN")
    return {"ok": True}


@router.post("/refresh")
async def refresh(
    response: Response,
    refresh_token: str = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_token(refresh_token),
            RefreshToken.revoked == False,
        )
    )
    rt = result.scalar_one_or_none()
    exp = rt.expires_at.replace(tzinfo=timezone.utc) if rt and rt.expires_at.tzinfo is None else rt.expires_at
    if not rt or exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token invalid or expired")
    user_res = await db.execute(select(User).where(User.id == rt.user_id, User.is_active == True))
    user = user_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(user.id, user.role.value, user.token_version)
    response.set_cookie("access_token", access, httponly=True, samesite="lax", secure=settings.cookie_secure)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user
