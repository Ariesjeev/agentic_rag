"""
Transactional email for invitations and password resets.

Behaviour
---------
* APP_ENV=production : emails are sent through SMTP. If SMTP is not fully
  configured, sending fails closed (nothing is logged, an error is raised).
* APP_ENV!=production (local development):
    - SMTP_SEND_IN_DEV=true and SMTP fully configured -> the email is really
      sent through SMTP. If sending fails, the error is logged and the message
      is printed in the backend console instead, so development is never blocked.
    - otherwise -> the email is only printed in the backend console.
"""

import os
import smtplib
import ssl
from email.message import EmailMessage

from app.config import APP_ENV, FRONTEND_URL, logger

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASS = os.getenv("SMTP_PASS", "").strip()

# Gmail displays app passwords in groups separated by spaces; the spaces are
# not part of the password.
if SMTP_HOST.lower() == "smtp.gmail.com":
    SMTP_PASS = SMTP_PASS.replace(" ", "")

# Support the existing SMTP_FROM_EMAIL setting as well.
SMTP_FROM = (os.getenv("SMTP_FROM_EMAIL") or os.getenv("SMTP_FROM", "")).strip()

# Opt-in: really send emails while running locally (APP_ENV != production).
SMTP_SEND_IN_DEV = os.getenv("SMTP_SEND_IN_DEV", "").strip().lower() in {
    "1", "true", "yes", "on",
}


def _smtp_ready() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASS and SMTP_FROM)


def _deliver(to: str, subject: str, body: str) -> None:
    """Send one message through the configured SMTP server."""
    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    context = ssl.create_default_context()

    if SMTP_PORT == 465:
        # Implicit TLS
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20, context=context) as smtp:
            smtp.login(SMTP_USER, SMTP_PASS)
            smtp.send_message(msg)
        return

    # STARTTLS (port 587)
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
        smtp.starttls(context=context)
        smtp.login(SMTP_USER, SMTP_PASS)
        smtp.send_message(msg)


def _send(to: str, subject: str, body: str) -> None:
    if APP_ENV != "production":
        if SMTP_SEND_IN_DEV and _smtp_ready():
            try:
                _deliver(to, subject, body)
                logger.info("Email sent to %s via SMTP (development mode).", to)
                return
            except Exception:
                logger.exception(
                    "SMTP send failed in development; printing the email to the console instead."
                )
        # Development-only: invitation/reset URLs contain one-time secrets.
        logger.info(
            "=== EMAIL (dev only) ===\nTo: %s\nSubject: %s\n\n%s\n===================",
            to,
            subject,
            body,
        )
        return

    # Fail closed in production. Never log message bodies containing reset or
    # invitation tokens just because SMTP was accidentally left unconfigured.
    if not _smtp_ready():
        logger.error("Production SMTP is not fully configured; email not sent.")
        raise RuntimeError("Email delivery is not configured.")
    if not FRONTEND_URL.startswith("https://"):
        logger.error("Production FRONTEND_URL is not an HTTPS URL; email not sent.")
        raise RuntimeError("Production frontend URL is not configured securely.")

    _deliver(to, subject, body)


def send_invite_email(
    to: str,
    username: str,
    org_name: str,
    token: str,
) -> None:
    link = f"{FRONTEND_URL}/accept-invite#token={token}"

    _send(
        to=to,
        subject=f"You've been invited to {org_name} on Nexmind",
        body=(
            f"Hi {username},\n\n"
            f"You've been invited to join {org_name} on Nexmind.\n"
            f"Click the link below to set your password. "
            f"It expires in 7 days.\n\n"
            f"{link}\n\n"
            f"If you didn't expect this, ignore this email."
        ),
    )


def send_reset_email(to: str, username: str, token: str) -> None:
    link = f"{FRONTEND_URL}/reset-password#token={token}"

    _send(
        to=to,
        subject="Reset your Nexmind password",
        body=(
            f"Hi {username},\n\n"
            "Someone asked to reset your Nexmind password. "
            "If it was you, click below.\n"
            "The link expires in 1 hour.\n\n"
            f"{link}\n\n"
            "If this wasn't you, you can safely ignore this email."
        ),
    )


def send_password_changed_email(to: str, username: str) -> None:
    _send(
        to=to,
        subject="Your Nexmind password was changed",
        body=(
            f"Hi {username},\n\n"
            "Your password was just changed. If this wasn't you, "
            "reset it immediately and contact your admin.\n"
        ),
    )