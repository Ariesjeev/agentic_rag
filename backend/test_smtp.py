"""
Standalone SMTP check. Run from the backend/ folder:

    python test_smtp.py you@example.com

Sends one test email using the SMTP_* values from backend/.env and prints the
exact error if Gmail (or any server) rejects the login.
"""

import smtplib
import ssl
import sys
from email.message import EmailMessage

from dotenv import load_dotenv

load_dotenv()

import os  # noqa: E402

host = os.getenv("SMTP_HOST", "").strip()
port = int(os.getenv("SMTP_PORT", "587"))
user = os.getenv("SMTP_USER", "").strip()
password = os.getenv("SMTP_PASS", "").strip()
sender = (os.getenv("SMTP_FROM_EMAIL") or os.getenv("SMTP_FROM", "")).strip()

if host.lower() == "smtp.gmail.com":
    password = password.replace(" ", "")

missing = [n for n, v in [("SMTP_HOST", host), ("SMTP_USER", user),
                          ("SMTP_PASS", password), ("SMTP_FROM_EMAIL", sender)] if not v]
if missing:
    sys.exit(f"Missing in backend/.env: {', '.join(missing)}")

to = sys.argv[1] if len(sys.argv) > 1 else user

msg = EmailMessage()
msg["From"] = sender
msg["To"] = to
msg["Subject"] = "Nexmind SMTP test"
msg.set_content("If you can read this, your SMTP settings work.")

context = ssl.create_default_context()
try:
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=20, context=context) as s:
            s.login(user, password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls(context=context)
            s.login(user, password)
            s.send_message(msg)
    print(f"OK: test email sent to {to}")
except smtplib.SMTPAuthenticationError as e:
    sys.exit(f"LOGIN REJECTED ({e.smtp_code}). Use a Gmail App Password (not your normal password), "
             f"with 2-Step Verification enabled.\n{e.smtp_error!r}")
except Exception as e:
    sys.exit(f"FAILED: {type(e).__name__}: {e}")