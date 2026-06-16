import enum

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles, log_action
from app.core.db import get_db
from app.models.models import (
    ChangeRequest,
    ChangeRequestItem,
    Clinic,
    EntityHistory,
    Executor,
    Location,
    Package,
    PackageItem,
    PackagePrice,
    RequestComment,
    RequestHistory,
    RequestStatus,
    Service,
    ServiceGroup,
    ServicePrice,
    ServiceStatus,
    ServiceSubgroup,
    User,
    UserRole,
)
from app.core.config import settings
from app.services.notify import send_mail
from app.services.request_email import render_approval_email
from app.schemas.schemas import (
    ChangeRequestCreate,
    ChangeRequestOut,
    ChangeRequestUpdate,
    CommentCreate,
    PendingCount,
    RequestApproveInput,
    RequestRejectInput,
)

router = APIRouter(prefix="/api/requests", tags=["requests"])

R2_FINANCIAL = frozenset({"service_price", "package_price", "package_item_add", "package_item_remove"})
R3_MEDICAL_TYPES = frozenset({
    "service", "package", "service_create", "package_create",
    "group", "subgroup", "executor", "location",
    "group_create", "subgroup_create", "executor_create", "location_create",
})
_CANCELABLE = frozenset({
    RequestStatus.draft, RequestStatus.revision,
    RequestStatus.pending_cfd, RequestStatus.pending_ceo,
})
R3_SERVICE_FIELDS = frozenset({
    "name_ru", "name_ro", "duration_min", "note", "group_id", "subgroup_id", "executor_id", "location_id", "status",
})
R3_PACKAGE_FIELDS = frozenset({"name_ru", "name_ro", "status"})


def _assert_items_allowed(role: UserRole, items: list[dict]) -> None:
    for item in items:
        et = item.get("entity_type", "")
        fn = item.get("field_name", "")
        if role == UserRole.r2:
            if et not in R2_FINANCIAL:
                raise HTTPException(403, f"Тип изменения «{et}» недоступен финансовому директору")
        elif role == UserRole.r3:
            if et in R2_FINANCIAL:
                raise HTTPException(403, f"Тип изменения «{et}» недоступен медицинскому директору")
            if et not in R3_MEDICAL_TYPES:
                raise HTTPException(403, f"Тип изменения «{et}» недоступен медицинскому директору")
            if et == "service" and fn not in R3_SERVICE_FIELDS:
                raise HTTPException(403, f"Поле «{fn}» недоступно для изменения услуги")
            if et == "package" and fn not in R3_PACKAGE_FIELDS:
                raise HTTPException(403, f"Поле «{fn}» недоступно для изменения пакета")


def _item_value(item: ChangeRequestItem):
    return item.r2_override_value if item.r2_override_value is not None else item.new_value


async def _emails_by_role(db: AsyncSession, role: UserRole) -> list[str]:
    res = await db.execute(select(User.email).where(User.role == role, User.is_active == True))
    return list(res.scalars().all())


async def _participants(db: AsyncSession, req_id: int) -> list[str]:
    """Автор + все, кто комментировал или менял статус (Ф31)."""
    res = await db.execute(
        select(User.email)
        .join(ChangeRequest, ChangeRequest.author_id == User.id)
        .where(ChangeRequest.id == req_id)
    )
    emails = set(res.scalars().all())
    for model, col in ((RequestComment, RequestComment.author_id), (RequestHistory, RequestHistory.actor_id)):
        r = await db.execute(select(User.email).join(model, col == User.id).where(model.request_id == req_id))
        emails.update(r.scalars().all())
    return list(emails)


async def _author_email(db: AsyncSession, req: ChangeRequest) -> str | None:
    u = await db.get(User, req.author_id)
    return u.email if u else None


def _req_url(req_id: int) -> str:
    return f"{settings.app_base_url.rstrip('/')}/requests/{req_id}"


def _coerce_value(obj, field: str, raw):
    val = raw.get("v") if isinstance(raw, dict) else raw
    if val is None or val == "":
        return None
    col = obj.__table__.columns.get(field)
    if col is None:
        return val
    py = col.type.python_type
    try:
        if py is int:
            return int(val)
        if py is float:
            return float(val)
        if py is bool:
            return val if isinstance(val, bool) else str(val).lower() in ("1", "true", "yes")
        if isinstance(py, type) and issubclass(py, enum.Enum):
            return py(str(val).split(".")[-1])
    except (TypeError, ValueError):
        pass
    return val


def _set_field(db: AsyncSession, obj, entity_type: str, field: str, value, actor_id: int):
    old = getattr(obj, field)
    new = _coerce_value(obj, field, value)
    setattr(obj, field, new)
    db.add(EntityHistory(
        entity_type=entity_type, entity_id=obj.id, field_name=field,
        old_value={"v": str(old)}, new_value={"v": str(new)}, changed_by=actor_id,
    ))


# Правка существующих сущностей и создание новых через заявку (R2/R3)
EDIT_MODELS = {
    "service": Service, "package": Package, "group": ServiceGroup,
    "subgroup": ServiceSubgroup, "executor": Executor, "location": Location, "clinic": Clinic,
}
CREATE_MODELS = {
    "group": ServiceGroup, "subgroup": ServiceSubgroup,
    "executor": Executor, "location": Location, "clinic": Clinic,
}
_PRICE_FIELDS = ("price", "price_cmn", "price_online", "price_special", "currency")


async def _apply_request(db: AsyncSession, req: ChangeRequest, actor_id: int):
    for item in req.items:
        value = _item_value(item)
        data = value if isinstance(value, dict) else {}
        et = item.entity_type

        if et in EDIT_MODELS and item.entity_id:
            obj = await db.get(EDIT_MODELS[et], item.entity_id)
            if obj and hasattr(obj, item.field_name):
                _set_field(db, obj, et, item.field_name, value, actor_id)
        elif et == "service_create":
            if item.entity_id:  # активация pending-услуги от R3 (Ф38)
                svc = await db.get(Service, item.entity_id)
                if svc:
                    _set_field(db, svc, "service", "status", ServiceStatus.active, actor_id)
            else:
                db.add(Service(**data, created_by=actor_id, status=ServiceStatus.active))
        elif et == "package_create":
            items_data = data.pop("items", [])
            pkg = Package(**data, created_by=actor_id)
            db.add(pkg)
            await db.flush()
            for it in items_data:
                db.add(PackageItem(package_id=pkg.id, **it))
        elif et.endswith("_create") and et[:-7] in CREATE_MODELS:
            model = CREATE_MODELS[et[:-7]]
            db.add(model(**{k: v for k, v in data.items() if hasattr(model, k)}))
        elif et == "package_item_add":
            db.add(PackageItem(package_id=data["package_id"], service_id=data["service_id"],
                               inclusion_type=data.get("inclusion_type", "required")))
        elif et == "package_item_remove":
            pi = await db.get(PackageItem, data["item_id"])
            if pi:
                await db.delete(pi)
        elif et == "package_price":
            res = await db.execute(select(PackagePrice).where(
                PackagePrice.package_id == data["package_id"],
                PackagePrice.clinic_id == data["clinic_id"],
            ))
            pp = res.scalar_one_or_none()
            if pp:
                pp.price_fixed = data.get("price_fixed")
            else:
                db.add(PackagePrice(package_id=data["package_id"], clinic_id=data["clinic_id"],
                                    currency=data.get("currency", "MDL"), price_fixed=data.get("price_fixed")))
        elif et == "service_price":
            res = await db.execute(select(ServicePrice).where(
                ServicePrice.service_id == data["service_id"],
                ServicePrice.clinic_id == data["clinic_id"],
                ServicePrice.valid_to == None,
            ))
            sp = res.scalar_one_or_none()
            if sp:
                for f in _PRICE_FIELDS:
                    if f in data:
                        _set_field(db, sp, "service_price", f, data[f], actor_id)
            else:
                db.add(ServicePrice(**{k: v for k, v in data.items()
                                       if k in _PRICE_FIELDS + ("service_id", "clinic_id")}))


@router.get("", response_model=list[ChangeRequestOut])
async def list_requests(
    status: str | None = None,
    author_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.r1, UserRole.r2, UserRole.r3)),
):
    query = select(ChangeRequest)
    if status:
        query = query.where(ChangeRequest.status == status)
    if author_id:
        query = query.where(ChangeRequest.author_id == author_id)
    result = await db.execute(query.order_by(ChangeRequest.updated_at.desc()))
    return result.scalars().all()


@router.post("", response_model=ChangeRequestOut)
async def create_request(
    body: ChangeRequestCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.r2, UserRole.r3)),
):
    _assert_items_allowed(user.role, body.items)
    req = ChangeRequest(title=body.title, note=body.note, author_id=user.id)
    db.add(req)
    await db.flush()
    for item in body.items:
        db.add(ChangeRequestItem(request_id=req.id, **item))
    db.add(RequestHistory(request_id=req.id, from_status=None, to_status=req.status.value, actor_id=user.id))
    await db.commit()
    await db.refresh(req)
    await log_action(db, user.id, "create_request", "change_request", req.id)
    return req


@router.get("/pending-count", response_model=PendingCount)
async def pending_count(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.r1, UserRole.r2, UserRole.r3)),
):
    expected = {
        UserRole.r1: RequestStatus.pending_ceo,
        UserRole.r2: RequestStatus.pending_cfd,
        UserRole.r3: RequestStatus.revision,
    }[user.role]
    result = await db.execute(
        select(func.count(ChangeRequest.id)).where(ChangeRequest.status == expected)
    )
    return {"count": result.scalar_one()}


@router.get("/{id}", response_model=ChangeRequestOut)
async def get_request(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.r1, UserRole.r2, UserRole.r3)),
):
    req = await db.get(ChangeRequest, id)
    if not req:
        raise HTTPException(404)
    return req


@router.patch("/{id}", response_model=ChangeRequestOut)
async def update_request(
    id: int,
    body: ChangeRequestUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.r2, UserRole.r3)),
):
    req = await db.get(ChangeRequest, id)
    if not req or req.author_id != user.id:
        raise HTTPException(404)
    if req.status not in (RequestStatus.draft, RequestStatus.revision):
        raise HTTPException(400, "Заявку можно редактировать только в черновике или на доработке")
    data = body.model_dump(exclude_unset=True)
    if "title" in data:
        req.title = data["title"]
    if "note" in data:
        req.note = data["note"]
    if "items" in data and data["items"] is not None:
        _assert_items_allowed(user.role, data["items"])
        await db.execute(delete(ChangeRequestItem).where(ChangeRequestItem.request_id == id))
        for item in data["items"]:
            db.add(ChangeRequestItem(request_id=id, **item))
    await db.commit()
    await db.refresh(req)
    await log_action(db, user.id, "update_request", "change_request", id)
    return req


@router.patch("/{id}/submit", response_model=ChangeRequestOut)
async def submit_request(
    id: int,
    bg: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.r2, UserRole.r3)),
):
    req = await db.get(ChangeRequest, id)
    if not req or req.author_id != user.id:
        raise HTTPException(404)
    if req.status == RequestStatus.cancelled:
        raise HTTPException(400, "Заявка отменена")
    if req.status not in (RequestStatus.draft, RequestStatus.revision):
        raise HTTPException(400, "Request cannot be submitted")
    old = req.status.value
    # Маршрутизация по роли автора: R2 → сразу гендиректору; R3 → финдиректору
    notify_role = UserRole.r1 if user.role == UserRole.r2 else UserRole.r2
    req.status = RequestStatus.pending_ceo if user.role == UserRole.r2 else RequestStatus.pending_cfd
    db.add(RequestHistory(request_id=id, from_status=old, to_status=req.status.value, actor_id=user.id))
    await db.commit()
    await db.refresh(req)
    # Ф5: уведомить следующего согласующего — интерактивное HTML-письмо
    subject, text, html = await render_approval_email(db, req)
    bg.add_task(send_mail, await _emails_by_role(db, notify_role), subject, text, html)
    if author := await _author_email(db, req):
        bg.add_task(send_mail, [author], f"Заявка №{req.id} отправлена на согласование",
                    f"Ваша заявка «{req.title}» отправлена на согласование.\n\nОткрыть: {_req_url(id)}")
    return req


@router.patch("/{id}/approve", response_model=ChangeRequestOut)
async def approve_request(
    id: int,
    body: RequestApproveInput,
    bg: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.r1, UserRole.r2)),
):
    req = await db.get(ChangeRequest, id)
    if not req:
        raise HTTPException(404)
    if req.status == RequestStatus.cancelled:
        raise HTTPException(400, "Заявка отменена")
    old = req.status.value
    if user.role == UserRole.r2 and req.status == RequestStatus.pending_cfd:
        for item in req.items:
            if body.r2_overrides and item.id in body.r2_overrides:
                item.r2_override_value = body.r2_overrides[item.id]
        req.status = RequestStatus.pending_ceo
        recipients = await _emails_by_role(db, UserRole.r1)
    elif user.role == UserRole.r1 and req.status == RequestStatus.pending_ceo:
        await _apply_request(db, req, user.id)
        req.status = RequestStatus.approved
        recipients = await _participants(db, id)
    else:
        raise HTTPException(400, "Invalid transition")
    db.add(RequestHistory(request_id=id, from_status=old, to_status=req.status.value, actor_id=user.id, note=body.note))
    await db.commit()
    await db.refresh(req)
    await log_action(db, user.id, "approve_request", "change_request", id)
    if req.status == RequestStatus.pending_ceo:
        # R2 согласовал → заявка ушла гендиректору: интерактивное HTML-письмо
        subject, text, html = await render_approval_email(db, req)
        bg.add_task(send_mail, recipients, subject, text, html)
        if author := await _author_email(db, req):
            bg.add_task(send_mail, [author], f"Заявка №{req.id}: согласована финдиректором",
                        f"Заявка «{req.title}» передана на утверждение гендиректору.\n\nОткрыть: {_req_url(id)}")
    else:
        url = _req_url(id)
        bg.add_task(send_mail, recipients, f"Заявка №{req.id}: утверждена",
                    f"Заявка «{req.title}» утверждена.\n\nОткрыть: {url}")
    return req


@router.patch("/{id}/reject", response_model=ChangeRequestOut)
async def reject_request(
    id: int,
    body: RequestRejectInput,
    bg: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.r1, UserRole.r2)),
):
    req = await db.get(ChangeRequest, id)
    if not req:
        raise HTTPException(404)
    if req.status == RequestStatus.cancelled:
        raise HTTPException(400, "Заявка отменена")
    old = req.status.value
    if user.role == UserRole.r2 and req.status == RequestStatus.pending_cfd:
        req.status = RequestStatus.revision
    elif user.role == UserRole.r1 and req.status == RequestStatus.pending_ceo:
        if body.final:
            req.status = RequestStatus.rejected
        elif body.send_to == "r2":
            req.status = RequestStatus.pending_cfd
        elif body.send_to == "r3":
            if not req.author or req.author.role != UserRole.r3:
                raise HTTPException(400, "Вернуть меддиректору можно только заявку, созданную меддиректором")
            req.status = RequestStatus.revision
        else:
            raise HTTPException(400, "Invalid transition")
    else:
        raise HTTPException(400, "Invalid transition")
    db.add(RequestHistory(request_id=id, from_status=old, to_status=req.status.value, actor_id=user.id, note=body.note))
    await db.commit()
    await db.refresh(req)
    if req.status == RequestStatus.rejected:
        bg.add_task(send_mail, await _participants(db, id), f"Заявка №{req.id}: отклонена",
                    f"Заявка «{req.title}» отклонена гендиректором. {body.note or ''}\n\nОткрыть: {_req_url(id)}")
    else:
        bg.add_task(send_mail, await _participants(db, id), f"Заявка №{req.id} возвращена на доработку",
                    f"Заявка «{req.title}» возвращена на доработку. {body.note or ''}\n\nОткрыть: {_req_url(id)}")
    return req


@router.patch("/{id}/cancel", response_model=ChangeRequestOut)
async def cancel_request(
    id: int,
    bg: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.r2, UserRole.r3)),
):
    req = await db.get(ChangeRequest, id)
    if not req or req.author_id != user.id:
        raise HTTPException(404)
    if req.status not in _CANCELABLE:
        raise HTTPException(400, "Заявку нельзя отменить")
    old = req.status.value
    req.status = RequestStatus.cancelled
    db.add(RequestHistory(request_id=id, from_status=old, to_status=req.status.value, actor_id=user.id))
    await db.commit()
    await db.refresh(req)
    await log_action(db, user.id, "cancel_request", "change_request", id)
    recipients = [e for e in await _participants(db, id) if e != user.email]
    bg.add_task(send_mail, recipients, f"Заявка №{req.id} отменена автором",
                f"Заявка «{req.title}» отменена автором.\n\nОткрыть: {_req_url(id)}")
    return req


@router.post("/{id}/comments")
async def add_comment(
    id: int,
    body: CommentCreate,
    bg: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.r1, UserRole.r2, UserRole.r3)),
):
    req = await db.get(ChangeRequest, id)
    if not req:
        raise HTTPException(404)
    db.add(RequestComment(request_id=id, author_id=user.id, text=body.text))
    await db.commit()
    # Ф31: уведомить автора и всех участников заявки
    recipients = [e for e in await _participants(db, id) if e != user.email]
    bg.add_task(send_mail, recipients, f"Новый комментарий к заявке №{id}",
                f"{user.name}: {body.text}")
    return {"ok": True}
