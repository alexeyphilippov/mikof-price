from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles, log_action
from app.auth.auth import hash_password
from app.core.db import get_db
from app.models.models import User, UserRole
from app.schemas.schemas import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])

_r1 = require_roles(UserRole.r1)


@router.get("", response_model=list[UserOut])
async def list_users(db: AsyncSession = Depends(get_db), _: User = Depends(_r1)):
    res = await db.execute(select(User).order_by(User.id))
    return res.scalars().all()


@router.post("", response_model=UserOut)
async def create_user(body: UserCreate, db: AsyncSession = Depends(get_db), admin: User = Depends(_r1)):
    if (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none():
        raise HTTPException(400, "Email already exists")
    obj = User(
        email=body.email,
        password_hash=hash_password(body.password),
        name=body.name,
        role=UserRole(body.role),
        created_by=admin.id,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    await log_action(db, admin.id, "create_user", "user", obj.id)
    return obj


@router.patch("/{id}", response_model=UserOut)
async def update_user(id: int, body: UserUpdate, db: AsyncSession = Depends(get_db), admin: User = Depends(_r1)):
    obj = await db.get(User, id)
    if not obj:
        raise HTTPException(404)
    data = body.model_dump(exclude_unset=True)
    if "password" in data and data["password"]:
        obj.password_hash = hash_password(data.pop("password"))
        obj.token_version += 1  # отзыв сессий при смене пароля (S7)
    else:
        data.pop("password", None)
    if "role" in data and data["role"]:
        obj.role = UserRole(data.pop("role"))
        obj.token_version += 1  # роль изменилась — переавторизация (S7)
    if data.get("is_active") is False:
        obj.token_version += 1  # деактивация — мгновенный отзыв (S7)
    for k, v in data.items():
        setattr(obj, k, v)
    await db.commit()
    await db.refresh(obj)
    await log_action(db, admin.id, "update_user", "user", id)
    return obj
