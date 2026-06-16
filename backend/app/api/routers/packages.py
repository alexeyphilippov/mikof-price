from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.db import get_db
from app.models.models import (
    Package, PackageItem, PackagePrice, ServicePrice, UserRole, EntityHistory, User,
    Clinic, ClinicStatus,
)
from app.schemas.schemas import (
    PackageOut, PackageCreate, PackageUpdate, PackagePriceOut, PackagePriceCreate,
    PackageItemOut, PackageItemCreate, EntityHistoryOut,
)
from app.api.deps import get_current_user, require_roles, log_action

router = APIRouter(prefix="/api/packages", tags=["packages"])

# Ф32: прямые создание/правка пакетов — только R1; R3 — через заявку
_r1 = require_roles(UserRole.r1)


async def _chisinau_clinic_id(db: AsyncSession) -> Optional[int]:
    res = await db.execute(select(Clinic.id).where(Clinic.code == "CLN-001"))
    return res.scalar_one_or_none()


async def _calc_package_price(db: AsyncSession, package_id: int, clinic_id: int) -> Optional[float]:
    """Σ service_prices for all required items in this clinic."""
    items_res = await db.execute(
        select(PackageItem).where(PackageItem.package_id == package_id)
    )
    items = items_res.scalars().all()
    total = 0.0
    for item in items:
        price_res = await db.execute(
            select(ServicePrice.price).where(
                ServicePrice.service_id == item.service_id,
                ServicePrice.clinic_id == clinic_id,
                ServicePrice.valid_to == None,
            ).order_by(ServicePrice.valid_from.desc())
        )
        p = price_res.scalars().first()
        if p is None:
            return None
        total += float(p)
    return total


@router.get("", response_model=list[PackageOut])
async def list_packages(
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    q = select(Package)
    if search:
        pat = f"%{search}%"
        q = q.where(or_(
            Package.name_ru.collate("und-x-icu").ilike(pat),
            Package.code.collate("und-x-icu").ilike(pat),
        ))
    res = await db.execute(q.order_by(Package.code))
    packages = res.scalars().all()
    clinic_id = await _chisinau_clinic_id(db)
    prices: dict[int, Optional[float]] = {}
    if clinic_id and packages:
        pids = [p.id for p in packages]
        fixed_res = await db.execute(
            select(PackagePrice.package_id, PackagePrice.price_fixed).where(
                PackagePrice.package_id.in_(pids),
                PackagePrice.clinic_id == clinic_id,
            )
        )
        fixed = {pid: float(pf) for pid, pf in fixed_res.all() if pf is not None}
        for p in packages:
            prices[p.id] = fixed.get(p.id) if p.id in fixed else await _calc_package_price(db, p.id, clinic_id)
    return [
        PackageOut.model_validate(p).model_copy(update={"price": prices.get(p.id)})
        for p in packages
    ]


@router.post("", response_model=PackageOut)
async def create_package(
    body: PackageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_r1),
):
    data = body.model_dump()
    items_data = data.pop("items", [])
    obj = Package(**data, created_by=user.id)
    db.add(obj)
    await db.flush()
    for item in items_data:
        db.add(PackageItem(package_id=obj.id, **item))
    await db.commit()
    await db.refresh(obj)
    await log_action(db, user.id, "create_package", "package", obj.id)
    return obj


@router.get("/{id}", response_model=PackageOut)
async def get_package(id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    res = await db.execute(select(Package).where(Package.id == id))
    obj = res.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    return obj


@router.patch("/{id}", response_model=PackageOut)
async def update_package(
    id: int,
    body: PackageUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_r1),
):
    res = await db.execute(select(Package).where(Package.id == id))
    obj = res.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    changes = body.model_dump(exclude_unset=True)
    for field, new_val in changes.items():
        old_val = getattr(obj, field)
        if old_val != new_val:
            db.add(EntityHistory(
                entity_type="package", entity_id=id, field_name=field,
                old_value={"v": str(old_val)}, new_value={"v": str(new_val)},
                changed_by=user.id,
            ))
            setattr(obj, field, new_val)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.post("/{id}/items", response_model=PackageItemOut)
async def add_item(id: int, body: PackageItemCreate, db: AsyncSession = Depends(get_db), user: User = Depends(_r1)):
    obj = PackageItem(package_id=id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    await log_action(db, user.id, "add_package_item", "package", id)
    return obj


@router.delete("/{id}/items/{item_id}")
async def remove_item(id: int, item_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(_r1)):
    obj = await db.get(PackageItem, item_id)
    if not obj or obj.package_id != id:
        raise HTTPException(404)
    await db.delete(obj)
    await db.commit()
    await log_action(db, user.id, "remove_package_item", "package", id)
    return {"ok": True}


@router.get("/{id}/history", response_model=list[EntityHistoryOut])
async def package_history(
    id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.r1, UserRole.r2, UserRole.r3)),
):
    res = await db.execute(
        select(EntityHistory)
        .where(EntityHistory.entity_type == "package", EntityHistory.entity_id == id)
        .order_by(EntityHistory.changed_at.desc())
    )
    return res.scalars().all()


@router.get("/{id}/computed-price/{clinic_id}")
async def computed_price(
    id: int, clinic_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)
):
    # Check fixed price first
    pp_res = await db.execute(
        select(PackagePrice).where(
            PackagePrice.package_id == id, PackagePrice.clinic_id == clinic_id
        )
    )
    pp = pp_res.scalar_one_or_none()
    if pp and pp.price_fixed is not None:
        return {"price": float(pp.price_fixed), "fixed": True}
    total = await _calc_package_price(db, id, clinic_id)
    return {"price": total, "fixed": False}


@router.post("/{id}/prices", response_model=PackagePriceOut)
async def set_package_price(
    id: int,
    body: PackagePriceCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(_r1),  # прямая правка — R1; R2/R3 через заявку
):
    clinic = await db.get(Clinic, body.clinic_id)
    if not clinic:
        raise HTTPException(404, "Клиника не найдена")
    if clinic.status != ClinicStatus.active:
        raise HTTPException(400, "Нельзя задать цену для закрытой клиники")
    res = await db.execute(
        select(PackagePrice).where(
            PackagePrice.package_id == id, PackagePrice.clinic_id == body.clinic_id
        )
    )
    obj = res.scalar_one_or_none()
    if obj:
        obj.price_fixed = body.price_fixed
        obj.currency = body.currency
    else:
        obj = PackagePrice(package_id=id, **body.model_dump())
        db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj
