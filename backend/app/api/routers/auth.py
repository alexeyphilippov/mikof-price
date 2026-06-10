from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Response, Cookie, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.db import get_db
from app.models.models import User, RefreshToken
from app.auth.auth import (
    verify_password, create_access_token, create_refresh_token, hash_token
)
from app.schemas.schemas import LoginRequest, UserOut
from app.api.deps import get_current_user, log_action

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
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

    access = create_access_token(user.id, user.role.value)
    raw_refresh, expires = create_refresh_token(user.id)

    db.add(RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw_refresh),
        expires_at=expires,
    ))
    await db.execute(
        update(User).where(User.id == user.id).values(last_login=datetime.utcnow())
    )
    await db.commit()

    response.set_cookie("access_token", access, httponly=True, samesite="lax")
    response.set_cookie("refresh_token", raw_refresh, httponly=True, samesite="lax")
    await log_action(db, user.id, "login", ip=request.client.host)
    return {"ok": True}


@router.post("/logout")
async def logout(
    response: Response,
    refresh_token: str = Cookie(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if refresh_token:
        await db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == hash_token(refresh_token),
                RefreshToken.user_id == user.id,
            )
        )
        rt_res = await db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token))
        )
        rt = rt_res.scalar_one_or_none()
        if rt:
            rt.revoked = True
            await db.commit()
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
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
    if not rt or rt.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token invalid or expired")
    user_res = await db.execute(select(User).where(User.id == rt.user_id, User.is_active == True))
    user = user_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(user.id, user.role.value)
    response.set_cookie("access_token", access, httponly=True, samesite="lax")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user
