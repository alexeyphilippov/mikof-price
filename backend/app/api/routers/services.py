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
    EntityHistoryOut,
)
from app.api.deps import get_current_user, require_roles, log_action

router = APIRouter(prefix="/api/services", tags=["services"])

_r1 = require_roles(UserRole.r1)
_r1r3 = require_roles(UserRole.r1, UserRole.r3)


async def _chisinau_clinic_id(db: AsyncSession) -> Optional[int]:
    res = await db.execute(select(Clinic.id).where(Clinic.code == "CLN-001"))
    return res.scalar_one_or_none()


@router.get("", response_model=list[ServiceOut])
async def list_services(
    group_id: Optional[int] = Query(None),
    subgroup_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
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
    res = await db.execute(q.order_by(Service.code))
    services = res.scalars().all()
    clinic_id = await _chisinau_clinic_id(db)
    prices: dict[int, float] = {}
    if clinic_id and services:
        ids = [s.id for s in services]
        pr = await db.execute(
            select(ServicePrice.service_id, ServicePrice.price).where(
                ServicePrice.service_id.in_(ids),
                ServicePrice.clinic_id == clinic_id,
                ServicePrice.valid_to == None,
            )
        )
        prices = {sid: float(p) for sid, p in pr.all() if p is not None}
    return [
        ServiceOut.model_validate(s).model_copy(update={"price": prices.get(s.id)})
        for s in services
    ]


@router.post("", response_model=ServiceOut)
async def create_service(
    body: ServiceCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_r1r3),
):
    if body.group_id and body.subgroup_id:
        g = await db.get(ServiceGroup, body.group_id)
        sg = await db.get(ServiceSubgroup, body.subgroup_id)
        if g and sg:
            prefix = f"{g.code}-{sg.code}-"
            if not body.code.startswith(prefix):
                raise HTTPException(400, f"Код должен начинаться с {prefix}")
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
    return obj


@router.patch("/{id}", response_model=ServiceOut)
async def update_service(
    id: int,
    body: ServiceUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_r1),  # Ф32: прямые правки — только R1; R3 через заявку
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


# ── Цены ─────────────────────────────────────────────────────────────────────
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
    for p in prev:  # SCD: закрываем все прежние активные записи
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
