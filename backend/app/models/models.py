import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, Integer, Boolean, DateTime, ForeignKey, Text,
    Enum, Numeric, Table, Column, UniqueConstraint, func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.db import Base


# ── M2M: группа ↔ подгруппа ──────────────────────────────────────────────────
service_group_subgroup = Table(
    "service_group_subgroup", Base.metadata,
    Column("group_id", Integer, ForeignKey("service_groups.id"), primary_key=True),
    Column("subgroup_id", Integer, ForeignKey("service_subgroups.id"), primary_key=True),
)


# Статус справочников C2-C5 (зам.9): архивация хранится строкой для простой миграции
DIR_ACTIVE = "active"
DIR_ARCHIVED = "archived"


class ServiceGroup(Base):
    __tablename__ = "service_groups"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    name_ru: Mapped[str] = mapped_column(String(200))
    name_ro: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default=DIR_ACTIVE, server_default=DIR_ACTIVE)
    subgroups: Mapped[list["ServiceSubgroup"]] = relationship(
        secondary=service_group_subgroup, back_populates="groups"
    )


class ServiceSubgroup(Base):
    __tablename__ = "service_subgroups"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name_ru: Mapped[str] = mapped_column(String(200))
    name_ro: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default=DIR_ACTIVE, server_default=DIR_ACTIVE)
    groups: Mapped[list["ServiceGroup"]] = relationship(
        secondary=service_group_subgroup, back_populates="subgroups"
    )


class Executor(Base):
    __tablename__ = "executors"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    name_ru: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default=DIR_ACTIVE, server_default=DIR_ACTIVE)


class Location(Base):
    __tablename__ = "locations"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    name_ru: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default=DIR_ACTIVE, server_default=DIR_ACTIVE)


class ClinicStatus(str, enum.Enum):
    active = "active"
    closed = "closed"


class Clinic(Base):
    __tablename__ = "clinics"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name_ru: Mapped[str] = mapped_column(String(200))
    name_ro: Mapped[str] = mapped_column(String(200))
    address: Mapped[Optional[str]] = mapped_column(String(500))
    phone: Mapped[Optional[str]] = mapped_column(String(100))
    status: Mapped[ClinicStatus] = mapped_column(
        Enum(ClinicStatus), default=ClinicStatus.active
    )


class ServiceStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    pending = "pending"


class Service(Base):
    __tablename__ = "services"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name_ru: Mapped[str] = mapped_column(String(500))
    name_ro: Mapped[Optional[str]] = mapped_column(String(500))
    group_id: Mapped[Optional[int]] = mapped_column(ForeignKey("service_groups.id"))
    subgroup_id: Mapped[Optional[int]] = mapped_column(ForeignKey("service_subgroups.id"))
    executor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("executors.id"))
    location_id: Mapped[Optional[int]] = mapped_column(ForeignKey("locations.id"))
    duration_min: Mapped[Optional[int]] = mapped_column(Integer)
    sold_separately: Mapped[bool] = mapped_column(Boolean, default=True)
    additional_service_id: Mapped[Optional[int]] = mapped_column(ForeignKey("services.id"))
    is_surgery_addon: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[ServiceStatus] = mapped_column(
        Enum(ServiceStatus), default=ServiceStatus.active
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))

    group: Mapped[Optional["ServiceGroup"]] = relationship()
    subgroup: Mapped[Optional["ServiceSubgroup"]] = relationship()
    executor: Mapped[Optional["Executor"]] = relationship()
    location: Mapped[Optional["Location"]] = relationship()
    prices: Mapped[list["ServicePrice"]] = relationship(back_populates="service")


class ServicePrice(Base):
    __tablename__ = "service_prices"
    id: Mapped[int] = mapped_column(primary_key=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"), nullable=False)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinics.id"), nullable=False)
    currency: Mapped[str] = mapped_column(String(5), default="MDL")
    price: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    price_cmn: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    price_online: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    price_special: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    valid_from: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    valid_to: Mapped[Optional[datetime]] = mapped_column(DateTime)

    service: Mapped["Service"] = relationship(back_populates="prices")
    clinic: Mapped["Clinic"] = relationship()

    __table_args__ = (
        UniqueConstraint("service_id", "clinic_id", "valid_from"),
    )


class PackageStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"


class Package(Base):
    __tablename__ = "packages"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name_ru: Mapped[str] = mapped_column(String(500))
    name_ro: Mapped[Optional[str]] = mapped_column(String(500))
    group_id: Mapped[Optional[int]] = mapped_column(ForeignKey("service_groups.id"))
    subgroup_id: Mapped[Optional[int]] = mapped_column(ForeignKey("service_subgroups.id"))
    status: Mapped[PackageStatus] = mapped_column(
        Enum(PackageStatus), default=PackageStatus.active
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))

    group: Mapped[Optional["ServiceGroup"]] = relationship()
    subgroup: Mapped[Optional["ServiceSubgroup"]] = relationship()
    items: Mapped[list["PackageItem"]] = relationship(back_populates="package", lazy="selectin")
    prices: Mapped[list["PackagePrice"]] = relationship(back_populates="package", lazy="selectin")


class InclusionType(str, enum.Enum):
    required = "required"
    by_prescription = "by_prescription"


class PackageItem(Base):
    __tablename__ = "package_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    package_id: Mapped[int] = mapped_column(ForeignKey("packages.id"), nullable=False)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"), nullable=False)
    inclusion_type: Mapped[InclusionType] = mapped_column(
        Enum(InclusionType), default=InclusionType.required
    )

    package: Mapped["Package"] = relationship(back_populates="items")
    service: Mapped["Service"] = relationship()


class PackagePrice(Base):
    __tablename__ = "package_prices"
    id: Mapped[int] = mapped_column(primary_key=True)
    package_id: Mapped[int] = mapped_column(ForeignKey("packages.id"), nullable=False)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinics.id"), nullable=False)
    currency: Mapped[str] = mapped_column(String(5), default="MDL")
    price_fixed: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))

    package: Mapped["Package"] = relationship(back_populates="prices")
    clinic: Mapped["Clinic"] = relationship()

    __table_args__ = (
        UniqueConstraint("package_id", "clinic_id"),
    )


class UserRole(str, enum.Enum):
    r1 = "r1"
    r2 = "r2"
    r3 = "r3"
    r4 = "r4"


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(200))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(255), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class RequestStatus(str, enum.Enum):
    draft = "draft"
    pending_cfd = "pending_cfd"
    pending_ceo = "pending_ceo"
    approved = "approved"
    rejected = "rejected"
    revision = "revision"
    cancelled = "cancelled"


class ChangeRequest(Base):
    __tablename__ = "change_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(500))
    status: Mapped[RequestStatus] = mapped_column(
        Enum(RequestStatus), default=RequestStatus.draft
    )
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    author: Mapped["User"] = relationship(lazy="selectin")
    items: Mapped[list["ChangeRequestItem"]] = relationship(back_populates="request", lazy="selectin")
    comments: Mapped[list["RequestComment"]] = relationship(back_populates="request", lazy="selectin")
    history: Mapped[list["RequestHistory"]] = relationship(back_populates="request", lazy="selectin")

    @property
    def author_name(self) -> Optional[str]:
        return self.author.name if self.author else None

    @property
    def author_role(self) -> Optional[str]:
        return self.author.role.value if self.author else None

    @property
    def participants(self) -> list[dict]:
        seen: dict[int, dict] = {}

        def add(u):
            if u and u.id not in seen:
                seen[u.id] = {"id": u.id, "name": u.name, "role": u.role.value}

        add(self.author)
        for h in self.history:
            add(h.actor)
        for c in self.comments:
            add(c.author)
        return list(seen.values())


class ChangeRequestItem(Base):
    __tablename__ = "change_request_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("change_requests.id"), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50))  # service/package/service_price
    entity_id: Mapped[Optional[int]] = mapped_column(Integer)
    field_name: Mapped[str] = mapped_column(String(100))
    old_value: Mapped[Optional[dict]] = mapped_column(JSONB)
    new_value: Mapped[Optional[dict]] = mapped_column(JSONB)
    r2_override_value: Mapped[Optional[dict]] = mapped_column(JSONB)

    request: Mapped["ChangeRequest"] = relationship(back_populates="items")


class RequestComment(Base):
    __tablename__ = "request_comments"
    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("change_requests.id"), nullable=False)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    request: Mapped["ChangeRequest"] = relationship(back_populates="comments")
    author: Mapped["User"] = relationship(lazy="selectin")

    @property
    def author_name(self) -> Optional[str]:
        return self.author.name if self.author else None


class RequestHistory(Base):
    __tablename__ = "request_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("change_requests.id"), nullable=False)
    from_status: Mapped[Optional[str]] = mapped_column(String(30))
    to_status: Mapped[str] = mapped_column(String(30))
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    request: Mapped["ChangeRequest"] = relationship(back_populates="history")
    actor: Mapped["User"] = relationship(lazy="selectin")

    @property
    def actor_name(self) -> Optional[str]:
        return self.actor.name if self.actor else None


class EntityHistory(Base):
    __tablename__ = "entity_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[int] = mapped_column(Integer)
    field_name: Mapped[str] = mapped_column(String(100))
    old_value: Mapped[Optional[dict]] = mapped_column(JSONB)
    new_value: Mapped[Optional[dict]] = mapped_column(JSONB)
    changed_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    changed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    changed_by_user: Mapped["User"] = relationship(lazy="selectin")

    @property
    def changed_by_name(self) -> Optional[str]:
        return self.changed_by_user.name if self.changed_by_user else None


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100))
    entity_type: Mapped[Optional[str]] = mapped_column(String(50))
    entity_id: Mapped[Optional[int]] = mapped_column(Integer)
    ip: Mapped[Optional[str]] = mapped_column(String(50))
    user_agent: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped["User"] = relationship(lazy="selectin")

    @property
    def user_name(self) -> Optional[str]:
        return self.user.name if self.user else None
