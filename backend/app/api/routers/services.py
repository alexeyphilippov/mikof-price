from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, or_

from app.core.db import get_db
from app.models.models import (
    Service, ServicePrice, ServiceStatus, UserRole, EntityHistory, User,
    Clinic, ClinicStatus, ServiceGroup, ServiceSubgroup,
)
from app.schemas.schemas import (
    ServiceOut, ServiceCreate, ServiceUpdate, ServicePriceOut, ServicePriceCreate,
    EntityHistoryOut, PageOut,
)
from app.api.deps import get_current_user, require_roles, log_action

router = APIRouter(prefix="/api/services", tags=["services"])

_r1 = require_roles(UserRole.r1)
_r1r3 = require_roles(UserRole.r1, UserRole.r3)

_CHISINAU_CODE = "CLN-001"


async def _chisinau_id(db: AsyncSession) -> int | None:
    res = await db.execute(select(Clinic.id).where(Clinic.code == _CHISINAU_CODE))
    return res.scalar_one_or_none()


async def _service_prices(db: AsyncSession, clinic_id: int, service_ids: list[int]) -> dict[int, float]:
    if not service_ids:
        return {}
    res = await db.execute(
        select(ServicePrice.service_id, ServicePrice.price).where(
            ServicePrice.clinic_id == clinic_id,
            ServicePrice.service_id.in_(service_ids),
            ServicePrice.valid_to == None,
        )
    )
    return {sid: float(p) for sid, p in res.all() if p is not None}


def _attach_prices(services: list[Service], prices: dict[int, float]) -> list[ServiceOut]:
    out = []
    for s in services:
        row = ServiceOut.model_validate(s)
        row.price = prices.get(s.id)
        out.append(row)
    return out


async def _validate_service_code(db: AsyncSession, code: str, group_id: int | None, subgroup_id: int | None):
    if not group_id or not subgroup_id:
        raise HTTPException(400, "Группа и подгруппа обязательны")
    g = await db.get(ServiceGroup, group_id)
    sg = await db.get(ServiceSubgroup, subgroup_id)
    if not g or not sg:
        raise HTTPException(400, "Группа или подгруппа не найдены")
    prefix = f"{g.code}-{sg.code}-"
    if not code.startswith(prefix):
        raise HTTPException(400, f"Код должен начинаться с {prefix}")


@router.get("", response_model=PageOut[ServiceOut])
async def list_services(
    group_id: Optional[int] = Query(None),
    subgroup_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(Service)
    filters = []
    if user.role == UserRole.r4:
        filters.append(Service.status == ServiceStatus.active)
    elif status:
        filters.append(Service.status == status)
    if group_id:
        filters.append(Service.group_id == group_id)
    if subgroup_id:
        filters.append(Service.subgroup_id == subgroup_id)
    if search:
        pat = f"%{search}%"
        filters.append(or_(
            Service.name_ru.collate("und-x-icu").ilike(pat),
            Service.code.collate("und-x-icu").ilike(pat),
        ))
    if filters:
        q = q.where(and_(*filters))
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    res = await db.execute(q.order_by(Service.code).limit(limit).offset(offset))
    services = res.scalars().all()
    cid = await _chisinau_id(db)
    prices = await _service_prices(db, cid, [s.id for s in services]) if cid else {}
    return {
        "items": _attach_prices(services, prices),
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("", response_model=ServiceOut)
async def create_service(
    body: ServiceCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_r1r3),
):
    await _validate_service_code(db, body.code, body.group_id, body.subgroup_id)
    obj = Service(**body.model_dump(), created_by=user.id)
    if user.role == UserRole.r3:
        obj.status = ServiceStatus.pending
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    await log_action(db, user.id, "create_service", "service", obj.id)
    return obj


@router.get("/{id}", response_model=ServiceOut)
async def get_service(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    res = await db.execute(select(Service).where(Service.id == id))
    obj = res.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    if user.role == UserRole.r4 and obj.status != ServiceStatus.active:
        raise HTTPException(404)
    out = ServiceOut.model_validate(obj)
    cid = await _chisinau_id(db)
    if cid:
        prices = await _service_prices(db, cid, [obj.id])
        out.price = prices.get(obj.id)
    return out


@router.patch("/{id}", response_model=ServiceOut)
async def update_service(
    id: int,
    body: ServiceUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_r1),
):
    res = await db.execute(select(Service).where(Service.id == id))
    obj = res.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)

    changes = body.model_dump(exclude_unset=True)
    for field, new_val in changes.items():
        old_val = getattr(obj, field)
        if old_val != new_val:
            db.add(EntityHistory(
                entity_type="service",
                entity_id=id,
                field_name=field,
                old_value={"v": str(old_val)},
                new_value={"v": str(new_val)},
                changed_by=user.id,
            ))
            setattr(obj, field, new_val)
    await db.commit()
    await db.refresh(obj)
    await log_action(db, user.id, "update_service", "service", id)
    return obj


@router.get("/{id}/history", response_model=list[EntityHistoryOut])
async def service_history(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.r1, UserRole.r2, UserRole.r3)),
):
    res = await db.execute(
        select(EntityHistory)
        .where(EntityHistory.entity_type == "service", EntityHistory.entity_id == id)
        .order_by(EntityHistory.changed_at.desc())
    )
    return res.scalars().all()


@router.get("/{id}/prices", response_model=list[ServicePriceOut])
async def list_prices(id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    res = await db.execute(
        select(ServicePrice)
        .where(ServicePrice.service_id == id, ServicePrice.valid_to == None)
    )
    return res.scalars().all()


@router.post("/{id}/prices", response_model=ServicePriceOut)
async def set_price(
    id: int,
    body: ServicePriceCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.r1, UserRole.r2)),
):
    clinic = await db.get(Clinic, body.clinic_id)
    if not clinic:
        raise HTTPException(404, "Клиника не найдена")
    if clinic.status != ClinicStatus.active:
        raise HTTPException(400, "Нельзя задать цену для закрытой клиники")

    prev = (await db.execute(select(ServicePrice).where(
        ServicePrice.service_id == id,
        ServicePrice.clinic_id == body.clinic_id,
        ServicePrice.valid_to == None,
    ))).scalars().all()
    old = prev[0] if prev else None
    for p in prev:
        p.valid_to = func.now()
    for field in ("price", "price_online", "price_special"):
        ov, nv = (getattr(old, field) if old else None), getattr(body, field)
        if ov != nv:
            db.add(EntityHistory(
                entity_type="service", entity_id=id,
                field_name=f"{field} (клиника #{body.clinic_id})",
                old_value={"v": str(ov)}, new_value={"v": str(nv)}, changed_by=user.id,
            ))
    obj = ServicePrice(service_id=id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    await log_action(db, user.id, "set_service_price", "service", id)
    return obj
