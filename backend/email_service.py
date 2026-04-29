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
def _base_template(content: str, preview: str = "") -> str:
    return f"""<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Endyo</title>
  {"<span style='display:none;max-height:0;overflow:hidden;mso-hide:all'>" + preview + "</span>" if preview else ""}
</head>
<body style="margin:0;padding:0;background:#f5f3ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">

        <!-- HEADER -->
        <tr><td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);border-radius:16px 16px 0 0;padding:32px;text-align:center">
          <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.15em;text-transform:uppercase">il tuo guardaroba intelligente</p>
          <h1 style="margin:0;color:#ffffff;font-size:32px;font-weight:900;letter-spacing:-0.05em">endyo</h1>
        </td></tr>

        <!-- BODY -->
        <tr><td style="background:#ffffff;padding:40px 40px 32px">
          {content}
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="background:#faf9ff;border-top:1px solid #ede9fe;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center">
          <p style="margin:0 0 6px;color:#6d28d9;font-size:13px;font-weight:600">endyo.it</p>
          <p style="margin:0;color:#a78bfa;font-size:11px">
            © 2025 Endyo · I tuoi dati sono al sicuro ·
            <a href="https://endyo.it/privacy" style="color:#a78bfa;text-decoration:none">Privacy</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _btn(url: str, label: str) -> str:
    return (
        f'<table cellpadding="0" cellspacing="0" style="margin:24px 0">'
        f'<tr><td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);border-radius:10px">'
        f'<a href="{url}" style="display:inline-block;padding:14px 36px;color:#ffffff;'
        f'text-decoration:none;font-weight:700;font-size:15px;letter-spacing:-0.01em">'
        f'{label} &rarr;</a></td></tr></table>'
    )


def _divider() -> str:
    return '<div style="height:1px;background:#ede9fe;margin:24px 0"></div>'


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
    html = _base_template(
        preview="Conferma il tuo indirizzo email per iniziare a usare Endyo.",
        content=f"""
      <p style="margin:0 0 6px;font-size:13px;color:#7c3aed;font-weight:600;letter-spacing:0.05em;text-transform:uppercase">Benvenuto</p>
      <h2 style="margin:0 0 16px;color:#1e1b4b;font-size:22px;font-weight:800;line-height:1.3">Conferma il tuo<br>indirizzo email</h2>
      <p style="color:#4b5563;line-height:1.7;margin:0 0 8px;font-size:15px">
        Ci siamo quasi! Clicca il bottone qui sotto per attivare il tuo account Endyo
        e iniziare a costruire il tuo guardaroba intelligente.
      </p>
      {_btn(link, 'Verifica email')}
      {_divider()}
      <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6">
        Il link è valido per <strong>24 ore</strong>.<br>
        Se non hai creato un account Endyo, puoi ignorare questa email in tutta sicurezza.
      </p>
    """)
    await _send(to, "Conferma il tuo account Endyo", html)


# ── Email di reset password ────────────────────────────────────────────────────
async def send_reset_email(to: str, token: str, brand_portal: bool = False) -> None:
    if brand_portal:
        link = f"{APP_URL}/portal/brand.html#reset/{token}"
    else:
        link = f"{APP_URL}/#/reset-password/{token}"
    html = _base_template(
        preview="Hai richiesto di reimpostare la password del tuo account Endyo.",
        content=f"""
      <p style="margin:0 0 6px;font-size:13px;color:#7c3aed;font-weight:600;letter-spacing:0.05em;text-transform:uppercase">Sicurezza account</p>
      <h2 style="margin:0 0 16px;color:#1e1b4b;font-size:22px;font-weight:800;line-height:1.3">Reimposta la tua<br>password</h2>
      <p style="color:#4b5563;line-height:1.7;margin:0 0 8px;font-size:15px">
        Abbiamo ricevuto una richiesta di reset password per il tuo account Endyo.
        Clicca il bottone qui sotto per sceglierne una nuova.
      </p>
      {_btn(link, 'Reimposta password')}
      {_divider()}
      <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6">
        Il link è valido per <strong>1 ora</strong>.<br>
        Se non hai richiesto il reset, ignora questa email — il tuo account rimane al sicuro e nessuna modifica è stata applicata.
      </p>
    """)
    await _send(to, "Reimposta la password Endyo", html)


# ── Email conferma abbonamento Premium ────────────────────────────────────────
async def send_premium_confirmation_email(to: str, plan: str) -> None:
    plan_label = "Premium Annuale" if "annual" in plan else "Premium Mensile"
    html = _base_template(
        preview=f"Il tuo piano {plan_label} è ora attivo. Benvenuto nel lato premium di Endyo!",
        content=f"""
      <p style="margin:0 0 6px;font-size:13px;color:#7c3aed;font-weight:600;letter-spacing:0.05em;text-transform:uppercase">Abbonamento attivo</p>
      <h2 style="margin:0 0 16px;color:#1e1b4b;font-size:22px;font-weight:800;line-height:1.3">Benvenuto in<br>Endyo Premium</h2>
      <p style="color:#4b5563;line-height:1.7;margin:0 0 20px;font-size:15px">
        Il tuo piano <strong style="color:#7c3aed">{plan_label}</strong> è ora attivo.
        Hai accesso illimitato allo Stylist AI, alle analisi avanzate del guardaroba
        e a tutte le funzionalità Premium di Endyo.
      </p>
      <table cellpadding="0" cellspacing="0" width="100%" style="background:#f5f3ff;border-radius:10px;margin-bottom:24px">
        <tr><td style="padding:20px 24px">
          <p style="margin:0 0 8px;color:#6d28d9;font-weight:700;font-size:13px">Cosa hai sbloccato:</p>
          <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.8">
            Stylist AI illimitato<br>
            Analisi armocromia<br>
            Wear tracking avanzato<br>
            Suggerimenti di acquisto personalizzati
          </p>
        </td></tr>
      </table>
      {_btn(f"{APP_URL}/#/wardrobe", 'Apri Endyo')}
      {_divider()}
      <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6">
        Per gestire o annullare il tuo abbonamento, vai su <strong>Impostazioni → Piano</strong>.
      </p>
    """)
    await _send(to, f"Endyo Premium attivato — {plan_label}", html)
