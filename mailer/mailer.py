"""Отдельный контейнер отправки почты (Н8).

Принимает POST /send {to, subject, body} и отправляет письмо через TLS-SMTP.
В локальной среде внешний SMTP может быть недоступен — ошибка логируется,
но не роняет вызывающий сервис (отправка идёт фоном со стороны backend).
"""
import os
import smtplib
import ssl
from email.message import EmailMessage

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Mikofai Mailer")

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "1127"))
SMTP_LOGIN = os.getenv("SMTP_LOGIN", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
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
        # Провайдер (selcloud) использует самоподписанный сертификат на порту 1127
        ctx = ssl._create_unverified_context()  # noqa: SLF001
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=15) as s:
            s.login(SMTP_LOGIN, SMTP_PASSWORD)
            s.send_message(msg)
        return {"sent": True}
    except Exception as e:  # noqa: BLE001 — деградируем мягко в локальной среде
        return {"sent": False, "error": str(e)}
