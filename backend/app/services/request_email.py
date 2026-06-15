"""HTML-письмо «заявка пришла на согласование» (Ф5): параметры, автор, ссылка."""
from html import escape

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.models import (
    ChangeRequest, Clinic, Executor, Location, ServiceGroup, ServiceSubgroup,
)

_FIELD_LABELS = {
    "name_ru": "Название (RU)", "name_ro": "Название (RO)", "duration_min": "Длительность",
    "note": "Примечание", "group_id": "Группа", "subgroup_id": "Подгруппа",
    "executor_id": "Исполнитель", "location_id": "Место", "clinic_id": "Клиника",
    "status": "Статус", "price": "Цена", "price_online": "Цена онлайн",
    "price_cmn": "Цена CNAM", "price_special": "Спец. цена", "price_fixed": "Фикс. цена",
    "currency": "Валюта",
}
_ENTITY_LABELS = {
    "service": "Услуга", "service_create": "Новая услуга", "service_price": "Цена услуги",
    "package": "Пакет", "package_create": "Новый пакет", "package_price": "Цена пакета",
    "package_item_add": "Услуга в пакет", "package_item_remove": "Удаление из пакета",
    "group": "Группа", "subgroup": "Подгруппа", "executor": "Исполнитель",
    "location": "Место", "clinic": "Клиника",
}
_STATUS_NAMES = {
    "draft": "Черновик", "pending_cfd": "У финдиректора", "pending_ceo": "У гендиректора",
    "approved": "Утверждена", "rejected": "Отклонена", "revision": "На доработке",
    "cancelled": "Отменена",
    "active": "Активна", "inactive": "Не активна", "pending": "Ожидает",
}
_FK_MODELS = {
    "group_id": ServiceGroup, "subgroup_id": ServiceSubgroup, "executor_id": Executor,
    "location_id": Location, "clinic_id": Clinic,
}


async def _name_maps(db: AsyncSession) -> dict[str, dict[int, str]]:
    maps: dict[str, dict[int, str]] = {}
    for field, model in _FK_MODELS.items():
        res = await db.execute(select(model.id, model.name_ru))
        maps[field] = {rid: name for rid, name in res.all()}
    return maps


def _scalar(raw):
    return raw["v"] if isinstance(raw, dict) and "v" in raw else raw


def _fmt(field: str, raw, maps) -> str:
    v = _scalar(raw)
    if v is None or v == "":
        return "—"
    if isinstance(v, dict):  # ценовой payload
        parts = []
        if cid := v.get("clinic_id"):
            cn = maps.get("clinic_id", {}).get(int(cid), f"#{cid}")
            parts.append(f"Клиника: {cn}")
        parts.extend(
            f"{_FIELD_LABELS.get(k, k)}: {vv}" for k, vv in v.items()
            if k not in ("service_id", "clinic_id", "package_id", "currency") and vv not in (None, "")
        )
        return ", ".join(parts) or "—"
    if field in _FK_MODELS:
        key = int(v) if str(v).isdigit() else v
        return maps.get(field, {}).get(key, str(v))
    if field == "status":
        k = str(v).split(".")[-1]
        return _STATUS_NAMES.get(k, k)
    return str(v)


def _new_value(item):
    return item.r2_override_value if item.r2_override_value is not None else item.new_value


async def render_approval_email(db: AsyncSession, req: ChangeRequest) -> tuple[str, str, str]:
    maps = await _name_maps(db)
    rows_html, rows_text = [], []
    for it in req.items:
        ent = _ENTITY_LABELS.get(it.entity_type, it.entity_type)
        field = _FIELD_LABELS.get(it.field_name, it.field_name) if it.field_name else "—"
        old = _fmt(it.field_name, it.old_value, maps)
        new = _fmt(it.field_name, _new_value(it), maps)
        rows_text.append(f"  • {ent} · {field}: {old} → {new}")
        rows_html.append(
            f'<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">{escape(ent)}</td>'
            f'<td style="padding:6px 10px;border-bottom:1px solid #eee">{escape(field)}</td>'
            f'<td style="padding:6px 10px;border-bottom:1px solid #eee;color:#6b7280">{escape(old)}</td>'
            f'<td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600">{escape(new)}</td></tr>'
        )
    if not rows_html:
        rows_html.append('<tr><td colspan="4" style="padding:6px 10px;color:#6b7280">Без изменений данных</td></tr>')
        rows_text.append("  • Без изменений данных")

    author = req.author_name or f"#{req.author_id}"
    url = f"{settings.app_base_url.rstrip('/')}/requests/{req.id}"
    subject = f"Заявка №{req.id} на согласование: {req.title}"
    note_html = f'<p style="color:#374151">Примечание: {escape(req.note)}</p>' if req.note else ""

    html = f"""<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:640px;margin:0 auto;padding:8px">
  <h2 style="color:#1f6feb;margin:0 0 4px">Заявка №{req.id} на согласование</h2>
  <p style="font-size:16px;margin:0 0 2px"><b>{escape(req.title)}</b></p>
  <p style="color:#6b7280;margin:0 0 12px">Автор: {escape(author)}</p>
  {note_html}
  <table style="border-collapse:collapse;width:100%;font-size:14px;margin-top:8px">
    <thead><tr style="background:#f3f6fb;text-align:left">
      <th style="padding:6px 10px">Сущность</th><th style="padding:6px 10px">Параметр</th>
      <th style="padding:6px 10px">Было</th><th style="padding:6px 10px">Станет</th>
    </tr></thead>
    <tbody>{''.join(rows_html)}</tbody>
  </table>
  <p style="margin:24px 0 8px">
    <a href="{url}" style="background:#1f6feb;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">Открыть заявку</a>
  </p>
  <p style="color:#9ca3af;font-size:12px;margin:0">{url}</p>
</div>"""

    text = (f"Заявка №{req.id} на согласование: {req.title}\n"
            f"Автор: {author}\n"
            + (f"Примечание: {req.note}\n" if req.note else "")
            + "Изменения:\n" + "\n".join(rows_text)
            + f"\n\nОткрыть заявку: {url}")
    return subject, text, html
