from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.db import get_db
from app.models.models import AuditLog, EntityHistory, User, UserRole
from app.schemas.schemas import AuditLogOut, EntityHistoryOut

router = APIRouter(prefix="/api", tags=["audit"])


# Ф34: история изменений любой сущности C1-C7 (R1/R2/R3)
@router.get("/history", response_model=list[EntityHistoryOut])
async def entity_history(
    entity_type: str = Query(...),
    entity_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.r1, UserRole.r2, UserRole.r3)),
):
    res = await db.execute(
        select(EntityHistory)
        .where(EntityHistory.entity_type == entity_type, EntityHistory.entity_id == entity_id)
        .order_by(EntityHistory.changed_at.desc())
    )
    return res.scalars().all()


@router.get("/audit", response_model=list[AuditLogOut])
async def list_audit(
    user_id: int | None = Query(None),
    action: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.r1)),
):
    q = select(AuditLog)
    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    if action:
        q = q.where(AuditLog.action == action)
    if date_from:
        q = q.where(AuditLog.created_at >= date_from)
    if date_to:
        q = q.where(AuditLog.created_at <= date_to)
    res = await db.execute(q.order_by(AuditLog.created_at.desc()).limit(500))
    return res.scalars().all()
