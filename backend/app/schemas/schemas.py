from __future__ import annotations
import re
from datetime import datetime, timezone
from typing import Optional, Any, Annotated
from pydantic import BaseModel, EmailStr, field_validator, PlainSerializer

def _utc_iso(v: datetime) -> str:
    if v.tzinfo is None:
        v = v.replace(tzinfo=timezone.utc)
    else:
        v = v.astimezone(timezone.utc)
    return v.isoformat().replace("+00:00", "Z")

UtcDatetime = Annotated[datetime, PlainSerializer(_utc_iso, return_type=str)]

_PHONE_RE = re.compile(r"^[+\d][\d\s()\-]{4,}$")
_CODE_RE = re.compile(r"^[A-Z]-\d{3}-[A-Z:]+-\d{3}$")
_CYR = re.compile(r"[А-Яа-яЁё]")
_LAT = re.compile(r"[A-Za-z]")


def _validate_phone(v: Optional[str]) -> Optional[str]:
    if v and not _PHONE_RE.match(v):
        raise ValueError("Телефон может содержать только цифры, пробелы и + - ( )")
    return v


# ── Auth ─────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


# ── Справочники ───────────────────────────────────────────────────────────────
class GroupOut(BaseModel):
    id: int
    code: str
    name_ru: str
    name_ro: str
    status: str = "active"
    model_config = {"from_attributes": True}


class GroupCreate(BaseModel):
    code: str
    name_ru: str
    name_ro: str


class SubgroupOut(BaseModel):
    id: int
    code: str
    name_ru: str
    name_ro: str
    status: str = "active"
    model_config = {"from_attributes": True}


class SubgroupCreate(BaseModel):
    code: str
    name_ru: str
    name_ro: str


class ExecutorOut(BaseModel):
    id: int
    code: str
    name_ru: str
    status: str = "active"
    model_config = {"from_attributes": True}


class ExecutorCreate(BaseModel):
    code: str
    name_ru: str


class LocationOut(BaseModel):
    id: int
    code: str
    name_ru: str
    status: str = "active"
    model_config = {"from_attributes": True}


class LocationCreate(BaseModel):
    code: str
    name_ru: str


class ClinicOut(BaseModel):
    id: int
    code: str
    name_ru: str
    name_ro: str
    address: Optional[str]
    phone: Optional[str]
    status: str
    model_config = {"from_attributes": True}


class ClinicCreate(BaseModel):
    code: str
    name_ru: str
    name_ro: str
    address: Optional[str] = None
    phone: Optional[str] = None

    _phone = field_validator("phone")(lambda cls, v: _validate_phone(v))


class ClinicUpdate(BaseModel):
    name_ru: Optional[str] = None
    name_ro: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None

    _phone = field_validator("phone")(lambda cls, v: _validate_phone(v))


# ── Цены ─────────────────────────────────────────────────────────────────────
class ServicePriceOut(BaseModel):
    id: int
    service_id: int
    clinic_id: int
    currency: str
    price: Optional[float]
    price_cmn: Optional[float]
    price_online: Optional[float]
    price_special: Optional[float]
    valid_from: UtcDatetime
    valid_to: Optional[UtcDatetime]
    model_config = {"from_attributes": True}


class ServicePriceCreate(BaseModel):
    clinic_id: int
    currency: str = "MDL"
    price: Optional[float] = None
    price_cmn: Optional[float] = None
    price_online: Optional[float] = None
    price_special: Optional[float] = None


# ── Услуги ────────────────────────────────────────────────────────────────────
class ServiceOut(BaseModel):
    id: int
    code: str
    name_ru: str
    name_ro: Optional[str]
    group_id: Optional[int]
    subgroup_id: Optional[int]
    executor_id: Optional[int]
    location_id: Optional[int]
    duration_min: Optional[int]
    sold_separately: bool
    additional_service_id: Optional[int]
    is_surgery_addon: bool
    note: Optional[str]
    status: str
    created_at: UtcDatetime
    price: Optional[float] = None
    model_config = {"from_attributes": True}


class ServiceCreate(BaseModel):
    code: str
    name_ru: str
    name_ro: Optional[str] = None
    group_id: Optional[int] = None
    subgroup_id: Optional[int] = None
    executor_id: Optional[int] = None
    location_id: Optional[int] = None
    duration_min: Optional[int] = None
    sold_separately: bool = True
    additional_service_id: Optional[int] = None
    is_surgery_addon: bool = False
    note: Optional[str] = None

    @field_validator("code")
    @classmethod
    def _check_code(cls, v: str) -> str:
        if not _CODE_RE.match(v):
            raise ValueError("Код должен иметь формат G-001-CON-001")
        return v

    @field_validator("name_ru")
    @classmethod
    def _check_ru(cls, v: str) -> str:
        if _LAT.search(v) and not _CYR.search(v):
            raise ValueError("Название (RU) должно быть на русском языке")
        return v

    @field_validator("name_ro")
    @classmethod
    def _check_ro(cls, v: Optional[str]) -> Optional[str]:
        if v and _CYR.search(v):
            raise ValueError("Название (RO) должно быть на латинице")
        return v


class ServiceUpdate(BaseModel):
    name_ru: Optional[str] = None
    name_ro: Optional[str] = None
    group_id: Optional[int] = None
    subgroup_id: Optional[int] = None
    executor_id: Optional[int] = None
    location_id: Optional[int] = None
    duration_min: Optional[int] = None
    sold_separately: Optional[bool] = None
    additional_service_id: Optional[int] = None
    is_surgery_addon: Optional[bool] = None
    note: Optional[str] = None
    status: Optional[str] = None


# ── Пакеты ────────────────────────────────────────────────────────────────────
class PackageItemOut(BaseModel):
    id: int
    service_id: int
    inclusion_type: str
    model_config = {"from_attributes": True}


class PackageItemCreate(BaseModel):
    service_id: int
    inclusion_type: str = "required"


class PackagePriceOut(BaseModel):
    id: int
    clinic_id: int
    currency: str
    price_fixed: Optional[float]
    model_config = {"from_attributes": True}


class PackagePriceCreate(BaseModel):
    clinic_id: int
    currency: str = "MDL"
    price_fixed: Optional[float] = None


class PackageOut(BaseModel):
    id: int
    code: str
    name_ru: str
    name_ro: Optional[str]
    group_id: Optional[int]
    subgroup_id: Optional[int]
    status: str
    created_at: UtcDatetime
    items: list[PackageItemOut] = []
    prices: list[PackagePriceOut] = []
    price: Optional[float] = None
    model_config = {"from_attributes": True}


class PackageCreate(BaseModel):
    code: str
    name_ru: str
    name_ro: Optional[str] = None
    group_id: Optional[int] = None
    subgroup_id: Optional[int] = None
    items: list[PackageItemCreate] = []


class PackageUpdate(BaseModel):
    name_ru: Optional[str] = None
    name_ro: Optional[str] = None
    status: Optional[str] = None


# ── Заявки на изменение ───────────────────────────────────────────────────────
class ChangeRequestItemOut(BaseModel):
    id: int
    entity_type: str
    entity_id: Optional[int]
    field_name: str
    old_value: Optional[Any]
    new_value: Optional[Any]
    r2_override_value: Optional[Any]
    model_config = {"from_attributes": True}


class RequestCommentOut(BaseModel):
    id: int
    author_id: int
    author_name: Optional[str] = None
    text: str
    created_at: UtcDatetime
    model_config = {"from_attributes": True}


class RequestHistoryOut(BaseModel):
    id: int
    from_status: Optional[str]
    to_status: str
    actor_id: int
    actor_name: Optional[str] = None
    note: Optional[str]
    created_at: UtcDatetime
    model_config = {"from_attributes": True}


class ParticipantOut(BaseModel):
    id: int
    name: str
    role: str


class ChangeRequestOut(BaseModel):
    id: int
    title: str
    status: str
    author_id: int
    author_name: Optional[str] = None
    author_role: Optional[str] = None
    participants: list[ParticipantOut] = []
    note: Optional[str]
    created_at: UtcDatetime
    updated_at: UtcDatetime
    items: list[ChangeRequestItemOut] = []
    comments: list[RequestCommentOut] = []
    history: list[RequestHistoryOut] = []
    model_config = {"from_attributes": True}


_ALLOWED_ITEM_TYPES = frozenset({
    "service", "package", "group", "subgroup", "executor", "location", "clinic",
    "service_create", "package_create", "group_create", "subgroup_create",
    "executor_create", "location_create", "clinic_create",
    "package_item_add", "package_item_remove", "package_price", "service_price",
})


class ChangeRequestItemIn(BaseModel):
    entity_type: str
    entity_id: Optional[int] = None
    field_name: str = ""
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    r2_override_value: Optional[Any] = None

    @field_validator("entity_type")
    @classmethod
    def _check_type(cls, v: str) -> str:
        if v not in _ALLOWED_ITEM_TYPES:
            raise ValueError(f"Недопустимый тип изменения: {v}")
        return v


class ChangeRequestCreate(BaseModel):
    title: str
    note: Optional[str] = None
    items: list[ChangeRequestItemIn] = []


class ChangeRequestUpdate(BaseModel):
    title: Optional[str] = None
    note: Optional[str] = None
    items: Optional[list[ChangeRequestItemIn]] = None


class RequestApproveInput(BaseModel):
    note: Optional[str] = None
    r2_overrides: Optional[dict[int, Any]] = None  # item_id → override_value


class RequestRejectInput(BaseModel):
    note: Optional[str] = None
    send_to: Optional[str] = None  # "r2" | "r3" (для R1)
    final: bool = False  # R1 на pending_ceo: финальное отклонение → rejected


class CommentCreate(BaseModel):
    text: str


# ── История / Аудит ───────────────────────────────────────────────────────────
class EntityHistoryOut(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    field_name: str
    old_value: Optional[Any]
    new_value: Optional[Any]
    changed_by: int
    changed_by_name: Optional[str] = None
    changed_at: UtcDatetime
    model_config = {"from_attributes": True}


class AuditLogOut(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str] = None
    action: str
    entity_type: Optional[str]
    entity_id: Optional[int]
    ip: Optional[str]
    created_at: UtcDatetime
    model_config = {"from_attributes": True}


class PendingCount(BaseModel):
    count: int
