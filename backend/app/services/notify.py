"""Отправка уведомлений через отдельный mailer-контейнер (Ф5, Ф31, H5)."""
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_mail(to: list[str], subject: str, body: str, html: str | None = None) -> None:
    seen: set[str] = set()
    for addr in to:
        if not addr or addr in seen:
            continue
        seen.add(addr)
        payload: dict = {"to": [addr], "subject": subject, "body": body}
        if html:
            payload["html"] = html
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(f"{settings.mailer_url}/send", json=payload)
                data = r.json() if "json" in r.headers.get("content-type", "") else {}
                if r.status_code != 200 or not data.get("sent"):
                    logger.warning("mail not sent to %s: %s", addr, data.get("error", r.text))
        except Exception as e:  # noqa: BLE001
            logger.warning("mailer error for %s: %s", addr, e)
