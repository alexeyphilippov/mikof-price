import json
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Cookie, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.db import get_db
from app.auth.auth import decode_access_token
from app.models.models import User, UserRole, AuditLog


async def get_current_user(
    request: Request,
    access_token: str = Cookie(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_access_token(access_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = int(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def require_roles(*roles: UserRole):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker


async def log_action(
    db: AsyncSession,
    user_id: int,
    action: str,
    entity_type: str = None,
    entity_id: int = None,
    ip: str = None,
):
    db.add(AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        ip=ip,
    ))
    await db.commit()
    _emit_audit_log(user_id, action, entity_type, entity_id, ip)


def _emit_audit_log(user_id, action, entity_type, entity_id, ip):
    """Дублируем событие в /logs/audit.log для сбора Fluent Bit → Loki → Grafana (Н6)."""
    try:
        line = json.dumps({
            "ts": datetime.now(timezone.utc).isoformat(),
            "action": action,
            "user_id": user_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "ip": ip,
        }, ensure_ascii=False)
        with open("/logs/audit.log", "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass
