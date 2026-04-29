"""
Servizio email — Endyo.
Priorità provider:
  1. Resend API  (RESEND_API_KEY configurata)  → consigliato, 3.000 email/mese gratis
  2. SMTP generico (SMTP_HOST configurato)      → Gmail, Aruba, Brevo, ecc.
  3. Dev mode    (nessuna config)               → stampa link in console

Variabili .env necessarie per Resend:
  RESEND_API_KEY=re_xxxx
  EMAIL_FROM=noreply@endyo.it

Variabili .env per SMTP:
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=tua@gmail.com
  SMTP_PASSWORD=app_password
  EMAIL_FROM=noreply@endyo.it
"""
import os
import logging

logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
SMTP_HOST      = os.getenv("SMTP_HOST", "")
SMTP_PORT      = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER      = os.getenv("SMTP_USER", "")
SMTP_PASSWORD  = os.getenv("SMTP_PASSWORD", "")
EMAIL_FROM     = os.getenv("EMAIL_FROM", os.getenv("SMTP_FROM", "noreply@endyo.it"))
APP_URL        = os.getenv("APP_URL", "http://localhost:5173")
BACKEND_URL    = os.getenv("BACKEND_URL", "http://localhost:8000")

DEV_MODE = not RESEND_API_KEY and not SMTP_HOST


# ── HTML template ──────────────────────────────────────────────────────────────
def _base_template(content: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:32px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:480px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#8b5cf6,#6d28d9);padding:28px 32px;text-align:center">
      <h1 style="margin:0;color:white;font-size:24px;font-weight:900;letter-spacing:-0.04em">
        endyo
      </h1>
    </div>
    <div style="padding:32px">
      {content}
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
      <p style="margin:0;color:#9ca3af;font-size:11px">
        © 2025 Endyo · endyo.it · I tuoi dati sono al sicuro
      </p>
    </div>
  </div>
</body>
</html>"""


def _btn(url: str, label: str) -> str:
    return (
        f'<a href="{url}" style="display:inline-block;margin:20px 0;padding:13px 32px;'
        f'background:#8b5cf6;color:white;border-radius:8px;text-decoration:none;'
        f'font-weight:700;font-size:14px">{label} →</a>'
    )


# ── Invio generico ─────────────────────────────────────────────────────────────
async def _send(to: str, subject: str, html: str) -> None:
    if DEV_MODE:
        logger.warning(
            "\n══════════════════════════════════════════\n"
            "[EMAIL DEV]  To: %s\n"
            "             Subject: %s\n"
            "══════════════════════════════════════════",
            to, subject
        )
        return

    # ── Provider 1: Resend API ─────────────────────────────────────────────────
    if RESEND_API_KEY:
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                    json={"from": EMAIL_FROM, "to": [to], "subject": subject, "html": html},
                    timeout=15,
                )
                if resp.status_code not in (200, 201):
                    logger.error("[EMAIL Resend] Errore %s: %s", resp.status_code, resp.text)
            return
        except Exception as exc:
            logger.error("[EMAIL Resend] Eccezione: %s", exc)
            # Fallback a SMTP se disponibile
            if not SMTP_HOST:
                return

    # ── Provider 2: SMTP ──────────────────────────────────────────────────────
    try:
        import aiosmtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        msg = MIMEMultipart("alternative")
        msg["From"]    = EMAIL_FROM
        msg["To"]      = to
        msg["Subject"] = subject
        msg.attach(MIMEText(html, "html", "utf-8"))

        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER,
            password=SMTP_PASSWORD,
            start_tls=True,
        )
    except Exception as exc:
        logger.error("[EMAIL SMTP] Errore invio a %s: %s", to, exc)


# ── Email di verifica account ──────────────────────────────────────────────────
async def send_verification_email(to: str, token: str) -> None:
    link = f"{BACKEND_URL}/auth/verify-email/{token}"
    if DEV_MODE:
        logger.warning(
            "\n╔══════════════════════════════════════════════════╗\n"
            "║  [DEV] VERIFICA EMAIL — copia il link qui sotto  ║\n"
            "╚══════════════════════════════════════════════════╝\n"
            "  → %s\n",
            link
        )
        return
    html = _base_template(f"""
      <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:700">Verifica il tuo account</h2>
      <p style="color:#374151;line-height:1.6;margin:0 0 4px">
        Benvenuto su Endyo! Clicca il bottone per confermare il tuo indirizzo email:
      </p>
      {_btn(link, 'Verifica email')}
      <p style="color:#9ca3af;font-size:12px;margin:0">
        Il link scade tra <strong>24 ore</strong>.<br>
        Se non hai creato un account Endyo, ignora questa email.
      </p>
    """)
    await _send(to, "Verifica il tuo account Endyo", html)


# ── Email di reset password ────────────────────────────────────────────────────
async def send_reset_email(to: str, token: str, brand_portal: bool = False) -> None:
    if brand_portal:
        link = f"{APP_URL}/portal/brand.html#reset/{token}"
    else:
        link = f"{APP_URL}/#/reset-password/{token}"
    html = _base_template(f"""
      <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:700">Reset password</h2>
      <p style="color:#374151;line-height:1.6;margin:0 0 4px">
        Hai richiesto di reimpostare la password del tuo account Endyo.
        Clicca il bottone per procedere:
      </p>
      {_btn(link, 'Reimposta password')}
      <p style="color:#9ca3af;font-size:12px;margin:0">
        Il link scade tra <strong>1 ora</strong>.<br>
        Se non hai richiesto il reset, ignora questa email — il tuo account è al sicuro.
      </p>
    """)
    await _send(to, "Reset password Endyo", html)


# ── Email conferma abbonamento Premium ────────────────────────────────────────
async def send_premium_confirmation_email(to: str, plan: str) -> None:
    plan_label = "Premium Annuale" if "annual" in plan else "Premium Mensile"
    html = _base_template(f"""
      <h2 style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:700">Abbonamento attivato! 🎉</h2>
      <p style="color:#374151;line-height:1.6;margin:0 0 16px">
        Il tuo piano <strong>{plan_label}</strong> è ora attivo. Hai accesso illimitato
        allo Stylist AI e a tutte le funzionalità Premium di Endyo.
      </p>
      {_btn(f"{APP_URL}/#/wardrobe", 'Apri Endyo')}
      <p style="color:#9ca3af;font-size:12px;margin:0">
        Per gestire o annullare il tuo abbonamento, vai su Impostazioni → Piano.
      </p>
    """)
    await _send(to, "Abbonamento Endyo Premium attivato", html)
