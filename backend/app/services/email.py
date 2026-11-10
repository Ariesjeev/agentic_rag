"""
Transactional email for invitations and password resets.

Delivery methods (first one that is configured is used)
-------------------------------------------------------
1. Brevo HTTPS API  : set BREVO_API_KEY (+ SMTP_FROM_EMAIL or EMAIL_FROM)
2. Resend HTTPS API : set RESEND_API_KEY (+ SMTP_FROM_EMAIL or EMAIL_FROM)
3. SMTP             : set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL

The two HTTPS APIs use port 443, so they work on hosts that block outbound SMTP
ports (for example Render free web services). Plain SMTP does not.

Behaviour
---------
* APP_ENV=production : the email is sent. If no method is configured, sending
  fails closed (nothing is logged, an error is raised).
* APP_ENV!=production (local development):
    - SMTP_SEND_IN_DEV=true and a method configured -> the email is really sent.
      If sending fails, the error is logged and the message is printed in the
      backend console instead, so development is never blocked.
    - otherwise -> the email is only printed in the backend console.
"""

import json
import os
import smtplib
import ssl
import urllib.error
import urllib.request
from email.message import EmailMessage
from email.utils import parseaddr

from app.config import APP_ENV, FRONTEND_URL, logger

# ---- SMTP settings --------------------------------------------------------
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASS = os.getenv("SMTP_PASS", "").strip()

# Gmail displays app passwords in groups separated by spaces; the spaces are
# not part of the password.
if SMTP_HOST.lower() == "smtp.gmail.com":
    SMTP_PASS = SMTP_PASS.replace(" ", "")

# ---- Sender address (used by every method) --------------------------------
# Example: Snap Class <you@example.com>
SMTP_FROM = (
    os.getenv("EMAIL_FROM")
    or os.getenv("SMTP_FROM_EMAIL")
    or os.getenv("SMTP_FROM", "")
).strip()

# ---- HTTPS email APIs -----------------------------------------------------
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "").strip()
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()

# Opt-in: really send emails while running locally (APP_ENV != production).
SMTP_SEND_IN_DEV = os.getenv("SMTP_SEND_IN_DEV", "").strip().lower() in {
    "1", "true", "yes", "on",
}


def _smtp_ready() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASS and SMTP_FROM)


def _provider() -> str | None:
    """Return the delivery method that is configured, or None."""
    if BREVO_API_KEY and SMTP_FROM:
        return "brevo"
    if RESEND_API_KEY and SMTP_FROM:
        return "resend"
    if _smtp_ready():
        return "smtp"
    return None


def _post_json(url: str, payload: dict, headers: dict) -> None:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            # Some providers reject Python's default user agent.
            "User-Agent": "nexmind/1.0",
            **headers,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"Email API error {exc.code}: {detail}") from None


def _deliver_brevo(to: str, subject: str, body: str) -> None:
    name, address = parseaddr(SMTP_FROM)
    _post_json(
        "https://api.brevo.com/v3/smtp/email",
        {
            "sender": {"name": name or "Nexmind", "email": address},
            "to": [{"email": to}],
            "subject": subject,
            "textContent": body,
        },
        {"api-key": BREVO_API_KEY},
    )


def _deliver_resend(to: str, subject: str, body: str) -> None:
    _post_json(
        "https://api.resend.com/emails",
        {
            "from": SMTP_FROM,
            "to": [to],
            "subject": subject,
            "text": body,
        },
        {"Authorization": f"Bearer {RESEND_API_KEY}"},
    )


def _deliver_smtp(to: str, subject: str, body: str) -> None:
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


def _deliver(to: str, subject: str, body: str) -> str:
    """Send one message with the configured method and return its name."""
    provider = _provider()
    if provider == "brevo":
        _deliver_brevo(to, subject, body)
    elif provider == "resend":
        _deliver_resend(to, subject, body)
    elif provider == "smtp":
        _deliver_smtp(to, subject, body)
    else:
        raise RuntimeError("Email delivery is not configured.")
    return provider


def _send(to: str, subject: str, body: str) -> None:
    if APP_ENV != "production":
        if SMTP_SEND_IN_DEV and _provider():
            try:
                method = _deliver(to, subject, body)
                logger.info("Email sent to %s via %s (development mode).", to, method)
                return
            except Exception:
                logger.exception(
                    "Email send failed in development; printing the email to the console instead."
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
    # invitation tokens just because email was accidentally left unconfigured.
    if not _provider():
        logger.error("Production email delivery is not configured; email not sent.")
        raise RuntimeError("Email delivery is not configured.")
    if not FRONTEND_URL.startswith("https://"):
        logger.error("Production FRONTEND_URL is not an HTTPS URL; email not sent.")
        raise RuntimeError("Production frontend URL is not configured securely.")

    method = _deliver(to, subject, body)
    logger.info("Email sent to %s via %s.", to, method)


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