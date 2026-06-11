"""Отправка уведомлений через отдельный mailer-контейнер (Ф5, Ф31, H5)."""
import httpx

from app.core.config import settings


async def send_mail(to: list[str], subject: str, body: str, html: str | None = None) -> None:
    if not to:
        return
    payload = {"to": to, "subject": subject, "body": body}
    if html:
        payload["html"] = html
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(f"{settings.mailer_url}/send", json=payload)
    except Exception:  # noqa: BLE001 — уведомления не должны ронять бизнес-операцию
        pass
