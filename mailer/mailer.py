"""Отдельный контейнер отправки почты (Н8).

Принимает POST /send {to, subject, body} и отправляет письмо через TLS-SMTP.
В локальной среде внешний SMTP может быть недоступен — ошибка логируется,
но не роняет вызывающий сервис (отправка идёт фоном со стороны backend).
"""
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

from fastapi import FastAPI
from pydantic import BaseModel

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Mikofai Mailer")

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "1127"))
SMTP_LOGIN = os.getenv("SMTP_LOGIN", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_CA_FILE = os.getenv("SMTP_CA_FILE", "") or None
FROM_ADDR = os.getenv("MAIL_FROM", "noreply@mikofai.ru")


class Mail(BaseModel):
    to: list[str]
    subject: str
    body: str
    html: str | None = None


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/send")
def send(mail: Mail):
    msg = EmailMessage()
    msg["From"] = FROM_ADDR
    msg["To"] = ", ".join(mail.to)
    msg["Subject"] = mail.subject
    msg.set_content(mail.body)
    if mail.html:
        msg.add_alternative(mail.html, subtype="html")
    try:
        # Проверяем цепочку TLS провайдера (валидный Let's Encrypt). При нестандартном
        # CA провайдера путь можно передать через SMTP_CA_FILE (S3).
        ctx = ssl.create_default_context(cafile=SMTP_CA_FILE)
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=15) as s:
            s.login(SMTP_LOGIN, SMTP_PASSWORD)
            s.send_message(msg)
        logger.info("sent to %s: %s", mail.to, mail.subject)
        return {"sent": True}
    except Exception as e:  # noqa: BLE001 — деградируем мягко в локальной среде
        logger.error("SMTP failed to %s: %s", mail.to, e)
        return {"sent": False, "error": str(e)}
