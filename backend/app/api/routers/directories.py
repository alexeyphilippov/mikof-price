from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.db import get_db
from app.models.models import (
    ServiceGroup, ServiceSubgroup, Executor, Location, Clinic, ClinicStatus,
    EntityHistory, Package, PackagePrice, Service, ServicePrice, ServiceStatus,
    User, UserRole, DIR_ARCHIVED, DIR_ACTIVE,
)
from app.schemas.schemas import (
    GroupOut, GroupCreate, SubgroupOut, SubgroupCreate,
    ExecutorOut, ExecutorCreate, LocationOut, LocationCreate,
    ClinicOut, ClinicCreate, ClinicUpdate,
)
from app.api.deps import get_current_user, require_roles

router = APIRouter(prefix="/api", tags=["directories"])

# Ф32: прямые правки справочников — только R1; R3 — через заявки
_r1 = require_roles(UserRole.r1)


async def _patch_with_history(db: AsyncSession, model, id: int, data: dict, entity_type: str, user: User):
    res = await db.execute(select(model).where(model.id == id))
    obj = res.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    for field, new_val in data.items():
        old_val = getattr(obj, field)
        if old_val != new_val:
            db.add(EntityHistory(
                entity_type=entity_type, entity_id=id, field_name=field,
                old_value={"v": str(old_val)}, new_value={"v": str(new_val)},
                changed_by=user.id,
            ))
            setattr(obj, field, new_val)
    await db.commit()
    await db.refresh(obj)
    return obj


# ── Группы ───────────────────────────────────────────────────────────────────
@router.get("/groups", response_model=list[GroupOut])
async def list_groups(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    res = await db.execute(select(ServiceGroup).order_by(ServiceGroup.code))
    return res.scalars().all()


@router.post("/groups", response_model=GroupOut)
async def create_group(body: GroupCreate, db: AsyncSession = Depends(get_db), _=Depends(_r1)):
    obj = ServiceGroup(**body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/groups/{id}", response_model=GroupOut)
async def update_group(id: int, body: GroupCreate, db: AsyncSession = Depends(get_db), user: User = Depends(_r1)):
    return await _patch_with_history(db, ServiceGroup, id, body.model_dump(exclude_unset=True), "group", user)


# ── Подгруппы ─────────────────────────────────────────────────────────────────
@router.get("/subgroups", response_model=list[SubgroupOut])
async def list_subgroups(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    res = await db.execute(select(ServiceSubgroup).order_by(ServiceSubgroup.code))
    return res.scalars().all()


@router.post("/subgroups", response_model=SubgroupOut)
async def create_subgroup(body: SubgroupCreate, db: AsyncSession = Depends(get_db), _=Depends(_r1)):
    obj = ServiceSubgroup(**body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/subgroups/{id}", response_model=SubgroupOut)
async def update_subgroup(id: int, body: SubgroupCreate, db: AsyncSession = Depends(get_db), user: User = Depends(_r1)):
    return await _patch_with_history(db, ServiceSubgroup, id, body.model_dump(exclude_unset=True), "subgroup", user)


# ── Исполнители ───────────────────────────────────────────────────────────────
@router.get("/executors", response_model=list[ExecutorOut])
async def list_executors(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    res = await db.execute(select(Executor).order_by(Executor.code))
    return res.scalars().all()


@router.post("/executors", response_model=ExecutorOut)
async def create_executor(body: ExecutorCreate, db: AsyncSession = Depends(get_db), _=Depends(_r1)):
    obj = Executor(**body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/executors/{id}", response_model=ExecutorOut)
async def update_executor(id: int, body: ExecutorCreate, db: AsyncSession = Depends(get_db), user: User = Depends(_r1)):
    return await _patch_with_history(db, Executor, id, body.model_dump(exclude_unset=True), "executor", user)


# ── Места оказания ────────────────────────────────────────────────────────────
@router.get("/locations", response_model=list[LocationOut])
async def list_locations(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    res = await db.execute(select(Location).order_by(Location.code))
    return res.scalars().all()


@router.post("/locations", response_model=LocationOut)
async def create_location(body: LocationCreate, db: AsyncSession = Depends(get_db), _=Depends(_r1)):
    obj = Location(**body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/locations/{id}", response_model=LocationOut)
async def update_location(id: int, body: LocationCreate, db: AsyncSession = Depends(get_db), user: User = Depends(_r1)):
    return await _patch_with_history(db, Location, id, body.model_dump(exclude_unset=True), "location", user)


# ── Использование и архивация справочников (зам.9) ────────────────────────────
# kind → (модель, имя FK в Service, есть ли связь с пакетами)
_DIR = {
    "groups": (ServiceGroup, "group_id", True),
    "subgroups": (ServiceSubgroup, "subgroup_id", True),
    "executors": (Executor, "executor_id", False),
    "locations": (Location, "location_id", False),
}


async def _dir_usage(db: AsyncSession, kind: str, id: int) -> dict:
    if kind == "clinics":  # связь клиники — через активные цены
        svc = (await db.execute(
            select(Service.id, Service.code, Service.name_ru)
            .join(ServicePrice, ServicePrice.service_id == Service.id)
            .where(ServicePrice.clinic_id == id, ServicePrice.valid_to == None).distinct()
        )).all()
        pkgs = (await db.execute(
            select(Package.id, Package.code, Package.name_ru)
            .join(PackagePrice, PackagePrice.package_id == Package.id)
            .where(PackagePrice.clinic_id == id).distinct()
        )).all()
    else:
        model, col, has_pkg = _DIR[kind]
        svc = (await db.execute(
            select(Service.id, Service.code, Service.name_ru)
            .where(getattr(Service, col) == id, Service.status == ServiceStatus.active)
        )).all()
        pkgs = []
        if has_pkg:
            pkgs = (await db.execute(
                select(Package.id, Package.code, Package.name_ru).where(getattr(Package, col) == id)
            )).all()
    return {
        "services": [{"id": s.id, "code": s.code, "name_ru": s.name_ru} for s in svc],
        "packages": [{"id": p.id, "code": p.code, "name_ru": p.name_ru} for p in pkgs],
    }


@router.get("/{kind}/{id}/usage")
async def directory_usage(kind: str, id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    if kind not in _DIR and kind != "clinics":
        raise HTTPException(404)
    return await _dir_usage(db, kind, id)


@router.patch("/{kind}/{id}/archive")
async def directory_archive(kind: str, id: int, db: AsyncSession = Depends(get_db), user: User = Depends(_r1)):
    is_clinic = kind == "clinics"
    if kind not in _DIR and not is_clinic:
        raise HTTPException(404)
    model = Clinic if is_clinic else _DIR[kind][0]
    obj = await db.get(model, id)
    if not obj:
        raise HTTPException(404)
    cur = obj.status.value if is_clinic else obj.status
    archived_val = ClinicStatus.closed.value if is_clinic else DIR_ARCHIVED
    active_val = ClinicStatus.active.value if is_clinic else DIR_ACTIVE
    if cur != archived_val:  # переводим в архив/закрытие → block-if-used
        usage = await _dir_usage(db, kind, id)
        if usage["services"] or usage["packages"]:
            raise HTTPException(409, detail=usage)
    new_status = active_val if cur == archived_val else archived_val
    return await _patch_with_history(db, model, id, {"status": new_status}, "clinic" if is_clinic else kind[:-1], user)


# ── Клиники ───────────────────────────────────────────────────────────────────
@router.get("/clinics", response_model=list[ClinicOut])
async def list_clinics(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    res = await db.execute(select(Clinic).order_by(Clinic.code))
    return res.scalars().all()


@router.post("/clinics", response_model=ClinicOut)
async def create_clinic(body: ClinicCreate, db: AsyncSession = Depends(get_db), _=Depends(_r1)):
    obj = Clinic(**body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/clinics/{id}", response_model=ClinicOut)
async def update_clinic(id: int, body: ClinicUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(_r1)):
    return await _patch_with_history(db, Clinic, id, body.model_dump(exclude_unset=True), "clinic", user)
