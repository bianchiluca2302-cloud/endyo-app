from dotenv import load_dotenv
load_dotenv()  # Carica variabili da backend/.env prima di tutto il resto

import os
import re as _re

# ── Fail-fast: variabili critiche obbligatorie in produzione ──────────────────
_IS_PROD = os.getenv("ENV", "development").lower() == "production"
if _IS_PROD:
    _missing = [k for k in ("SECRET_KEY", "OPENAI_KEY_VISION", "OPENAI_KEY_STYLIST", "OPENAI_KEY_ARMOCROMIA", "OPENAI_KEY_SHOPPING") if not os.getenv(k)]
    if _missing:
        raise RuntimeError(
            f"[CRITICAL] Variabili d'ambiente obbligatorie non impostate: {_missing}. "
            "Il server non si avvierà senza di esse in modalità produzione."
        )
    _sk = os.getenv("SECRET_KEY", "")
    if len(_sk) < 32:
        raise RuntimeError(
            "[CRITICAL] SECRET_KEY deve essere di almeno 32 caratteri. "
            "Genera con: python -c \"import secrets; print(secrets.token_hex(32))\""
        )

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks, status, Request
from fastapi.responses import HTMLResponse, FileResponse, RedirectResponse, StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from typing import Optional
import shutil
import uuid
import json
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import datetime, timezone, date, timedelta

from database import get_db, init_db
from models import Garment, Outfit, UserProfile, User, Friendship, ShowcaseItem, Brand, BrandProduct, BrandProductImpression, BrandProductFeedback, WearLog, SocialPost, PostLike, PostComment
from ai_service import analyze_garment, reenrich_garment, generate_outfit_recommendations, chat_with_stylist, complete_outfit, stream_chat_with_stylist
from tryon_service import generate_tryon, generate_outfit_tryon, fashn_supported, get_fashn_key
from bg_service import remove_background, preload_model_sync
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Annotated
from auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    generate_secure_token, token_expiry,
    VERIFY_TOKEN_TTL, RESET_TOKEN_TTL,
)
from email_service import send_verification_email, send_reset_email, DEV_MODE as EMAIL_DEV_MODE

logger = logging.getLogger(__name__)
_bearer = HTTPBearer(auto_error=False)

# ── Upload directory ──────────────────────────────────────────────────────────
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# ── Dist directory (brand portal) ─────────────────────────────────────────────
DIST_DIR = Path(__file__).parent.parent / "dist"


import asyncio

async def _migrate_db():
    """Aggiunge colonne mancanti senza toccare i dati esistenti.
    Ogni ALTER TABLE gira in una transazione propria: un errore (es. colonna
    già esistente) non blocca le migrazioni successive.
    """
    from database import engine as _engine
    from sqlalchemy import text as _text

    extra_migrations = [
        # Tabella users
        ("users", "chat_week_count",        "INTEGER NOT NULL DEFAULT 0"),
        ("users", "chat_week_reset_at",     "TIMESTAMP WITH TIME ZONE"),
        ("users", "plan_started_at",        "TIMESTAMP WITH TIME ZONE"),
        ("users", "plan_expires_at",        "TIMESTAMP WITH TIME ZONE"),
        ("users", "scheduled_downgrade_to", "VARCHAR(20)"),
        # Tabella brands
        ("brands", "reset_token",           "VARCHAR(100)"),
        ("brands", "reset_token_expires",   "TIMESTAMP WITH TIME ZONE"),
        ("brands", "logo_url",              "VARCHAR(500)"),
        ("brands", "description",           "TEXT"),
        ("brands", "website",               "VARCHAR(500)"),
        ("brands", "active",                "BOOLEAN NOT NULL DEFAULT TRUE"),
        ("brands", "updated_at",            "TIMESTAMP WITH TIME ZONE"),
        # Tabella outfits
        ("outfits", "is_usual",             "BOOLEAN NOT NULL DEFAULT FALSE"),
        # Tabella users — Google OAuth + profilo esteso
        ("users", "google_linked",          "BOOLEAN NOT NULL DEFAULT FALSE"),
        # Tabella user_profile — profilo esteso
        ("user_profile", "last_name",       "VARCHAR(100)"),
        ("user_profile", "birth_year",      "INTEGER"),
    ]

    for table, col, definition in extra_migrations:
        try:
            async with _engine.begin() as conn:
                await conn.execute(_text(f"ALTER TABLE {table} ADD COLUMN {col} {definition}"))
        except Exception:
            pass  # colonna già esistente — ignorato


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _migrate_db()
    # Pre-carica il modello rembg in background (evita attesa al primo utilizzo)
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, preload_model_sync)
    # Pulizia file temporanei orfani (tmp_*) più vecchi di 2 ore
    _cleanup_orphaned_tmp_files()
    yield


# ── Rate limiter ──────────────────────────────────────────────────────────────
# Quando il server è dietro un reverse proxy (nginx/Caddy), tutti i client
# sembrano venire da 127.0.0.1. Con TRUST_PROXY=1 si legge X-Forwarded-For.
# ATTENZIONE: abilitare TRUST_PROXY solo se si è sicuri che il proxy imposti
# correttamente l'header (altrimenti i client possono spoofarlo).
_TRUST_PROXY = os.getenv("TRUST_PROXY", "0") == "1"

def _get_real_ip(request: Request) -> str:
    """Restituisce l'IP reale del client rispettando X-Forwarded-For se TRUST_PROXY=1."""
    if _TRUST_PROXY:
        xff = request.headers.get("X-Forwarded-For", "")
        if xff:
            return xff.split(",")[0].strip()
    return get_remote_address(request)

limiter = Limiter(key_func=_get_real_ip, default_limits=["120/minute"])

app = FastAPI(title="Wardrobe AI API", version="1.0.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── CORS ──────────────────────────────────────────────────────────────────────
# In produzione impostare ALLOWED_ORIGINS="https://yourapp.com,https://www.yourapp.com"
# In sviluppo, se non impostato, si accetta solo localhost.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "")
if _raw_origins.strip():
    _cors_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
else:
    # Fallback sviluppo: accetta qualsiasi origine SOLO se non in produzione
    _cors_origins = ["*"] if not _IS_PROD else []
    if _IS_PROD and not _cors_origins:
        raise RuntimeError(
            "[CRITICAL] ALLOWED_ORIGINS non impostata in produzione. "
            "Esempio: ALLOWED_ORIGINS=https://yourapp.com"
        )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# ── Security headers ──────────────────────────────────────────────────────────
from starlette.responses import Response as StarletteResponse

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Aggiunge header di sicurezza standard a ogni risposta."""
    async def dispatch(self, request, call_next):
        try:
            response = await call_next(request)
        except Exception:
            # Passa l'eccezione ai gestori FastAPI senza avvolgere in ExceptionGroup
            raise
        response.headers["X-Content-Type-Options"]  = "nosniff"
        response.headers["X-Frame-Options"]         = "DENY"
        response.headers["X-XSS-Protection"]        = "1; mode=block"
        response.headers["Referrer-Policy"]         = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"]      = "camera=(), microphone=(), geolocation=()"
        if _IS_PROD:
            # HSTS: solo in produzione con HTTPS
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# ── Body-size limit: max 10 MB per request (block oversized payloads) ─────────
class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """Reject requests whose Content-Length exceeds max_bytes."""
    def __init__(self, app, max_bytes: int = 10 * 1024 * 1024):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request, call_next):
        cl = request.headers.get("content-length")
        if cl and int(cl) > self.max_bytes:
            return StarletteResponse(
                content='{"detail":"Request body too large"}',
                status_code=413,
                media_type="application/json",
            )
        return await call_next(request)

app.add_middleware(MaxBodySizeMiddleware, max_bytes=10 * 1024 * 1024)

# Serve uploaded images
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Serve brand portal (dist/ folder) — solo se già buildato
if DIST_DIR.exists():
    app.mount("/portal", StaticFiles(directory=str(DIST_DIR)), name="portal")


@app.get("/brand-portal")
async def brand_portal_redirect():
    """Redirect rapido per i brand: http://IP:8000/brand-portal → brand.html"""
    return RedirectResponse(url="/portal/brand.html")


# ── Landing page pubblica ─────────────────────────────────────────────────────
_LANDING_PATH = Path(__file__).parent / "landing.html"

@app.get("/", response_class=HTMLResponse)
async def landing_page():
    """Serve la landing page pubblica di Endyo."""
    if _LANDING_PATH.exists():
        return HTMLResponse(content=_LANDING_PATH.read_text(encoding="utf-8"))
    return RedirectResponse(url="/portal/brand.html")


# ── App HTML con no-cache (evita che iOS PWA usi una versione vecchia) ─────────
_INDEX_PATH = DIST_DIR / "index.html"

@app.get("/portal/index.html", response_class=HTMLResponse)
@app.get("/app", response_class=HTMLResponse)
async def serve_app():
    """Serve index.html con Cache-Control: no-store per forzare aggiornamenti PWA."""
    if not _INDEX_PATH.exists():
        return HTMLResponse("<h1>App not built</h1>", status_code=503)
    headers = {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
    }
    return HTMLResponse(content=_INDEX_PATH.read_text(encoding="utf-8"), headers=headers)


# ── Pagine legali ─────────────────────────────────────────────────────────────
_BACKEND_DIR = Path(__file__).parent

@app.get("/privacy", response_class=HTMLResponse)
async def privacy_page():
    p = _BACKEND_DIR / "privacy.html"
    return HTMLResponse(content=p.read_text(encoding="utf-8") if p.exists() else "<h1>Privacy Policy</h1>")

@app.get("/terms", response_class=HTMLResponse)
async def terms_page():
    p = _BACKEND_DIR / "terms.html"
    return HTMLResponse(content=p.read_text(encoding="utf-8") if p.exists() else "<h1>Termini di Servizio</h1>")

@app.get("/cookie", response_class=HTMLResponse)
async def cookie_page():
    p = _BACKEND_DIR / "cookie.html"
    return HTMLResponse(content=p.read_text(encoding="utf-8") if p.exists() else "<h1>Cookie Policy</h1>")

@app.get("/ads.txt")
async def ads_txt():
    """File ads.txt richiesto da Google AdSense. Sostituire XXXXXXXXXXXXXXXX con il tuo Publisher ID."""
    from fastapi.responses import PlainTextResponse
    # Formato: google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
    content = "# Endyo ads.txt\n# Sostituire il Publisher ID dopo l'approvazione AdSense\n# google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0\n"
    return PlainTextResponse(content=content)


# ── Download installer ────────────────────────────────────────────────────────
_RELEASE_DIR = Path(__file__).parent.parent / "release"

@app.get("/download/{filename}")
async def download_installer(filename: str):
    """Scarica l'installer dell'app desktop dalla cartella release/."""
    # Sicurezza: solo file .exe, .dmg, .AppImage
    if not any(filename.endswith(ext) for ext in (".exe", ".dmg", ".AppImage")):
        raise HTTPException(status_code=400, detail="Tipo file non supportato")
    # Blocca path traversal
    safe_name = Path(filename).name
    file_path = _RELEASE_DIR / safe_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Installer non ancora disponibile. Esegui prima npm run dist:win")
    return FileResponse(
        path=str(file_path),
        filename=safe_name,
        media_type="application/octet-stream",
    )


# ── Helpers ───────────────────────────────────────────────────────────────────
def garment_to_dict(g: Garment) -> dict:
    return {
        "id": g.id,
        "name": g.name,
        "category": g.category,
        "brand": g.brand,
        "color_primary": g.color_primary,
        "color_hex": g.color_hex,
        "size": g.size,
        "price": g.price,
        "material": g.material,
        "description": g.description,
        "style_tags": g.style_tags or [],
        "season_tags": g.season_tags or [],
        "occasion_tags": g.occasion_tags or [],
        "photo_front": f"/uploads/{g.photo_front}" if g.photo_front else None,
        "photo_back": f"/uploads/{g.photo_back}" if g.photo_back else None,
        "photo_label": f"/uploads/{g.photo_label}" if g.photo_label else None,
        "tryon_image": g.tryon_image or None,
        "tryon_status": g.tryon_status or "none",
        "bg_status": g.bg_status or "none",
        "created_at": g.created_at.isoformat() if g.created_at else None,
    }


def outfit_to_dict(o: Outfit) -> dict:
    return {
        "id": o.id,
        "name": o.name,
        "garment_ids": o.garment_ids or [],
        "occasion": o.occasion,
        "season": o.season,
        "rating": o.rating,
        "notes": o.notes,
        "transforms": o.transforms or {},
        "ai_generated": bool(o.ai_generated),
        "is_usual": bool(o.is_usual) if o.is_usual is not None else False,
        "created_at": o.created_at.isoformat() if o.created_at else None,
    }


_ALLOWED_IMAGE_EXTS  = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
_ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
_MAX_UPLOAD_BYTES    = 20 * 1024 * 1024   # 20 MB per foto
_TMP_MAX_AGE_SECONDS = 2 * 3600            # file tmp_ orfani eliminati dopo 2 ore


def _cleanup_orphaned_tmp_files() -> None:
    """Elimina i file tmp_* rimasti orfani (analyze senza confirm) da più di 2 ore."""
    import time
    now = time.time()
    deleted = 0
    try:
        for f in UPLOAD_DIR.glob("tmp_*"):
            try:
                if now - f.stat().st_mtime > _TMP_MAX_AGE_SECONDS:
                    f.unlink(missing_ok=True)
                    deleted += 1
            except Exception:
                pass
        if deleted:
            logger.info("[cleanup] Eliminati %d file tmp_ orfani all'avvio", deleted)
    except Exception as e:
        logger.warning("[cleanup] Errore pulizia tmp: %s", e)

async def save_upload(file: UploadFile, prefix: str) -> str:
    ext = Path(file.filename or "").suffix.lower() or ".jpg"
    if ext not in _ALLOWED_IMAGE_EXTS:
        raise HTTPException(status_code=415, detail=f"Tipo file non supportato: {ext}. Usa JPG, PNG o WebP.")

    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type not in _ALLOWED_IMAGE_MIMES:
        raise HTTPException(status_code=415, detail=f"Content-Type non supportato: {content_type}")

    filename = f"{prefix}_{uuid.uuid4().hex[:8]}{ext}"
    dest = UPLOAD_DIR / filename
    total = 0
    with open(dest, "wb") as f:
        while chunk := file.file.read(64 * 1024):
            total += len(chunk)
            if total > _MAX_UPLOAD_BYTES:
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="File troppo grande (max 20 MB)")
            f.write(chunk)
    return filename


# ── Auth dependency ───────────────────────────────────────────────────────────
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Valida il Bearer token e restituisce l'utente corrente."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Token mancante")
    user_id = decode_token(credentials.credentials, "access")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token non valido o scaduto")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Utente non trovato")
    return user


# ── Pydantic models per auth ──────────────────────────────────────────────────
import re as _re

class RegisterRequest(BaseModel):
    email:      EmailStr
    username:   Annotated[str, Field(min_length=3, max_length=30)]
    password:   Annotated[str, Field(min_length=8, max_length=128)]
    phone:      Annotated[Optional[str], Field(default=None, max_length=20)]
    first_name: Annotated[Optional[str], Field(default=None, max_length=100)]
    last_name:  Annotated[Optional[str], Field(default=None, max_length=100)]
    gender:     Annotated[Optional[str], Field(default=None, max_length=30)]
    birth_year: Optional[int] = None

    @field_validator("username")
    @classmethod
    def valid_username(cls, v: str) -> str:
        v = v.strip()
        if not _re.match(r'^[a-zA-Z0-9_.-]+$', v):
            raise ValueError("L'username può contenere solo lettere, numeri, _, . e -")
        return v.lower()

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La password deve essere di almeno 8 caratteri")
        if not _re.search(r'[A-Z]', v):
            raise ValueError("La password deve contenere almeno una lettera maiuscola")
        if not _re.search(r'[0-9]', v):
            raise ValueError("La password deve contenere almeno un numero")
        return v


class LoginRequest(BaseModel):
    email:       EmailStr
    password:    Annotated[str, Field(max_length=128)]
    remember_me: bool = False


class RefreshRequest(BaseModel):
    refresh_token: Annotated[str, Field(max_length=512)]


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token:        Annotated[str, Field(max_length=256)]
    new_password: Annotated[str, Field(min_length=8, max_length=128)]

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La password deve essere di almeno 8 caratteri")
        return v


# ── Auth endpoints ────────────────────────────────────────────────────────────
def user_to_dict(u: User) -> dict:
    return {
        "id": u.id, "email": u.email, "username": u.username,
        "phone": u.phone, "is_verified": u.is_verified,
        "plan": u.plan or "free",
        "google_linked": bool(u.google_linked),
    }


@app.get("/auth/check-username/{username}")
async def check_username(username: str, db: AsyncSession = Depends(get_db)):
    if len(username) < 3 or not _re.match(r'^[a-zA-Z0-9_.-]+$', username):
        return {"available": False, "reason": "invalid"}
    result = await db.execute(select(User).where(User.username == username.lower()))
    taken = result.scalar_one_or_none() is not None
    return {"available": not taken}


@app.post("/auth/register", status_code=201)
@limiter.limit("5/minute")    # prevent account creation spam
async def register(request: Request, data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Verifica unicità email
    existing_email = await db.execute(select(User).where(User.email == data.email))
    if existing_email.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email già registrata")
    # Verifica unicità username
    existing_uname = await db.execute(select(User).where(User.username == data.username))
    if existing_uname.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username già in uso, scegline un altro")

    verify_token = generate_secure_token()
    user = User(
        email=data.email,
        username=data.username,
        password_hash=hash_password(data.password),
        phone=data.phone,
        is_verified=False,
        verify_token=verify_token,
        verify_token_expires=token_expiry(VERIFY_TOKEN_TTL),
    )
    db.add(user)
    await db.flush()  # ottieni l'id senza commit

    # Crea profilo con dati opzionali forniti durante la registrazione
    profile = UserProfile(
        user_id    = user.id,
        name       = (data.first_name or '').strip() or None,
        last_name  = (data.last_name  or '').strip() or None,
        gender     = data.gender     or None,
        birth_year = data.birth_year or None,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(user)

    await send_verification_email(user.email, verify_token)

    return {
        "message": "Registrazione completata. Controlla la tua email per verificare l'account.",
        "email": user.email,
    }


@app.post("/auth/login")
@limiter.limit("10/minute")   # brute-force protection
async def login(request: Request, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email o password non corretti")

    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Email non verificata. Controlla la tua casella di posta.")

    access_token  = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    return {
        "access_token":  access_token,
        "refresh_token": refresh_token,
        "token_type":    "bearer",
        "user": user_to_dict(user),
    }


# ── Google OAuth ─────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

class GoogleAuthRequest(BaseModel):
    credential: str   # Google ID token (JWT) restituito da GSI

@app.get("/auth/google-client-id")
async def google_client_id():
    """Restituisce il Google Client ID pubblico al frontend."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(503, "Google OAuth non configurato")
    return {"client_id": GOOGLE_CLIENT_ID}


@app.post("/auth/google")
@limiter.limit("20/minute")
async def google_auth(request: Request, data: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """Verifica il Google ID token, crea o recupera l'utente, restituisce JWT Endyo."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(503, "Google OAuth non configurato (GOOGLE_CLIENT_ID mancante)")

    # Verifica token con google-auth
    try:
        from google.oauth2 import id_token as g_id_token
        from google.auth.transport import requests as g_requests
        idinfo = g_id_token.verify_oauth2_token(
            data.credential,
            g_requests.Request(),
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=10,
        )
    except Exception as e:
        raise HTTPException(401, f"Token Google non valido: {e}")

    google_email = idinfo.get("email", "").lower().strip()
    google_name  = idinfo.get("name", "")
    verified     = idinfo.get("email_verified", False)

    if not google_email or not verified:
        raise HTTPException(400, "Email Google non verificata")

    # Cerca utente esistente per email
    result = await db.execute(select(User).where(User.email == google_email))
    user   = result.scalar_one_or_none()

    if not user:
        # Crea nuovo utente — password casuale (non usata, login solo Google)
        import secrets as _sec
        user = User(
            email         = google_email,
            password_hash = hash_password(_sec.token_hex(32)),
            is_verified   = True,   # email già verificata da Google
            plan          = "free",
            google_linked = True,
        )
        db.add(user)
        await db.flush()   # ottieni l'id

        # Crea profilo con nome Google
        profile = UserProfile(user_id=user.id, name=google_name)
        db.add(profile)

    elif not user.google_linked:
        # Utente esistente con account normale (non collegato a Google)
        # → chiediamo di collegare l'account
        return JSONResponse(
            status_code=409,
            content={
                "action":      "link_required",
                "email":       google_email,
                "google_name": google_name,
                "detail":      "Esiste già un account con questa email. Vuoi collegarlo a Google?",
            }
        )

    else:
        # Utente Google già esistente: segna come verificato se non lo era
        if not user.is_verified:
            user.is_verified = True

    await db.commit()
    await db.refresh(user)

    access_token  = create_access_token(user.id)
    refresh_token_val = create_refresh_token(user.id)

    return {
        "access_token":  access_token,
        "refresh_token": refresh_token_val,
        "token_type":    "bearer",
        "user":          user_to_dict(user),
    }


class GoogleLinkRequest(BaseModel):
    credential: str   # Google ID token
    password:   Annotated[str, Field(max_length=128)]


@app.post("/auth/google/link")
@limiter.limit("10/minute")
async def google_link(request: Request, data: GoogleLinkRequest, db: AsyncSession = Depends(get_db)):
    """Collega un account Google a un account Endyo esistente verificando la password."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(503, "Google OAuth non configurato")

    # Verifica token Google
    try:
        from google.oauth2 import id_token as g_id_token
        from google.auth.transport import requests as g_requests
        idinfo = g_id_token.verify_oauth2_token(
            data.credential, g_requests.Request(), GOOGLE_CLIENT_ID, clock_skew_in_seconds=10,
        )
    except Exception as e:
        raise HTTPException(401, f"Token Google non valido: {e}")

    google_email = idinfo.get("email", "").lower().strip()
    if not google_email or not idinfo.get("email_verified", False):
        raise HTTPException(400, "Email Google non verificata")

    # Cerca account Endyo
    result = await db.execute(select(User).where(User.email == google_email))
    user   = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Nessun account trovato con questa email")
    if user.google_linked:
        raise HTTPException(400, "Account già collegato a Google")

    # Verifica password account normale
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(403, "Password non corretta")

    # Collega account
    user.google_linked = True
    user.is_verified   = True
    await db.commit()
    await db.refresh(user)

    return {
        "access_token":  create_access_token(user.id),
        "refresh_token": create_refresh_token(user.id),
        "token_type":    "bearer",
        "user":          user_to_dict(user),
    }


@app.post("/auth/refresh")
async def refresh_token(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    user_id = decode_token(data.refresh_token, "refresh")
    if not user_id:
        raise HTTPException(status_code=401, detail="Refresh token non valido o scaduto")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Utente non trovato")

    return {
        "access_token": create_access_token(user.id),
        "token_type":   "bearer",
    }


def _html_page(title: str, emoji: str, heading: str, body: str, color: str = "#f59e0b") -> HTMLResponse:
    html = f"""<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} — Endyo</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ min-height: 100vh; display: flex; align-items: center; justify-content: center;
           background: #fef9e7;
           font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }}
    .card {{ background: #ffffff; border: 1px solid #fde68a; border-radius: 24px;
             padding: 48px 40px; max-width: 420px; width: 90%; text-align: center;
             box-shadow: 0 8px 40px rgba(245,158,11,0.15); }}
    .emoji {{ font-size: 56px; margin-bottom: 20px; }}
    h1 {{ font-size: 22px; font-weight: 800; color: #1a1208; margin-bottom: 12px; }}
    p {{ color: #6b5b3e; line-height: 1.6; font-size: 15px; }}
    .brand {{ margin-top: 32px; font-size: 20px; font-weight: 900; color: #f59e0b;
              letter-spacing: -0.04em; }}
    .brand span {{ color: #d97706; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">{emoji}</div>
    <h1>{heading}</h1>
    <p>{body}</p>
    <div class="brand">end<span>yo</span></div>
  </div>
</body>
</html>"""
    return HTMLResponse(content=html)


@app.get("/auth/verify-email/{token}")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.verify_token == token))
    user = result.scalar_one_or_none()
    if not user:
        return _html_page(
            "Link non valido", "❌",
            "Link non valido",
            "Questo link di verifica non è valido o è già stato usato.<br>Torna all'app e richiedi un nuovo link."
        )

    now = datetime.now(timezone.utc)
    expires = user.verify_token_expires
    if expires and expires.tzinfo is None:
        from datetime import timezone as _tz
        expires = expires.replace(tzinfo=_tz.utc)
    if expires and now > expires:
        return _html_page(
            "Link scaduto", "⏰",
            "Link scaduto",
            "Il link di verifica è scaduto (validità 24 ore).<br>Torna all'app e richiedi un nuovo link."
        )

    user.is_verified          = True
    user.verify_token         = None
    user.verify_token_expires = None
    await db.commit()

    return _html_page(
        "Email verificata", "✅",
        "Email verificata!",
        "Il tuo account Endyo è stato attivato.<br>Puoi chiudere questa finestra e accedere dall'app."
    )


@app.post("/auth/resend-verification")
@limiter.limit("1/2minutes")
async def resend_verification(request: Request, data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    # Risposta identica sia che l'utente esista o meno (sicurezza)
    if user and not user.is_verified:
        verify_token = generate_secure_token()
        user.verify_token         = verify_token
        user.verify_token_expires = token_expiry(VERIFY_TOKEN_TTL)
        await db.commit()
        await send_verification_email(user.email, verify_token)
    return {"message": "Se l'email è registrata e non verificata, riceverai un nuovo link."}


@app.post("/auth/forgot-password")
@limiter.limit("5/minute")    # prevent reset token flood / email bombing
async def forgot_password(request: Request, data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    # Risposta identica sia che l'utente esista o meno (sicurezza anti-enumeration)
    if user:
        reset_token = generate_secure_token()
        user.reset_token         = reset_token
        user.reset_token_expires = token_expiry(RESET_TOKEN_TTL)
        await db.commit()
        await send_reset_email(user.email, reset_token)
    return {"message": "Se l'email è registrata, riceverai un link per reimpostare la password."}


@app.post("/auth/reset-password")
async def reset_password(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.reset_token == data.token))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="Token non valido")

    now = datetime.now(timezone.utc)
    expires = user.reset_token_expires
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires and now > expires:
        raise HTTPException(status_code=400, detail="Token scaduto. Richiedi un nuovo link.")

    user.password_hash       = hash_password(data.new_password)
    user.reset_token         = None
    user.reset_token_expires = None
    await db.commit()

    return {"message": "Password reimpostata con successo. Puoi ora accedere."}


@app.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return user_to_dict(current_user)


class DeleteAccountRequest(BaseModel):
    password: Annotated[str, Field(max_length=128)]

@app.delete("/auth/me", status_code=200)
async def delete_account(
    data: DeleteAccountRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    GDPR Right to Erasure: elimina l'account e tutti i dati associati.
    Richiede la password corrente come conferma.
    """
    if not verify_password(data.password, current_user.password_hash):
        raise HTTPException(status_code=403, detail="Password non corretta")

    uid = current_user.id

    # Raccogli tutti i file da eliminare
    garment_result = await db.execute(select(Garment).where(Garment.user_id == uid))
    garments = garment_result.scalars().all()
    files_to_delete = []
    for g in garments:
        for field in ("photo_front", "photo_back", "photo_label", "tryon_image"):
            if getattr(g, field, None):
                files_to_delete.append(UPLOAD_DIR / getattr(g, field))

    profile_result = await db.execute(select(UserProfile).where(UserProfile.user_id == uid))
    profile = profile_result.scalar_one_or_none()
    if profile:
        for field in ("avatar_photo", "face_photo_1", "face_photo_2", "profile_picture"):
            if getattr(profile, field, None):
                files_to_delete.append(UPLOAD_DIR / getattr(profile, field))

    # Elimina i record dal DB (cascade tramite FK o delete esplicito)
    await db.execute(delete(PostComment).where(PostComment.user_id == uid))
    await db.execute(delete(PostLike).where(PostLike.user_id == uid))
    await db.execute(delete(SocialPost).where(SocialPost.user_id == uid))
    await db.execute(delete(WearLog).where(WearLog.user_id == uid))
    await db.execute(delete(Outfit).where(Outfit.user_id == uid))
    await db.execute(delete(Garment).where(Garment.user_id == uid))
    await db.execute(delete(Friendship).where(
        (Friendship.user_id == uid) | (Friendship.friend_id == uid)
    ))
    await db.execute(delete(UserProfile).where(UserProfile.user_id == uid))
    await db.execute(delete(User).where(User.id == uid))
    await db.commit()

    # Elimina i file fisici
    for f in files_to_delete:
        try:
            f.unlink(missing_ok=True)
        except Exception:
            pass

    logger.info("[account] Utente %d eliminato (GDPR erasure)", uid)
    return {"ok": True, "message": "Account eliminato con successo"}


async def _run_bg_removal_background(garment_id: int):
    """
    Background task: rimuove lo sfondo da fronte e retro (NON etichetta) e aggiorna il DB.
    Aggiorna bg_status: processing → done (o torna a none in caso di errore).
    """
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(Garment).where(Garment.id == garment_id))
            g = result.scalar_one_or_none()
            if not g:
                return

            # Solo fronte e retro — l'etichetta rimane originale
            for field in ("photo_front", "photo_back"):
                filename = getattr(g, field)
                if not filename:
                    continue
                full_path = str(UPLOAD_DIR / filename)
                new_path = await remove_background(full_path)
                new_filename = Path(new_path).name
                if new_filename != filename:
                    setattr(g, field, new_filename)
                    logger.info("BG rimosso %s → %s (garment %d)", filename, new_filename, garment_id)

            g.bg_status = "done"
            await db.commit()
        except Exception as e:
            logger.error("BG removal fallito per garment %d: %s", garment_id, e)
            try:
                g.bg_status = "none"
                await db.commit()
            except Exception:
                pass


async def _run_tryon_background(garment_id: int, avatar_path: str, garment_path: str, category: str):
    """Background task: genera try-on e aggiorna lo stato nel DB."""
    from database import AsyncSessionLocal  # import locale per evitare cicli
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(Garment).where(Garment.id == garment_id))
            g = result.scalar_one_or_none()
            if not g:
                return
            g.tryon_status = "processing"
            await db.commit()

            tryon_path = await generate_tryon(avatar_path, garment_path, category)

            g.tryon_image = tryon_path
            g.tryon_status = "done"
            await db.commit()
            logger.info("Try-on completato per garment %d → %s", garment_id, tryon_path)
        except Exception as e:
            logger.error("Try-on fallito per garment %d: %s", garment_id, e)
            try:
                g.tryon_status = "failed"
                await db.commit()
            except Exception:
                pass


# ── Garment endpoints ─────────────────────────────────────────────────────────

@app.post("/garments/analyze")
@limiter.limit("20/minute")   # GPT-4 Vision cost protection
async def analyze_garment_only(
    request: Request,
    photo_front: Optional[UploadFile] = File(None),
    photo_back:  Optional[UploadFile] = File(None),
    photo_label: Optional[UploadFile] = File(None),
    category: Optional[str] = Form(None),
    language: Optional[str] = Form('it'),
    current_user: User = Depends(get_current_user),
):
    """
    Analizza le foto con GPT-4 Vision senza creare alcun record nel DB.
    Salva i file con prefisso 'tmp_' per uso successivo in /garments/confirm.
    """
    front_path = back_path = label_path = None

    if photo_front and photo_front.filename:
        front_path = await save_upload(photo_front, "tmp_front")
    if photo_back and photo_back.filename:
        back_path = await save_upload(photo_back, "tmp_back")
    if photo_label and photo_label.filename:
        label_path = await save_upload(photo_label, "tmp_label")

    front_full = str(UPLOAD_DIR / front_path) if front_path else None
    back_full  = str(UPLOAD_DIR / back_path)  if back_path  else None
    label_full = str(UPLOAD_DIR / label_path) if label_path else None

    analysis = await analyze_garment(front_full, back_full, label_full, language=language or 'it')
    if category:
        analysis["category"] = category

    return {
        "analysis":  analysis,
        "tmp_front": front_path,
        "tmp_back":  back_path,
        "tmp_label": label_path,
    }


class GarmentConfirmRequest(BaseModel):
    tmp_front: Annotated[Optional[str], Field(default=None, max_length=120)]
    tmp_back:  Annotated[Optional[str], Field(default=None, max_length=120)]
    tmp_label: Annotated[Optional[str], Field(default=None, max_length=120)]
    analysis:  dict = {}
    category:  Annotated[Optional[str], Field(default=None, max_length=50)]

    @field_validator("tmp_front", "tmp_back", "tmp_label", mode="before")
    @classmethod
    def no_path_traversal(cls, v):
        if v and ("/" in v or "\\" in v or ".." in v):
            raise ValueError("Percorso file non valido")
        return v


@app.post("/garments/confirm")
async def confirm_garment(
    data: GarmentConfirmRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Crea il capo nel DB usando le foto temporanee già analizzate.
    Rinomina i file tmp_ con i prefissi definitivi (front_, back_, label_).
    Controlla e incrementa la quota upload prima di salvare.
    """
    import json as _json

    # ── Controllo quota upload ─────────────────────────────────────────────────
    await _maybe_expire_plan(current_user, db)
    _check_and_increment_upload_quota(current_user)
    await db.commit()   # salva aggiornamento contatori prima del resto

    front_path = back_path = label_path = None

    def _rename_tmp(tmp_name: str, prefix: str) -> str:
        """Rinomina tmp_front_xxx → front_xxx (stessa estensione)."""
        old = UPLOAD_DIR / tmp_name
        suffix = Path(tmp_name).suffix
        new_name = f"{prefix}_{uuid.uuid4().hex[:8]}{suffix}"
        new = UPLOAD_DIR / new_name
        old.rename(new)
        return new_name

    if data.tmp_front:
        try:
            front_path = _rename_tmp(data.tmp_front, "front")
        except Exception:
            front_path = data.tmp_front  # usa il nome tmp se rinomina fallisce

    if data.tmp_back:
        try:
            back_path = _rename_tmp(data.tmp_back, "back")
        except Exception:
            back_path = data.tmp_back

    if data.tmp_label:
        try:
            label_path = _rename_tmp(data.tmp_label, "label")
        except Exception:
            label_path = data.tmp_label

    analysis      = data.analysis
    final_category = data.category or analysis.get("category", "maglietta")
    has_photos_for_bg = bool(front_path or back_path)

    garment = Garment(
        user_id=current_user.id,
        name=analysis.get("name", "Capo sconosciuto"),
        category=final_category,
        brand=analysis.get("brand"),
        color_primary=analysis.get("color_primary"),
        color_hex=analysis.get("color_hex"),
        size=analysis.get("size"),
        price=analysis.get("price"),
        material=analysis.get("material"),
        description=analysis.get("description"),
        style_tags=analysis.get("style_tags", []),
        season_tags=analysis.get("season_tags", []),
        occasion_tags=analysis.get("occasion_tags", []),
        photo_front=front_path,
        photo_back=back_path,
        photo_label=label_path,
        ai_analysis=analysis,
        tryon_status="none",
        bg_status="processing" if has_photos_for_bg else "none",
    )
    db.add(garment)
    await db.commit()
    await db.refresh(garment)

    if has_photos_for_bg:
        background_tasks.add_task(_run_bg_removal_background, garment.id)

    return garment_to_dict(garment)


@app.post("/garments/manual")
async def create_garment_manual(
    background_tasks: BackgroundTasks,
    photo_front: Optional[UploadFile] = File(None),
    name:          str           = Form(...),
    category:      str           = Form(...),
    brand:         Optional[str] = Form(None),
    color_primary: Optional[str] = Form(None),
    size:          Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Crea un capo manualmente senza AI — nessun controllo quota.
    Usato quando i crediti giornalieri sono esauriti.
    Accetta un'unica foto opzionale (frontale) e i campi compilati dall'utente.
    """
    front_path = None
    if photo_front and photo_front.filename:
        front_name = await save_upload(photo_front, "front")
        front_path = front_name

    garment = Garment(
        user_id=current_user.id,
        name=name.strip() or "Capo senza nome",
        category=category,
        brand=brand or None,
        color_primary=color_primary or None,
        size=size or None,
        photo_front=front_path,
        ai_analysis={},
        tryon_status="none",
        bg_status="processing" if front_path else "none",
    )
    db.add(garment)
    await db.commit()
    await db.refresh(garment)

    if front_path:
        background_tasks.add_task(_run_bg_removal_background, garment.id)

    return garment_to_dict(garment)


@app.get("/garments")
async def list_garments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Garment).where(Garment.user_id == current_user.id).order_by(Garment.created_at.desc())
    )
    garments = result.scalars().all()
    return [garment_to_dict(g) for g in garments]


@app.get("/garments/{garment_id}")
async def get_garment(
    garment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Garment).where(Garment.id == garment_id))
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Capo non trovato")
    if g.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    return garment_to_dict(g)


@app.post("/garments")
async def create_garment(
    background_tasks: BackgroundTasks,
    photo_front: Optional[UploadFile] = File(None),
    photo_back: Optional[UploadFile] = File(None),
    photo_label: Optional[UploadFile] = File(None),
    name: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    language: Optional[str] = Form('it'),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload photos and auto-analyze with AI."""
    front_path = back_path = label_path = None

    if photo_front and photo_front.filename:
        front_name = await save_upload(photo_front, "front")
        front_path = front_name

    if photo_back and photo_back.filename:
        back_name = await save_upload(photo_back, "back")
        back_path = back_name

    if photo_label and photo_label.filename:
        label_name = await save_upload(photo_label, "label")
        label_path = label_name

    # Run AI analysis
    front_full = str(UPLOAD_DIR / front_path) if front_path else None
    back_full = str(UPLOAD_DIR / back_path) if back_path else None
    label_full = str(UPLOAD_DIR / label_path) if label_path else None

    analysis = await analyze_garment(front_full, back_full, label_full, language=language or 'it')

    final_category = category or analysis.get("category", "maglietta")

    # Se ci sono foto da processare, bg_status parte subito come "processing"
    # così GarmentCard avvia il polling e riceve i path aggiornati (_nobg.png)
    # appena il background task completa. Senza questo, il frontend avrebbe
    # i path originali (cancellati da bg_service) e le immagini risulterebbero rotte.
    has_photos_for_bg = bool(front_path or back_path)

    # Use provided values or AI results
    garment = Garment(
        user_id=current_user.id,
        name=name or analysis.get("name", "Capo sconosciuto"),
        category=final_category,
        brand=analysis.get("brand"),
        color_primary=analysis.get("color_primary"),
        color_hex=analysis.get("color_hex"),
        size=analysis.get("size"),
        price=analysis.get("price"),
        material=analysis.get("material"),
        description=analysis.get("description"),
        style_tags=analysis.get("style_tags", []),
        season_tags=analysis.get("season_tags", []),
        occasion_tags=analysis.get("occasion_tags", []),
        photo_front=front_path,
        photo_back=back_path,
        photo_label=label_path,
        ai_analysis=analysis,
        tryon_status="none",
        bg_status="processing" if has_photos_for_bg else "none",
    )
    db.add(garment)
    await db.commit()
    await db.refresh(garment)

    # Rimozione sfondo in background
    if has_photos_for_bg:
        background_tasks.add_task(_run_bg_removal_background, garment.id)

    return garment_to_dict(garment)


class GarmentUpdate(BaseModel):
    name:          Annotated[Optional[str],   Field(default=None, max_length=200)]
    category:      Annotated[Optional[str],   Field(default=None, max_length=50)]
    brand:         Annotated[Optional[str],   Field(default=None, max_length=100)]
    color_primary: Annotated[Optional[str],   Field(default=None, max_length=50)]
    size:          Annotated[Optional[str],   Field(default=None, max_length=20)]
    price:         Annotated[Optional[float], Field(default=None, ge=0, le=100000)]
    material:      Annotated[Optional[str],   Field(default=None, max_length=100)]
    description:   Annotated[Optional[str],   Field(default=None, max_length=1000)]
    style_tags:    Annotated[Optional[list],  Field(default=None, max_length=20)]
    season_tags:   Annotated[Optional[list],  Field(default=None, max_length=10)]
    occasion_tags: Annotated[Optional[list],  Field(default=None, max_length=15)]


@app.patch("/garments/{garment_id}")
async def update_garment(
    garment_id: int,
    data: GarmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Garment).where(Garment.id == garment_id))
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Capo non trovato")
    if g.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(g, field, value)
    await db.commit()
    await db.refresh(g)
    return garment_to_dict(g)


class ReEnrichRequest(BaseModel):
    language: Annotated[str, Field(default='it', max_length=5, pattern=r'^(it|en)$')]

@app.post("/garments/{garment_id}/reenrich")
async def reenrich_garment_endpoint(
    garment_id: int,
    data: ReEnrichRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Rigenera description, style_tags, season_tags e occasion_tags
    senza dover riscansionare le foto.
    """
    result = await db.execute(select(Garment).where(Garment.id == garment_id))
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Capo non trovato")
    if g.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")

    garment_data = {
        "name":          g.name,
        "category":      g.category,
        "brand":         g.brand,
        "color_primary": g.color_primary,
        "material":      g.material,
    }

    enriched = await reenrich_garment(garment_data, language=data.language)
    if not enriched:
        raise HTTPException(status_code=500, detail="Errore durante la rigenerazione")

    if enriched.get("description") is not None:
        g.description   = enriched["description"]
    if enriched.get("style_tags") is not None:
        g.style_tags    = enriched["style_tags"]
    if enriched.get("season_tags") is not None:
        g.season_tags   = enriched["season_tags"]
    if enriched.get("occasion_tags") is not None:
        g.occasion_tags = enriched["occasion_tags"]

    await db.commit()
    await db.refresh(g)
    return garment_to_dict(g)


@app.delete("/garments/{garment_id}")
async def delete_garment(
    garment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Garment).where(Garment.id == garment_id))
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Capo non trovato")
    if g.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    # Delete photo files
    for photo in [g.photo_front, g.photo_back, g.photo_label]:
        if photo:
            try:
                (UPLOAD_DIR / photo).unlink(missing_ok=True)
            except Exception:
                pass
    await db.delete(g)
    await db.commit()
    return {"ok": True}


# ── Outfit endpoints ──────────────────────────────────────────────────────────
@app.get("/outfits")
async def list_outfits(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Outfit).where(Outfit.user_id == current_user.id).order_by(Outfit.created_at.desc())
    )
    return [outfit_to_dict(o) for o in result.scalars().all()]


class OutfitCreateRequest(BaseModel):
    name:         Annotated[str,          Field(default="Nuovo Outfit", max_length=200)]
    garment_ids:  Annotated[list,         Field(default_factory=list, max_length=20)]
    occasion:     Annotated[Optional[str], Field(default=None, max_length=50)]
    season:       Annotated[Optional[str], Field(default=None, max_length=30)]
    rating:       Annotated[int,          Field(default=0, ge=0, le=5)]
    notes:        Annotated[Optional[str], Field(default=None, max_length=500)]
    transforms:   dict  = {}
    ai_generated: int   = 0


@app.post("/outfits")
async def create_outfit(
    data: OutfitCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    outfit = Outfit(
        user_id=current_user.id,
        name=data.name,
        garment_ids=data.garment_ids,
        occasion=data.occasion,
        season=data.season,
        rating=data.rating,
        notes=data.notes,
        transforms=data.transforms,
        ai_generated=data.ai_generated,
    )
    db.add(outfit)
    await db.commit()
    await db.refresh(outfit)
    return outfit_to_dict(outfit)


@app.delete("/outfits/{outfit_id}")
async def delete_outfit(
    outfit_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Outfit).where(Outfit.id == outfit_id))
    o = result.scalar_one_or_none()
    if not o:
        raise HTTPException(status_code=404, detail="Outfit non trovato")
    if o.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    await db.delete(o)
    await db.commit()
    return {"ok": True}


# ── Segna outfit come "abituale" ──────────────────────────────────────────────
class OutfitUsualRequest(BaseModel):
    is_usual: bool

@app.patch("/outfits/{outfit_id}/usual")
async def set_outfit_usual(
    outfit_id: int,
    data: OutfitUsualRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Outfit).where(Outfit.id == outfit_id))
    o = result.scalar_one_or_none()
    if not o:
        raise HTTPException(status_code=404, detail="Outfit non trovato")
    if o.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    o.is_usual = data.is_usual
    await db.commit()
    await db.refresh(o)
    return outfit_to_dict(o)


# ── Wear log endpoints ────────────────────────────────────────────────────────
class WearLogIn(BaseModel):
    note: Annotated[Optional[str], Field(default=None, max_length=300)]

@app.post("/outfits/{outfit_id}/wear")
async def log_wear(
    outfit_id: int,
    data: WearLogIn = WearLogIn(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Registra che l'utente ha indossato un outfit oggi."""
    result = await db.execute(select(Outfit).where(Outfit.id == outfit_id, Outfit.user_id == current_user.id))
    outfit = result.scalar_one_or_none()
    if not outfit:
        raise HTTPException(status_code=404, detail="Outfit non trovato")

    log = WearLog(
        user_id=current_user.id,
        outfit_id=outfit_id,
        outfit_name=outfit.name,
        note=data.note,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)

    # Conta totale utilizzi
    count_res = await db.execute(
        select(func.count(WearLog.id)).where(WearLog.outfit_id == outfit_id, WearLog.user_id == current_user.id)
    )
    return {"ok": True, "wear_count": count_res.scalar() or 0, "worn_on": log.worn_on}


@app.get("/outfits/wear-stats")
async def wear_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Statistiche di utilizzo per ogni outfit dell'utente + ultimi 10 log."""
    # Conta utilizzi per outfit
    counts_res = await db.execute(
        select(WearLog.outfit_id, func.count(WearLog.id).label("cnt"))
        .where(WearLog.user_id == current_user.id)
        .group_by(WearLog.outfit_id)
    )
    counts = {row.outfit_id: row.cnt for row in counts_res.all()}

    # Ultimi 10 log (storico recente)
    recent_res = await db.execute(
        select(WearLog).where(WearLog.user_id == current_user.id)
        .order_by(WearLog.worn_on.desc()).limit(10)
    )
    recent = [
        {"outfit_id": w.outfit_id, "outfit_name": w.outfit_name,
         "worn_on": w.worn_on.isoformat() if w.worn_on else None, "note": w.note}
        for w in recent_res.scalars().all()
    ]

    return {"counts": counts, "recent": recent}


# ── AI endpoints ──────────────────────────────────────────────────────────────
@app.post("/ai/generate-outfits")
async def ai_generate_outfits(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate AI outfit recommendations."""
    result = await db.execute(select(Garment).where(Garment.user_id == current_user.id))
    garments = [garment_to_dict(g) for g in result.scalars().all()]

    # Get user profile
    profile_result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = profile_result.scalar_one_or_none()
    profile_dict = None
    if profile:
        profile_dict = {
            "style_preferences": profile.style_preferences,
            "favorite_colors": profile.favorite_colors,
            "occasions": profile.occasions,
        }

    request_text = data.get("request", "")
    n = data.get("n", 3)

    outfits = await generate_outfit_recommendations(garments, profile_dict, request_text, n)
    return {"outfits": outfits}


@app.post("/ai/complete-outfit")
async def ai_complete_outfit(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Given selected garment IDs, suggest complementary garments + brand products to complete the outfit."""
    selected_ids: list = data.get("selected_ids", [])

    # Fetch all garments
    result = await db.execute(select(Garment).where(Garment.user_id == current_user.id))
    all_garments = [garment_to_dict(g) for g in result.scalars().all()]

    selected_garments = [g for g in all_garments if g["id"] in selected_ids]

    # Get user profile
    profile_result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = profile_result.scalar_one_or_none()
    profile_dict = None
    if profile:
        profile_dict = {
            "style_preferences": profile.style_preferences,
            "favorite_colors": profile.favorite_colors,
            "occasions": profile.occasions,
        }

    result_data = await complete_outfit(selected_garments, all_garments, profile_dict)

    # ── Suggerimenti brand ────────────────────────────────────────────────────
    # Raccoglie i tag dei capi selezionati per trovare prodotti brand coerenti
    covered_categories = {g["category"] for g in selected_garments}
    style_tags   = set(t for g in selected_garments for t in (g.get("style_tags")   or []))
    season_tags  = set(t for g in selected_garments for t in (g.get("season_tags")  or []))
    occasion_tags= set(t for g in selected_garments for t in (g.get("occasion_tags") or []))

    bp_result = await db.execute(
        select(BrandProduct, Brand.name.label("brand_name"))
        .join(Brand, Brand.id == BrandProduct.brand_id)
        .where(BrandProduct.active == True, Brand.active == True)
    )
    all_brand_products = bp_result.all()

    brand_suggestions = []
    used_categories: set = set()

    for row in all_brand_products:
        p, brand_name = row
        # Non suggerire categorie già coperte dall'outfit
        if p.category in covered_categories:
            continue
        # Non suggerire due prodotti della stessa categoria
        if p.category in used_categories:
            continue

        # Punteggio di affinità per tag
        p_style   = set(p.style_tags   or [])
        p_season  = set(p.season_tags  or [])
        p_occasion= set(p.occasion_tags or [])

        score = (
            len(p_style   & style_tags)   * 3 +
            len(p_season  & season_tags)  * 2 +
            len(p_occasion & occasion_tags) * 2
        )
        if score > 0:
            brand_suggestions.append((score, p, brand_name))

    # Ordina per score decrescente, prendi max 3
    brand_suggestions.sort(key=lambda x: x[0], reverse=True)
    brand_suggestions = brand_suggestions[:3]

    # Registra impressioni e costruisce la risposta
    brand_suggestions_out = []
    for _, p, brand_name in brand_suggestions:
        imp = BrandProductImpression(product_id=p.id, brand_id=p.brand_id, impression_type="suggestion")
        db.add(imp)
        brand_suggestions_out.append(brand_product_to_dict(p, brand_name))

    if brand_suggestions_out:
        await db.commit()

    result_data["brand_suggestions"] = brand_suggestions_out
    return result_data


_VALID_OCCASIONS = {"casual", "lavoro", "serata", "sport", "viaggio", "formale",
                    "work", "evening", "travel", "formal"}

class ChatMessage(BaseModel):
    message:  Annotated[str,          Field(min_length=1, max_length=2000)]
    history:  Annotated[list,         Field(default_factory=list, max_length=30)]
    language: Annotated[str,          Field(default='it', max_length=5, pattern=r'^(it|en)$')]
    weather:  Annotated[Optional[str], Field(default=None, max_length=120)]
    occasion: Annotated[Optional[str], Field(default=None, max_length=30)]

    @field_validator("occasion", mode="before")
    @classmethod
    def valid_occasion(cls, v):
        if v and v not in _VALID_OCCASIONS:
            return None   # ignora occasioni non riconosciute invece di bloccare
        return v

    @field_validator("history", mode="before")
    @classmethod
    def trim_history(cls, v):
        if isinstance(v, list):
            # Tronca ogni messaggio della history per evitare payload enormi
            cleaned = []
            for item in v[-30:]:
                if isinstance(item, dict):
                    role = str(item.get("role", ""))[:10]
                    content = str(item.get("content", ""))[:1000]
                    cleaned.append({"role": role, "content": content})
            return cleaned
        return []


@app.post("/ai/chat")
async def ai_chat(
    data: ChatMessage,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Garment).where(Garment.user_id == current_user.id))
    garments = [garment_to_dict(g) for g in result.scalars().all()]

    profile_result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = profile_result.scalar_one_or_none()
    profile_dict = vars(profile) if profile else None

    reply = await chat_with_stylist(data.message, garments, data.history, profile_dict, data.language)
    return {"reply": reply}


# ── Costanti rate limiting ────────────────────────────────────────────────────
# Chat Stylist AI — limiti alti durante beta gratuita
CHAT_DAILY_LIMIT_FREE          = 999
CHAT_WEEKLY_LIMIT_FREE         = 999
CHAT_DAILY_LIMIT_PREMIUM       = 999
CHAT_WEEKLY_LIMIT_PREMIUM      = 999
CHAT_DAILY_LIMIT_PREMIUM_PLUS  = 999
CHAT_WEEKLY_LIMIT_PREMIUM_PLUS = 999

# Shopping Advisor — limiti alti durante beta gratuita
SHOP_DAILY_LIMIT_FREE          = 999
SHOP_WEEKLY_LIMIT_FREE         = 999
SHOP_DAILY_LIMIT_PREMIUM       = 999
SHOP_WEEKLY_LIMIT_PREMIUM      = 999
SHOP_DAILY_LIMIT_PREMIUM_PLUS  = 999
SHOP_WEEKLY_LIMIT_PREMIUM_PLUS = 999

# Armocromia (solo settimanale — analisi costosa, limite conservativo)
ARMO_WEEKLY_LIMIT_FREE         = 0    # bloccato per free
ARMO_WEEKLY_LIMIT_PREMIUM      = 2    # analisi/settimana per Premium
ARMO_WEEKLY_LIMIT_PREMIUM_PLUS = 5    # analisi/settimana per Premium Plus

# Upload vestiti — limite giornaliero e settimanale per piano
UPLOAD_DAILY_LIMIT_FREE          = 10
UPLOAD_WEEKLY_LIMIT_FREE         = 40
UPLOAD_DAILY_LIMIT_PREMIUM       = 30
UPLOAD_WEEKLY_LIMIT_PREMIUM      = 120
UPLOAD_DAILY_LIMIT_PREMIUM_PLUS  = 100
UPLOAD_WEEKLY_LIMIT_PREMIUM_PLUS = 400

# Pacchetti upload extra (crediti one-time acquistabili)
UPLOAD_PACK_S = 40    # 2€
UPLOAD_PACK_M = 100   # 5€
UPLOAD_PACK_L = 300   # 10€

# Stripe Price ID pacchetti upload (impostare nelle env vars dopo creazione su Stripe)
STRIPE_PRICE_UPLOAD_S = os.getenv("STRIPE_PRICE_UPLOAD_S", "")
STRIPE_PRICE_UPLOAD_M = os.getenv("STRIPE_PRICE_UPLOAD_M", "")
STRIPE_PRICE_UPLOAD_L = os.getenv("STRIPE_PRICE_UPLOAD_L", "")


async def _maybe_expire_plan(user: User, db: AsyncSession) -> None:
    """Se il piano corrente è scaduto, applica il downgrade schedulato (default: free)."""
    if not user.plan_expires_at or (user.plan or 'free') == 'free':
        return
    expires = user.plan_expires_at
    if expires.tzinfo is None:
        from datetime import timezone as _tz
        expires = expires.replace(tzinfo=_tz.utc)
    if datetime.now(timezone.utc) > expires:
        user.plan                   = user.scheduled_downgrade_to or 'free'
        user.plan_expires_at        = None
        user.plan_started_at        = None
        user.scheduled_downgrade_to = None
        await db.commit()
        # Dopo il commit SQLAlchemy scade gli attributi dell'oggetto.
        # È necessario ricaricarli per consentire al chiamante di leggere i valori aggiornati.
        await db.refresh(user)


def _check_and_increment_quota(user: User) -> dict:
    """Controlla limite giornaliero e settimanale, resetta se necessario, incrementa.
    Ritorna dict con remaining_day e remaining_week (-1 = illimitato).
    Lancia HTTPException 429 se uno dei due limiti è superato.
    """
    plan = user.plan or 'free'
    # Normalizza varianti annuali alle corrispondenti mensili
    if plan == 'premium_annual':      plan = 'premium'
    if plan == 'premium_plus_annual': plan = 'premium_plus'

    # Premium Plus: 50/giorno, 225/settimana
    if plan == 'premium_plus':
        now = datetime.now(timezone.utc)
        if user.chat_reset_at is None or user.chat_reset_at.date() < now.date():
            user.chat_count    = 0
            user.chat_reset_at = now
        week_start = (now - timedelta(days=now.weekday())).date()
        if user.chat_week_reset_at is None or user.chat_week_reset_at.date() < week_start:
            user.chat_week_count    = 0
            user.chat_week_reset_at = now
        day_count  = user.chat_count      or 0
        week_count = user.chat_week_count or 0
        if day_count >= CHAT_DAILY_LIMIT_PREMIUM_PLUS:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Hai esaurito le {CHAT_DAILY_LIMIT_PREMIUM_PLUS} richieste giornaliere Premium Plus. "
                    "Riprova domani."
                ),
            )
        if week_count >= CHAT_WEEKLY_LIMIT_PREMIUM_PLUS:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Hai esaurito le {CHAT_WEEKLY_LIMIT_PREMIUM_PLUS} richieste settimanali Premium Plus. "
                    "Riprova la prossima settimana."
                ),
            )
        user.chat_count      = day_count  + 1
        user.chat_week_count = week_count + 1
        return {
            "remaining_day":  max(0, CHAT_DAILY_LIMIT_PREMIUM_PLUS  - user.chat_count),
            "remaining_week": max(0, CHAT_WEEKLY_LIMIT_PREMIUM_PLUS - user.chat_week_count),
        }

    # Premium: 30/giorno, 200/settimana
    if plan == 'premium':
        now = datetime.now(timezone.utc)
        if user.chat_reset_at is None or user.chat_reset_at.date() < now.date():
            user.chat_count    = 0
            user.chat_reset_at = now
        week_start = (now - timedelta(days=now.weekday())).date()
        if user.chat_week_reset_at is None or user.chat_week_reset_at.date() < week_start:
            user.chat_week_count    = 0
            user.chat_week_reset_at = now
        day_count  = user.chat_count      or 0
        week_count = user.chat_week_count or 0
        if day_count >= CHAT_DAILY_LIMIT_PREMIUM:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Hai esaurito le {CHAT_DAILY_LIMIT_PREMIUM} richieste giornaliere Premium. "
                    "Riprova domani o passa a Premium Plus."
                ),
            )
        if week_count >= CHAT_WEEKLY_LIMIT_PREMIUM:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Hai esaurito le {CHAT_WEEKLY_LIMIT_PREMIUM} richieste settimanali Premium. "
                    "Riprova la prossima settimana."
                ),
            )
        user.chat_count      = day_count  + 1
        user.chat_week_count = week_count + 1
        return {
            "remaining_day":  max(0, CHAT_DAILY_LIMIT_PREMIUM  - user.chat_count),
            "remaining_week": max(0, CHAT_WEEKLY_LIMIT_PREMIUM - user.chat_week_count),
        }

    # Free
    now = datetime.now(timezone.utc)

    # ── Reset giornaliero ────────────────────────────────────────────────────
    if user.chat_reset_at is None or user.chat_reset_at.date() < now.date():
        user.chat_count    = 0
        user.chat_reset_at = now

    # ── Reset settimanale (lunedì) ───────────────────────────────────────────
    week_start = (now - timedelta(days=now.weekday())).date()
    if user.chat_week_reset_at is None or user.chat_week_reset_at.date() < week_start:
        user.chat_week_count    = 0
        user.chat_week_reset_at = now

    day_count  = user.chat_count      or 0
    week_count = user.chat_week_count or 0

    # ── Controllo giornaliero ────────────────────────────────────────────────
    if day_count >= CHAT_DAILY_LIMIT_FREE:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Hai esaurito le {CHAT_DAILY_LIMIT_FREE} richieste giornaliere gratuite. "
                "Riprova domani o passa a Premium."
            ),
        )
    # ── Controllo settimanale ────────────────────────────────────────────────
    if week_count >= CHAT_WEEKLY_LIMIT_FREE:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Hai esaurito le {CHAT_WEEKLY_LIMIT_FREE} richieste settimanali gratuite. "
                "Riprova la prossima settimana o passa a Premium."
            ),
        )

    user.chat_count      = day_count  + 1
    user.chat_week_count = week_count + 1
    return {
        "remaining_day":  max(0, CHAT_DAILY_LIMIT_FREE  - user.chat_count),
        "remaining_week": max(0, CHAT_WEEKLY_LIMIT_FREE - user.chat_week_count),
    }


def _check_and_increment_shopping_quota(user: User) -> dict:
    """Controlla e incrementa la quota Shopping Advisor (giornaliera + settimanale).
    Ritorna remaining_day e remaining_week. Lancia HTTPException 429 se esaurita.
    """
    plan = user.plan or 'free'
    if plan == 'premium_annual':      plan = 'premium'
    if plan == 'premium_plus_annual': plan = 'premium_plus'

    if plan == 'premium_plus':
        daily_lim, weekly_lim = SHOP_DAILY_LIMIT_PREMIUM_PLUS, SHOP_WEEKLY_LIMIT_PREMIUM_PLUS
    elif plan == 'premium':
        daily_lim, weekly_lim = SHOP_DAILY_LIMIT_PREMIUM, SHOP_WEEKLY_LIMIT_PREMIUM
    else:
        daily_lim, weekly_lim = SHOP_DAILY_LIMIT_FREE, SHOP_WEEKLY_LIMIT_FREE

    now = datetime.now(timezone.utc)
    # reset giornaliero
    if user.shopping_reset_at is None or user.shopping_reset_at.date() < now.date():
        user.shopping_count    = 0
        user.shopping_reset_at = now
    # reset settimanale (lunedì)
    week_start = (now - timedelta(days=now.weekday())).date()
    if user.shopping_week_reset_at is None or user.shopping_week_reset_at.date() < week_start:
        user.shopping_week_count    = 0
        user.shopping_week_reset_at = now

    day_count  = user.shopping_count      or 0
    week_count = user.shopping_week_count or 0

    if day_count >= daily_lim:
        raise HTTPException(status_code=429, detail=(
            f"Hai esaurito le {daily_lim} analisi Shopping Advisor giornaliere. "
            "Riprova domani" + ("." if plan != 'free' else " o passa a Premium.")
        ))
    if week_count >= weekly_lim:
        raise HTTPException(status_code=429, detail=(
            f"Hai esaurito le {weekly_lim} analisi Shopping Advisor settimanali. "
            "Riprova la prossima settimana" + ("." if plan != 'free' else " o passa a Premium.")
        ))

    user.shopping_count      = day_count  + 1
    user.shopping_week_count = week_count + 1
    return {
        "remaining_day":  max(0, daily_lim  - user.shopping_count),
        "remaining_week": max(0, weekly_lim - user.shopping_week_count),
    }


def _check_and_increment_armocromia_quota(user: User) -> dict:
    """Controlla e incrementa la quota Armocromia (solo settimanale).
    Free users sono bloccati a livello endpoint (Premium gate).
    Lancia HTTPException 429 se esaurita.
    """
    plan = user.plan or 'free'
    if plan == 'premium_annual':      plan = 'premium'
    if plan == 'premium_plus_annual': plan = 'premium_plus'

    if plan == 'premium_plus':
        weekly_lim = ARMO_WEEKLY_LIMIT_PREMIUM_PLUS
    elif plan == 'premium':
        weekly_lim = ARMO_WEEKLY_LIMIT_PREMIUM
    else:
        # free — bloccato dal Premium gate, ma per sicurezza
        raise HTTPException(status_code=403, detail="L'analisi armocromia richiede un piano Premium.")

    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=now.weekday())).date()
    if user.armocromia_week_reset_at is None or user.armocromia_week_reset_at.date() < week_start:
        user.armocromia_week_count    = 0
        user.armocromia_week_reset_at = now

    week_count = user.armocromia_week_count or 0
    if week_count >= weekly_lim:
        raise HTTPException(status_code=429, detail=(
            f"Hai esaurito le {weekly_lim} analisi armocromia settimanali. "
            "Riprova la prossima settimana."
        ))

    user.armocromia_week_count = week_count + 1
    return {
        "remaining_week": max(0, weekly_lim - user.armocromia_week_count),
        "limit_week":     weekly_lim,
    }


def _check_and_increment_upload_quota(user: User) -> dict:
    """Controlla solo il limite GIORNALIERO degli upload vestiti (il settimanale è rimosso).
    Scala automaticamente i contatori, decurta crediti extra se il giornaliero è esaurito.
    Lancia HTTPException 429 solo se giornaliero E crediti extra sono entrambi esauriti.
    Ritorna dict con remaining_day, upload_extra.
    """
    plan = user.plan or 'free'
    if plan == 'premium_annual':      plan = 'premium'
    if plan == 'premium_plus_annual': plan = 'premium_plus'

    if plan == 'premium_plus':
        daily_lim = UPLOAD_DAILY_LIMIT_PREMIUM_PLUS
    elif plan == 'premium':
        daily_lim = UPLOAD_DAILY_LIMIT_PREMIUM
    else:
        daily_lim = UPLOAD_DAILY_LIMIT_FREE

    now = datetime.now(timezone.utc)

    # Reset giornaliero
    if user.upload_reset_at is None or user.upload_reset_at.date() < now.date():
        user.upload_count    = 0
        user.upload_reset_at = now

    day_count = user.upload_count or 0
    extra     = user.upload_extra or 0

    # Entro il limite giornaliero → incrementa contatore normale
    if day_count < daily_lim:
        user.upload_count = day_count + 1
    elif extra > 0:
        # Limite giornaliero esaurito ma ha crediti extra → consuma 1 credito extra
        user.upload_extra = extra - 1
    else:
        # Nessun credito disponibile
        raise HTTPException(status_code=429, detail=(
            f"Hai raggiunto il limite di {daily_lim} upload giornalieri. "
            "Riprova domani o acquista un pacchetto upload extra."
        ))

    return {
        "remaining_day": max(0, daily_lim - (user.upload_count or 0)),
        "limit_day":     daily_lim,
        "upload_extra":  user.upload_extra or 0,
    }


# ── Chat streaming (SSE) ──────────────────────────────────────────────────────
@app.post("/ai/chat-stream")
async def ai_chat_stream(
    data: ChatMessage,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Streaming SSE della chat stylist. Ogni token viene inviato appena disponibile."""
    remaining = _check_and_increment_quota(current_user)
    await db.commit()

    result = await db.execute(select(Garment).where(Garment.user_id == current_user.id))
    garments = [garment_to_dict(g) for g in result.scalars().all()]

    profile_result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = profile_result.scalar_one_or_none()
    profile_dict = vars(profile) if profile else None

    # Outfit abituali (is_usual=True) — stile di vita dell'utente
    usual_res = await db.execute(
        select(Outfit).where(Outfit.user_id == current_user.id, Outfit.is_usual == True).limit(10)
    )
    usual_outfits = [{"name": o.name, "garment_ids": o.garment_ids or []} for o in usual_res.scalars().all()]

    # Storico indossato (ultimi 15 log) — abitudini reali dell'utente
    wear_res = await db.execute(
        select(WearLog).where(WearLog.user_id == current_user.id)
        .order_by(WearLog.worn_on.desc()).limit(15)
    )
    wear_history = [{"name": w.outfit_name, "date": w.worn_on.date().isoformat()} for w in wear_res.scalars().all() if w.outfit_name]

    # Carica prodotti brand partner (per suggerimenti quando l'armadio è incompleto)
    brand_result = await db.execute(select(Brand).where(Brand.active == True))
    brand_names  = {b.id: b.name for b in brand_result.scalars().all()}

    # Carica feedback negativi dell'utente (da escludere dai suggerimenti)
    dislike_result = await db.execute(
        select(BrandProductFeedback, BrandProduct.name)
        .join(BrandProduct, BrandProductFeedback.product_id == BrandProduct.id)
        .where(BrandProductFeedback.user_id == current_user.id, BrandProductFeedback.vote == 'dislike')
        .limit(50)
    )
    disliked_ids = set()
    dislike_notes = []  # per il prompt AI
    for fb, prod_name in dislike_result.all():
        disliked_ids.add(fb.product_id)
        note = f"- {prod_name}"
        if fb.reason:
            note += f" (motivo: {fb.reason})"
        dislike_notes.append(note)

    prod_result  = await db.execute(select(BrandProduct).where(BrandProduct.active == True).limit(25))
    brand_products = [
        {
            'id':         p.id,
            'brand_id':   p.brand_id,
            'name':       p.name,
            'category':   p.category,
            'price':      p.price,
            'buy_url':    p.buy_url,
            'image_url':  p.image_url,
            'brand_name': brand_names.get(p.brand_id, ''),
            'style_tags':   p.style_tags   or [],
            'season_tags':  p.season_tags  or [],
            'occasion_tags': p.occasion_tags or [],
        }
        for p in prod_result.scalars().all()
    ]
    # Escludi prodotti già rifiutati dall'utente
    brand_products = [p for p in brand_products if p['id'] not in disliked_ids]
    product_map = {p['id']: p for p in brand_products}

    async def generate():
        accumulated = ''
        try:
            async for token in stream_chat_with_stylist(
                data.message, garments, data.history, profile_dict, data.language,
                brand_products=brand_products,
                dislike_notes=dislike_notes,
                weather=data.weather,
                occasion=data.occasion,
                usual_outfits=usual_outfits,
                wear_history=wear_history,
            ):
                accumulated += token
                yield f"data: {json.dumps({'t': 'tok', 'v': token})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'t': 'err', 'v': str(exc)})}\n\n"
        finally:
            # Estrae eventuali prodotti brand suggeriti dall'AI e li invia come evento separato
            import re as _re
            bp_match = _re.search(r'<BRAND_PRODUCTS>([\s\S]*?)</BRAND_PRODUCTS>', accumulated)
            suggested_products = []
            if bp_match:
                try:
                    ids = json.loads(bp_match.group(1))
                    suggested_products = [product_map[i] for i in ids if i in product_map]
                except Exception:
                    pass

            # Traccia le impressioni per i prodotti suggeriti
            for p in suggested_products:
                try:
                    db.add(BrandProductImpression(
                        product_id=p['id'],
                        brand_id=p['brand_id'],
                        impression_type='suggestion',
                    ))
                except Exception:
                    pass

            yield f"data: {json.dumps({'t': 'done', 'remaining_day': remaining['remaining_day'], 'remaining_week': remaining['remaining_week'], 'brand_products': suggested_products})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Quota chat utente ─────────────────────────────────────────────────────────
class UsernameUpdateRequest(BaseModel):
    username: Annotated[str, Field(min_length=3, max_length=30)]

@app.patch("/user/username")
async def update_username(
    data: UsernameUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Imposta o aggiorna lo username dell'utente. Ritorna 409 se già in uso."""
    new_username = data.username.strip().lower()
    # Valida formato
    if not _re.match(r'^[a-zA-Z0-9_.-]+$', new_username):
        raise HTTPException(400, "Username può contenere solo lettere, numeri, _, . e -")
    # Controlla unicità (esclude l'utente corrente)
    result = await db.execute(
        select(User).where(User.username == new_username, User.id != current_user.id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(409, "Username già in uso, scegline un altro")
    current_user.username = new_username
    await db.commit()
    await db.refresh(current_user)
    return {"username": current_user.username}


class PhoneUpdateRequest(BaseModel):
    phone: Annotated[Optional[str], Field(default=None, max_length=20)]

@app.patch("/user/phone")
async def update_phone(
    data: PhoneUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggiorna o rimuove il numero di telefono dell'utente."""
    phone = (data.phone or '').strip() or None
    current_user.phone = phone
    await db.commit()
    await db.refresh(current_user)
    return {"phone": current_user.phone}


@app.get("/user/chat-quota")
async def get_chat_quota(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Controlla scadenza piano prima di rispondere
    await _maybe_expire_plan(current_user, db)

    raw_plan = current_user.plan or 'free'
    plan = raw_plan
    # Normalizza varianti annuali
    if plan == 'premium_annual':      plan = 'premium'
    if plan == 'premium_plus_annual': plan = 'premium_plus'
    now  = datetime.now(timezone.utc)

    # Campi comuni scadenza/downgrade
    expires_iso  = current_user.plan_expires_at.isoformat() if current_user.plan_expires_at else None
    downgrade_to = current_user.scheduled_downgrade_to
    week_start   = (now - timedelta(days=now.weekday())).date()

    # ── Chat giornaliero/settimanale ──────────────────────────────────────────
    day_reset  = (current_user.chat_reset_at is None or current_user.chat_reset_at.date() < now.date())
    day_count  = 0 if day_reset  else (current_user.chat_count      or 0)
    week_reset = (current_user.chat_week_reset_at is None or current_user.chat_week_reset_at.date() < week_start)
    week_count = 0 if week_reset else (current_user.chat_week_count or 0)

    # ── Shopping giornaliero/settimanale ─────────────────────────────────────
    sh_day_reset  = (current_user.shopping_reset_at is None or current_user.shopping_reset_at.date() < now.date())
    sh_day_count  = 0 if sh_day_reset  else (current_user.shopping_count      or 0)
    sh_week_reset = (current_user.shopping_week_reset_at is None or current_user.shopping_week_reset_at.date() < week_start)
    sh_week_count = 0 if sh_week_reset else (current_user.shopping_week_count or 0)

    # ── Armocromia settimanale ────────────────────────────────────────────────
    ar_week_reset = (current_user.armocromia_week_reset_at is None or current_user.armocromia_week_reset_at.date() < week_start)
    ar_week_count = 0 if ar_week_reset else (current_user.armocromia_week_count or 0)

    # ── Upload vestiti giornaliero/settimanale ────────────────────────────────
    up_day_reset  = (current_user.upload_reset_at is None or current_user.upload_reset_at.date() < now.date())
    up_day_count  = 0 if up_day_reset  else (current_user.upload_count      or 0)
    up_week_reset = (current_user.upload_week_reset_at is None or current_user.upload_week_reset_at.date() < week_start)
    up_week_count = 0 if up_week_reset else (current_user.upload_week_count or 0)
    up_extra      = current_user.upload_extra or 0

    if plan == 'premium_plus':
        return {
            "plan":                   raw_plan,
            "remaining":              max(0, CHAT_DAILY_LIMIT_PREMIUM_PLUS  - day_count),
            "remaining_day":          max(0, CHAT_DAILY_LIMIT_PREMIUM_PLUS  - day_count),
            "remaining_week":         max(0, CHAT_WEEKLY_LIMIT_PREMIUM_PLUS - week_count),
            "limit_day":              CHAT_DAILY_LIMIT_PREMIUM_PLUS,
            "limit_week":             CHAT_WEEKLY_LIMIT_PREMIUM_PLUS,
            "shopping_remaining_day":  max(0, SHOP_DAILY_LIMIT_PREMIUM_PLUS  - sh_day_count),
            "shopping_remaining_week": max(0, SHOP_WEEKLY_LIMIT_PREMIUM_PLUS - sh_week_count),
            "shopping_limit_day":      SHOP_DAILY_LIMIT_PREMIUM_PLUS,
            "shopping_limit_week":     SHOP_WEEKLY_LIMIT_PREMIUM_PLUS,
            "armo_remaining_week":     max(0, ARMO_WEEKLY_LIMIT_PREMIUM_PLUS - ar_week_count),
            "armo_limit_week":         ARMO_WEEKLY_LIMIT_PREMIUM_PLUS,
            "upload_remaining_day":    max(0, UPLOAD_DAILY_LIMIT_PREMIUM_PLUS  - up_day_count),
            "upload_remaining_week":   max(0, UPLOAD_WEEKLY_LIMIT_PREMIUM_PLUS - up_week_count),
            "upload_limit_day":        UPLOAD_DAILY_LIMIT_PREMIUM_PLUS,
            "upload_limit_week":       UPLOAD_WEEKLY_LIMIT_PREMIUM_PLUS,
            "upload_extra":            up_extra,
            "plan_expires_at":         expires_iso,
            "scheduled_downgrade_to":  downgrade_to,
        }
    if plan == 'premium':
        return {
            "plan":                   raw_plan,
            "remaining":              max(0, CHAT_DAILY_LIMIT_PREMIUM  - day_count),
            "remaining_day":          max(0, CHAT_DAILY_LIMIT_PREMIUM  - day_count),
            "remaining_week":         max(0, CHAT_WEEKLY_LIMIT_PREMIUM - week_count),
            "limit_day":              CHAT_DAILY_LIMIT_PREMIUM,
            "limit_week":             CHAT_WEEKLY_LIMIT_PREMIUM,
            "shopping_remaining_day":  max(0, SHOP_DAILY_LIMIT_PREMIUM  - sh_day_count),
            "shopping_remaining_week": max(0, SHOP_WEEKLY_LIMIT_PREMIUM - sh_week_count),
            "shopping_limit_day":      SHOP_DAILY_LIMIT_PREMIUM,
            "shopping_limit_week":     SHOP_WEEKLY_LIMIT_PREMIUM,
            "armo_remaining_week":     max(0, ARMO_WEEKLY_LIMIT_PREMIUM - ar_week_count),
            "armo_limit_week":         ARMO_WEEKLY_LIMIT_PREMIUM,
            "upload_remaining_day":    max(0, UPLOAD_DAILY_LIMIT_PREMIUM  - up_day_count),
            "upload_remaining_week":   max(0, UPLOAD_WEEKLY_LIMIT_PREMIUM - up_week_count),
            "upload_limit_day":        UPLOAD_DAILY_LIMIT_PREMIUM,
            "upload_limit_week":       UPLOAD_WEEKLY_LIMIT_PREMIUM,
            "upload_extra":            up_extra,
            "plan_expires_at":         expires_iso,
            "scheduled_downgrade_to":  downgrade_to,
        }
    # free
    return {
        "plan":                   raw_plan,
        "remaining":              max(0, CHAT_DAILY_LIMIT_FREE  - day_count),
        "remaining_day":          max(0, CHAT_DAILY_LIMIT_FREE  - day_count),
        "remaining_week":         max(0, CHAT_WEEKLY_LIMIT_FREE - week_count),
        "limit_day":              CHAT_DAILY_LIMIT_FREE,
        "limit_week":             CHAT_WEEKLY_LIMIT_FREE,
        "shopping_remaining_day":  max(0, SHOP_DAILY_LIMIT_FREE  - sh_day_count),
        "shopping_remaining_week": max(0, SHOP_WEEKLY_LIMIT_FREE - sh_week_count),
        "shopping_limit_day":      SHOP_DAILY_LIMIT_FREE,
        "shopping_limit_week":     SHOP_WEEKLY_LIMIT_FREE,
        "armo_remaining_week":     0,
        "armo_limit_week":         0,
        "upload_remaining_day":    max(0, UPLOAD_DAILY_LIMIT_FREE  - up_day_count),
        "upload_remaining_week":   max(0, UPLOAD_WEEKLY_LIMIT_FREE - up_week_count),
        "upload_limit_day":        UPLOAD_DAILY_LIMIT_FREE,
        "upload_limit_week":       UPLOAD_WEEKLY_LIMIT_FREE,
        "upload_extra":            up_extra,
        "plan_expires_at":         None,
        "scheduled_downgrade_to":  None,
    }


# ── Shopping Advisor ──────────────────────────────────────────────────────────
@app.post("/ai/shopping-advisor")
@limiter.limit("20/minute")
async def shopping_advisor(
    request: Request,
    photo_front: UploadFile = File(...),
    language: str = Form("it"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Analizza un capo esterno per valutarne la compatibilità con l'armadio.
    Quota separata dallo stylist: Free 1/giorno · 4/settimana.
    """
    await _maybe_expire_plan(current_user, db)
    remaining = _check_and_increment_shopping_quota(current_user)
    await db.commit()

    # Salva la foto in tmp (non nell'armadio)
    import tempfile, shutil
    suffix = os.path.splitext(photo_front.filename or "photo.jpg")[1] or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(photo_front.file, tmp)
        tmp_path = tmp.name

    try:
        from ai_service import analyze_garment, client_shopping, VISION_MODEL, encode_image
        import base64, io as _io
        from PIL import Image as _PIL

        # Usa client_shopping per l'analisi
        analysis = await analyze_garment(
            photo_front=tmp_path,
            language=language,
        )
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    return {
        "analysis":             analysis,
        "remaining_day":        remaining.get("remaining_day", 0),
        "remaining_week":       remaining.get("remaining_week", 0),
        "shopping_limit_day":   (SHOP_DAILY_LIMIT_PREMIUM_PLUS  if (current_user.plan or '').startswith('premium_plus')
                                 else SHOP_DAILY_LIMIT_PREMIUM   if (current_user.plan or '').startswith('premium')
                                 else SHOP_DAILY_LIMIT_FREE),
        "shopping_limit_week":  (SHOP_WEEKLY_LIMIT_PREMIUM_PLUS if (current_user.plan or '').startswith('premium_plus')
                                 else SHOP_WEEKLY_LIMIT_PREMIUM  if (current_user.plan or '').startswith('premium')
                                 else SHOP_WEEKLY_LIMIT_FREE),
    }


# ── Upgrade piano ─────────────────────────────────────────────────────────────
# ⚠️  NOTA DI SICUREZZA: In produzione questo endpoint DEVE essere chiamato
#     esclusivamente tramite webhook Stripe verificato (firma HMAC-SHA256).
#     Il chiamante deve fornire `stripe-signature` validata prima di modificare
#     il piano. In ambiente demo/dev è aperto a qualsiasi utente autenticato.
class UpgradePlanRequest(BaseModel):
    plan: str  # 'free' | 'premium' | 'premium_plus' | 'premium_annual' | 'premium_plus_annual'

def _plan_expiry_response(user: User) -> dict:
    """Helper: restituisce i campi comuni di risposta upgrade."""
    return {
        "ok":                     True,
        "plan":                   user.plan,
        "plan_expires_at":        user.plan_expires_at.isoformat() if user.plan_expires_at else None,
        "scheduled_downgrade_to": user.scheduled_downgrade_to,
    }

@app.post("/user/upgrade")
@limiter.limit("30/minute")   # override del default 5/15min — questa route è interattiva
async def upgrade_plan(
    request: Request,
    body: UpgradePlanRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Gestisce upgrade, downgrade schedulato e cambio ciclo (mensile ↔ annuale).

    Logica downgrade:
      - "free" non revoca il piano immediatamente; schedula la revoca a plan_expires_at.
      - Se plan_expires_at è già passato (o non esiste) → revoca immediata.

    Logica upgrade / cambio ciclo:
      - Qualsiasi piano a pagamento imposta plan_started_at = now e plan_expires_at = now + durata.
      - Il passaggio da mensile ad annuale (stesso livello) estende subito la scadenza a 365 gg.
      - Il passaggio da un livello inferiore a uno superiore è immediato (senza prorate).
      - Cancella eventuali downgrade schedulati.
    """
    now = datetime.now(timezone.utc)
    valid_plans = {'free', 'premium', 'premium_annual', 'premium_plus', 'premium_plus_annual'}
    if body.plan not in valid_plans:
        raise HTTPException(
            status_code=400,
            detail=f"Piano non valido. Valori accettati: {sorted(valid_plans)}",
        )

    current = current_user.plan or 'free'

    # ── Downgrade al Free ─────────────────────────────────────────────────────
    if body.plan == 'free':
        if current == 'free' and not current_user.scheduled_downgrade_to:
            # Già free
            return _plan_expiry_response(current_user)

        # Annulla un downgrade già schedulato? No → è idempotente
        if current_user.scheduled_downgrade_to == 'free':
            return _plan_expiry_response(current_user)

        # Se non c'è scadenza o è già passata → downgrade immediato
        expires = current_user.plan_expires_at
        if expires:
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
        if not expires or datetime.now(timezone.utc) > expires:
            current_user.plan                   = 'free'
            current_user.plan_expires_at        = None
            current_user.plan_started_at        = None
            current_user.scheduled_downgrade_to = None
        else:
            # Schedula il downgrade a scadenza — il piano rimane attivo
            current_user.scheduled_downgrade_to = 'free'

        await db.commit()
        return _plan_expiry_response(current_user)

    # ── Stesso piano + stesso ciclo, nessun downgrade schedulato ─────────────
    if current == body.plan and not current_user.scheduled_downgrade_to:
        return _plan_expiry_response(current_user)

    # ── Upgrade / cambio ciclo ────────────────────────────────────────────────
    if body.plan.endswith('_annual'):
        # L'anno parte dalla fine dell'abbonamento attuale (se ancora valido),
        # così l'utente non perde i giorni già pagati.
        base = current_user.plan_expires_at
        if base:
            if base.tzinfo is None:
                from datetime import timezone as _tz
                base = base.replace(tzinfo=_tz.utc)
            if base < now:
                base = now   # scaduto: parte da oggi
        else:
            base = now
        new_expires = base + timedelta(days=365)
    else:
        new_expires = now + timedelta(days=30)

    current_user.plan                   = body.plan
    current_user.plan_started_at        = now
    current_user.plan_expires_at        = new_expires
    current_user.scheduled_downgrade_to = None   # cancella eventuale downgrade pendente
    await db.commit()
    return _plan_expiry_response(current_user)


# ── Annulla downgrade schedulato ──────────────────────────────────────────────
@app.delete("/user/scheduled-downgrade")
@limiter.limit("30/minute")
async def cancel_scheduled_downgrade(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancella il downgrade schedulato (es. "Torna al Free") e rinnova la scadenza.
    Il piano corrente rimane invariato; la scadenza viene estesa di 30 o 365 giorni
    in base al ciclo del piano attivo."""
    if not current_user.scheduled_downgrade_to:
        return _plan_expiry_response(current_user)   # nulla da annullare

    now = datetime.now(timezone.utc)
    duration = timedelta(days=365) if (current_user.plan or '').endswith('_annual') else timedelta(days=30)

    current_user.scheduled_downgrade_to = None
    current_user.plan_started_at        = now
    current_user.plan_expires_at        = now + duration
    await db.commit()
    return _plan_expiry_response(current_user)


# ── Import endpoint ───────────────────────────────────────────────────────────
class ImportData(BaseModel):
    garments: Annotated[list, Field(default_factory=list, max_length=200)]
    outfits:  Annotated[list, Field(default_factory=list, max_length=100)]


@app.post("/import")
async def import_wardrobe(
    data: ImportData,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    created_garments = 0
    created_outfits  = 0

    for gd in data.garments:
        g = Garment(
            user_id=current_user.id,
            name=gd.get('name', 'Capo importato'),
            category=gd.get('category', 'altro'),
            brand=gd.get('brand'),
            color_primary=gd.get('color_primary'),
            color_hex=gd.get('color_hex'),
            size=gd.get('size'),
            price=gd.get('price'),
            material=gd.get('material'),
            description=gd.get('description'),
            style_tags=gd.get('style_tags', []),
            season_tags=gd.get('season_tags', []),
            occasion_tags=gd.get('occasion_tags', []),
            bg_status='none',
            tryon_status='none',
        )
        db.add(g)
        created_garments += 1

    await db.flush()

    for od in data.outfits:
        o = Outfit(
            user_id=current_user.id,
            name=od.get('name', 'Outfit importato'),
            occasion=od.get('occasion'),
            season=od.get('season'),
            rating=od.get('rating'),
            notes=od.get('notes'),
            garment_ids=od.get('garment_ids', []),
            transforms=od.get('transforms', {}),
            ai_generated=od.get('ai_generated', False),
        )
        db.add(o)
        created_outfits += 1

    await db.commit()
    return {"garments_created": created_garments, "outfits_created": created_outfits}


# ── User profile endpoints ────────────────────────────────────────────────────
@app.get("/profile")
async def get_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        return {}
    return {
        "id": profile.id,
        "name": profile.name,
        "gender": profile.gender,
        # misure corporee
        "height_cm": profile.height_cm,
        "weight_kg": profile.weight_kg,
        "chest_cm": profile.chest_cm,
        "waist_cm": profile.waist_cm,
        "hips_cm": profile.hips_cm,
        "shoulder_width_cm": profile.shoulder_width_cm,
        "arm_length_cm": profile.arm_length_cm,
        "leg_length_cm": profile.leg_length_cm,
        "neck_cm": profile.neck_cm,
        "thigh_cm": profile.thigh_cm,
        "shoe_size": profile.shoe_size,
        # foto profilo pubblica
        "profile_picture": profile.profile_picture or None,
        # armocromia (Premium)
        "face_photo_1": profile.face_photo_1 or None,
        "armocromia_season": profile.armocromia_season or None,
        "armocromia_notes": profile.armocromia_notes or None,
        # stile
        "body_type": profile.body_type,
        "style_preferences": profile.style_preferences or [],
        "favorite_colors": profile.favorite_colors or [],
        "occasions": profile.occasions or [],
    }


@app.post("/profile")
async def upsert_profile(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
    for key, value in data.items():
        if hasattr(profile, key):
            setattr(profile, key, value)
    await db.commit()
    await db.refresh(profile)
    return {"ok": True}


# ── Try-on endpoints ──────────────────────────────────────────────────────────
@app.post("/profile/face-photo/{slot}")
async def upload_face_photo(
    slot: int,
    photo: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Carica una foto viso (slot 1 o 2) per migliorare la credibilità del try-on."""
    if slot not in (1, 2):
        raise HTTPException(status_code=400, detail="Slot deve essere 1 o 2")
    filename = await save_upload(photo, f"face{slot}")
    path = f"/uploads/{filename}"

    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
    if slot == 1:
        profile.face_photo_1 = path
    else:
        profile.face_photo_2 = path
    await db.commit()
    return {"ok": True, f"face_photo_{slot}": path}


@app.post("/profile/armocromia-analyze")
async def analyze_armocromia(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Analizza la foto viso (face_photo_1) per determinare la stagione cromatica.
    Richiede piano Premium o superiore.
    """
    # Verifica piano Premium
    if current_user.plan not in ("premium", "premium_annual", "premium_plus", "premium_plus_annual"):
        raise HTTPException(status_code=403, detail="Armocromia analysis requires a Premium plan.")
    # Verifica quota settimanale armocromia
    armo_quota = _check_and_increment_armocromia_quota(current_user)

    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile or not profile.face_photo_1:
        raise HTTPException(status_code=400, detail="Upload a face photo first.")

    # Chiamata GPT-4o Vision per analisi armocromia
    import openai as openai_lib
    import base64, httpx

    photo_path = profile.face_photo_1
    # Carica l'immagine come base64
    abs_path = os.path.join(UPLOAD_DIR, os.path.basename(photo_path))
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="Face photo file not found.")

    with open(abs_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()

    ext = os.path.splitext(abs_path)[1].lower()
    mime = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png" if ext == ".png" else "image/webp"

    ai_client = openai_lib.AsyncOpenAI(api_key=os.getenv("OPENAI_KEY_ARMOCROMIA"))
    try:
        resp = await ai_client.chat.completions.create(
            model="gpt-4o",
            max_tokens=400,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Sei un esperto di armocromia (analisi del colore stagionale). "
                            "Analizza il viso in questa foto e determina la stagione cromatica dell'utente "
                            "tra: Primavera Chiara, Primavera Calda, Estate Chiara, Estate Fredda, "
                            "Autunno Caldo, Autunno Scuro, Inverno Freddo, Inverno Scuro. "
                            "Rispondi SOLO con questo JSON (nient'altro): "
                            '{\"season\": \"<nome stagione>\", \"notes\": \"<2-3 frasi su undertone, colori ideali e da evitare>\"}'
                        )
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{img_b64}", "detail": "low"}
                    }
                ]
            }]
        )
        import json as json_lib
        raw = resp.choices[0].message.content.strip()
        # Estrai il JSON dalla risposta
        start = raw.find('{')
        end   = raw.rfind('}') + 1
        parsed = json_lib.loads(raw[start:end]) if start >= 0 else {}
        season = parsed.get("season", "").strip()
        notes  = parsed.get("notes", "").strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analisi AI fallita: {str(e)}")

    profile.armocromia_season = season
    profile.armocromia_notes  = notes
    await db.commit()
    return {
        "ok": True,
        "armocromia_season": season,
        "armocromia_notes": notes,
        "remaining_week": armo_quota.get("remaining_week", -1),
        "limit_week": armo_quota.get("limit_week", -1),
    }


@app.post("/profile/avatar")
async def upload_avatar(
    photo: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Carica la foto avatar dell'utente per il virtual try-on."""
    avatar_filename = await save_upload(photo, "avatar")
    avatar_path = f"/uploads/{avatar_filename}"

    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
    profile.avatar_photo = avatar_path
    await db.commit()

    return {"ok": True, "avatar_photo": avatar_path}


@app.post("/profile/picture")
async def upload_profile_picture(
    photo: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Carica la foto profilo pubblica dell'utente (visibile agli altri)."""
    filename = await save_upload(photo, "profile_pic")
    path = f"/uploads/{filename}"

    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
    profile.profile_picture = path
    await db.commit()

    return {"ok": True, "profile_picture": path}


@app.get("/users/{username}/profile-picture")
async def get_user_profile_picture(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restituisce la foto profilo pubblica di un utente."""
    user_result = await db.execute(select(User).where(User.username == username))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    profile_result = await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))
    profile = profile_result.scalar_one_or_none()
    return {"profile_picture": profile.profile_picture if profile else None}


@app.post("/garments/{garment_id}/generate-tryon")
async def generate_garment_tryon(
    garment_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Avvia (o ri-avvia) la generazione try-on per un capo specifico."""
    if not get_fashn_key():
        raise HTTPException(status_code=400, detail="FASHN_API_KEY non configurata")

    result = await db.execute(select(Garment).where(Garment.id == garment_id))
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Capo non trovato")
    if g.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")

    if not g.photo_front:
        raise HTTPException(status_code=400, detail="Capo senza foto fronte")

    if not fashn_supported(g.category):
        raise HTTPException(status_code=400, detail=f"Categoria '{g.category}' non supportata da FASHN")

    profile_result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = profile_result.scalar_one_or_none()
    if not profile or not profile.avatar_photo:
        raise HTTPException(status_code=400, detail="Foto avatar mancante — caricala nel Profilo")

    g.tryon_status = "pending"
    await db.commit()

    background_tasks.add_task(
        _run_tryon_background,
        g.id,
        profile.avatar_photo,
        f"/uploads/{g.photo_front}",
        g.category,
    )
    return {"ok": True, "tryon_status": "pending"}


@app.get("/garments/{garment_id}/tryon-status")
async def get_tryon_status(
    garment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restituisce lo stato attuale del try-on per un capo."""
    result = await db.execute(select(Garment).where(Garment.id == garment_id))
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Capo non trovato")
    if g.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    return {
        "id": g.id,
        "tryon_status": g.tryon_status or "none",
        "tryon_image": g.tryon_image or None,
    }


# ── Rimozione sfondo singolo capo ────────────────────────────────────────────
@app.post("/garments/{garment_id}/remove-background")
async def remove_garment_background(
    garment_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Avvia la rimozione sfondo per fronte e retro (NON etichetta).
    Ritorna subito con bg_status='processing'; il task prosegue in background
    anche se il frontend chiude il modale.
    """
    result = await db.execute(select(Garment).where(Garment.id == garment_id))
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Capo non trovato")
    if g.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    if g.bg_status == "processing":
        return {"ok": True, "bg_status": "processing"}  # già in corso

    g.bg_status = "processing"
    await db.commit()

    background_tasks.add_task(_run_bg_removal_background, garment_id)
    return {"ok": True, "bg_status": "processing"}


@app.get("/garments/{garment_id}/bg-status")
async def get_bg_status(
    garment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Polling: restituisce bg_status e foto aggiornate del capo."""
    result = await db.execute(select(Garment).where(Garment.id == garment_id))
    g = result.scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Capo non trovato")
    if g.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    return {
        "id": g.id,
        "bg_status": g.bg_status or "none",
        "photo_front": f"/uploads/{g.photo_front}" if g.photo_front else None,
        "photo_back":  f"/uploads/{g.photo_back}"  if g.photo_back  else None,
        "photo_label": f"/uploads/{g.photo_label}" if g.photo_label else None,
    }


# ── Outfit Try-on ─────────────────────────────────────────────────────────────
@app.post("/outfit-tryon")
async def outfit_tryon(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Genera un virtual try-on per l'outfit completo.
    Catena le chiamate FASHN: avatar → top → bottom → risultato finale.
    """
    if not get_fashn_key():
        raise HTTPException(status_code=400, detail="FASHN_API_KEY non configurata nel file .env")

    garment_ids: list = data.get("garment_ids", [])
    if not garment_ids:
        raise HTTPException(status_code=400, detail="Nessun capo selezionato")

    # Get avatar
    profile_result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = profile_result.scalar_one_or_none()
    if not profile or not profile.avatar_photo:
        raise HTTPException(
            status_code=400,
            detail="Carica una foto nel Profilo prima di generare il try-on outfit"
        )

    # Get garments
    result = await db.execute(select(Garment).where(Garment.id.in_(garment_ids)))
    garments = result.scalars().all()

    garments_data = [
        {"photo": f"/uploads/{g.photo_front}", "category": g.category}
        for g in garments
        if g.photo_front and fashn_supported(g.category)
    ]

    if not garments_data:
        raise HTTPException(
            status_code=400,
            detail="Nessun capo nell'outfit supporta il try-on (aggiungi magliette, felpe, giacchetti o pantaloni)"
        )

    try:
        result_path = await generate_outfit_tryon(profile.avatar_photo, garments_data)
        return {"tryon_image": result_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Admin: rimozione sfondi ────────────────────────────────────────────────────
@app.post("/admin/remove-backgrounds")
async def admin_remove_backgrounds(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Avvia la rimozione sfondo per tutti i capi del solo utente autenticato.
    (Scopo: tool admin per utenti che hanno caricato capi prima dell'auto-rimozione.)
    """
    # SECURITY: filtra per user_id — non processa capi di altri utenti
    result = await db.execute(select(Garment).where(Garment.user_id == current_user.id))
    garments = result.scalars().all()
    count = 0
    for g in garments:
        if g.photo_front or g.photo_back or g.photo_label:
            background_tasks.add_task(_run_bg_removal_background, g.id)
            count += 1
    return {"ok": True, "processing": count, "message": f"Rimozione sfondo avviata per {count} capi"}


# ── Ricerca utenti ────────────────────────────────────────────────────────────
@app.get("/users/search")
async def search_users(
    q: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Truncate query to prevent oversized LIKE patterns
    q = q[:50].strip()
    if len(q) < 2:
        return []
    result = await db.execute(
        select(User).where(
            User.username.ilike(f"%{q}%"),
            User.id != current_user.id,
            User.is_verified == True,
        ).limit(20)
    )
    users = result.scalars().all()
    out = []
    for u in users:
        prof_res = await db.execute(select(UserProfile).where(UserProfile.user_id == u.id))
        prof = prof_res.scalar_one_or_none()
        out.append({"id": u.id, "username": u.username, "profile_picture": prof.profile_picture if prof else None})
    return out


# ── Follow system ─────────────────────────────────────────────────────────────
@app.post("/friends/request", status_code=201)
async def follow_user(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Segui un utente (unidirezionale, nessuna accettazione richiesta)."""
    username = (body.get("username") or "").strip().lower()
    if not username:
        raise HTTPException(status_code=422, detail="Username mancante")

    target_res = await db.execute(select(User).where(User.username == username))
    target = target_res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Non puoi seguire te stesso")

    existing = await db.execute(
        select(Friendship).where(
            Friendship.requester_id == current_user.id,
            Friendship.addressee_id == target.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Stai già seguendo @{username}")

    follow = Friendship(requester_id=current_user.id, addressee_id=target.id, status="following")
    db.add(follow)
    await db.commit()
    return {"ok": True, "message": f"Ora segui @{username}"}


@app.get("/friends")
async def list_following(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Utenti che l'utente corrente segue."""
    result = await db.execute(
        select(Friendship).where(
            Friendship.requester_id == current_user.id,
            Friendship.status == "following",
        )
    )
    out = []
    for f in result.scalars().all():
        user_res = await db.execute(select(User).where(User.id == f.addressee_id))
        other = user_res.scalar_one_or_none()
        if other:
            prof_res = await db.execute(select(UserProfile).where(UserProfile.user_id == other.id))
            prof = prof_res.scalar_one_or_none()
            out.append({"friendship_id": f.id, "id": other.id, "username": other.username,
                        "profile_picture": prof.profile_picture if prof else None})
    return out


@app.get("/followers")
async def list_followers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Utenti che seguono l'utente corrente."""
    result = await db.execute(
        select(Friendship).where(
            Friendship.addressee_id == current_user.id,
            Friendship.status == "following",
        )
    )
    out = []
    for f in result.scalars().all():
        user_res = await db.execute(select(User).where(User.id == f.requester_id))
        other = user_res.scalar_one_or_none()
        if other:
            prof_res = await db.execute(select(UserProfile).where(UserProfile.user_id == other.id))
            prof = prof_res.scalar_one_or_none()
            out.append({"friendship_id": f.id, "id": other.id, "username": other.username,
                        "profile_picture": prof.profile_picture if prof else None})
    return out


@app.delete("/friends/{friendship_id}")
async def unfollow_user(
    friendship_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Smetti di seguire un utente."""
    result = await db.execute(select(Friendship).where(Friendship.id == friendship_id))
    f = result.scalar_one_or_none()
    if not f or f.requester_id != current_user.id:
        raise HTTPException(status_code=404, detail="Follow non trovato")
    await db.delete(f)
    await db.commit()
    return {"ok": True}


# ── Vetrina ───────────────────────────────────────────────────────────────────
async def _build_showcase(items, db: AsyncSession):
    """Costruisce la lista di oggetti vetrina con dati completi."""
    out = []
    for item in items:
        if item.item_type == "garment":
            res = await db.execute(select(Garment).where(Garment.id == item.item_id))
            g = res.scalar_one_or_none()
            if g:
                d = garment_to_dict(g)
                out.append({"showcase_id": item.id, "type": "garment", "order": item.order_index, "data": d})
        else:
            res = await db.execute(select(Outfit).where(Outfit.id == item.item_id))
            o = res.scalar_one_or_none()
            if o:
                d = outfit_to_dict(o)
                out.append({"showcase_id": item.id, "type": "outfit", "order": item.order_index, "data": d})
    out.sort(key=lambda x: x["order"])
    return out


@app.get("/showcase")
async def get_my_showcase(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ShowcaseItem).where(ShowcaseItem.user_id == current_user.id)
    )
    items = result.scalars().all()
    return await _build_showcase(items, db)


@app.get("/showcase/{username}")
async def get_user_showcase(
    username: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verifica che i due siano amici
    target_res = await db.execute(select(User).where(User.username == username.lower()))
    target = target_res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Utente non trovato")

    # Puoi vedere la vetrina se segui l'utente o se lui segue te
    friendship_res = await db.execute(
        select(Friendship).where(
            ((Friendship.requester_id == current_user.id) & (Friendship.addressee_id == target.id)) |
            ((Friendship.requester_id == target.id) & (Friendship.addressee_id == current_user.id)),
            Friendship.status == "following"
        )
    )
    if not friendship_res.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Devi seguire questo utente per vedere la sua vetrina")

    result = await db.execute(
        select(ShowcaseItem).where(ShowcaseItem.user_id == target.id)
    )
    items = result.scalars().all()
    return {"username": target.username, "items": await _build_showcase(items, db)}


class ShowcaseAddRequest(BaseModel):
    item_type: Annotated[str, Field(max_length=10, pattern=r'^(garment|outfit)$')]
    item_id:   int


@app.post("/showcase", status_code=201)
async def add_showcase_item(
    data: ShowcaseAddRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.item_type not in ("garment", "outfit"):
        raise HTTPException(status_code=422, detail="item_type deve essere 'garment' o 'outfit'")

    # Max 12 elementi in vetrina
    count_res = await db.execute(
        select(ShowcaseItem).where(ShowcaseItem.user_id == current_user.id)
    )
    if len(count_res.scalars().all()) >= 12:
        raise HTTPException(status_code=400, detail="Vetrina piena (max 12 elementi)")

    # Verifica ownership
    if data.item_type == "garment":
        check = await db.execute(select(Garment).where(Garment.id == data.item_id, Garment.user_id == current_user.id))
    else:
        check = await db.execute(select(Outfit).where(Outfit.id == data.item_id, Outfit.user_id == current_user.id))
    if not check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Elemento non trovato")

    # Evita duplicati
    dup = await db.execute(
        select(ShowcaseItem).where(
            ShowcaseItem.user_id == current_user.id,
            ShowcaseItem.item_type == data.item_type,
            ShowcaseItem.item_id == data.item_id,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Già in vetrina")

    order_res = await db.execute(
        select(ShowcaseItem).where(ShowcaseItem.user_id == current_user.id)
    )
    next_order = len(order_res.scalars().all())

    item = ShowcaseItem(user_id=current_user.id, item_type=data.item_type, item_id=data.item_id, order_index=next_order)
    db.add(item)
    await db.commit()
    return {"ok": True}


@app.delete("/showcase/{showcase_id}")
async def remove_showcase_item(
    showcase_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ShowcaseItem).where(ShowcaseItem.id == showcase_id, ShowcaseItem.user_id == current_user.id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Elemento non trovato")
    await db.delete(item)
    await db.commit()
    return {"ok": True}


# ── Brand Auth ────────────────────────────────────────────────────────────────

_brand_bearer = HTTPBearer(auto_error=False)

class BrandRegisterRequest(BaseModel):
    name:        Annotated[str,          Field(min_length=2, max_length=100)]
    email:       EmailStr
    password:    Annotated[str,          Field(min_length=8, max_length=128)]
    website:     Annotated[Optional[str], Field(default=None, max_length=500)]
    description: Annotated[Optional[str], Field(default=None, max_length=1000)]

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La password deve essere di almeno 8 caratteri")
        return v


class BrandLoginRequest(BaseModel):
    email:    EmailStr
    password: Annotated[str, Field(max_length=128)]


def brand_to_dict(b: Brand) -> dict:
    return {
        "id": b.id,
        "name": b.name,
        "email": b.email,
        "logo_url": b.logo_url,
        "description": b.description,
        "website": b.website,
        "active": b.active,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


def brand_product_to_dict(p: BrandProduct, brand_name: str = "") -> dict:
    return {
        "id": p.id,
        "brand_id": p.brand_id,
        "brand_name": brand_name,
        "name": p.name,
        "category": p.category,
        "color_primary": p.color_primary,
        "color_hex": p.color_hex,
        "style_tags": p.style_tags or [],
        "season_tags": p.season_tags or [],
        "occasion_tags": p.occasion_tags or [],
        "price": p.price,
        "currency": p.currency or "EUR",
        "buy_url": p.buy_url,
        "image_url": f"/uploads/{p.image_url}" if p.image_url else None,
        "description": p.description,
        "active": p.active,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


async def get_current_brand(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_brand_bearer),
    db: AsyncSession = Depends(get_db),
) -> Brand:
    if not credentials:
        raise HTTPException(status_code=401, detail="Token mancante")
    brand_id = decode_token(credentials.credentials, "access")
    if not brand_id:
        raise HTTPException(status_code=401, detail="Token non valido o scaduto")
    result = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = result.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=401, detail="Brand non trovato")
    if not brand.active:
        raise HTTPException(status_code=403, detail="Account brand disattivato")
    return brand


@app.post("/brand/register", status_code=201)
async def brand_register(data: BrandRegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Brand).where(Brand.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email già registrata")
    brand = Brand(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        website=data.website,
        description=data.description,
        active=True,
    )
    db.add(brand)
    await db.commit()
    await db.refresh(brand)
    return {"message": "Brand registrato con successo", "brand": brand_to_dict(brand)}


@app.post("/brand/login")
async def brand_login(data: BrandLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Brand).where(Brand.email == data.email))
    brand = result.scalar_one_or_none()
    if not brand or not verify_password(data.password, brand.password_hash):
        raise HTTPException(status_code=401, detail="Email o password non corretti")
    if not brand.active:
        raise HTTPException(status_code=403, detail="Account brand disattivato")
    return {
        "access_token":  create_access_token(brand.id),
        "refresh_token": create_refresh_token(brand.id),
        "token_type":    "bearer",
        "brand":         brand_to_dict(brand),
    }


@app.post("/brand/forgot-password")
async def brand_forgot_password(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Brand).where(Brand.email == data.email))
    brand = result.scalar_one_or_none()
    if brand and brand.active:
        reset_token = generate_secure_token()
        brand.reset_token         = reset_token
        brand.reset_token_expires = token_expiry(RESET_TOKEN_TTL)
        await db.commit()
        # Riusa send_reset_email con link dedicato al brand portal
        await send_reset_email(brand.email, reset_token, brand_portal=True)
    return {"message": "Se l'email è registrata, riceverai un link per reimpostare la password."}


class BrandResetPasswordRequest(BaseModel):
    token:        Annotated[str, Field(max_length=256)]
    new_password: Annotated[str, Field(min_length=8, max_length=128)]

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La password deve essere di almeno 8 caratteri")
        return v


@app.post("/brand/reset-password")
async def brand_reset_password(data: BrandResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Brand).where(Brand.reset_token == data.token))
    brand = result.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=400, detail="Token non valido")
    now = datetime.now(timezone.utc)
    expires = brand.reset_token_expires
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires and now > expires:
        raise HTTPException(status_code=400, detail="Token scaduto. Richiedi un nuovo link.")
    brand.password_hash       = hash_password(data.new_password)
    brand.reset_token         = None
    brand.reset_token_expires = None
    await db.commit()
    return {"message": "Password reimpostata con successo."}


@app.post("/brand/refresh")
async def brand_refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    brand_id = decode_token(data.refresh_token, "refresh")
    if not brand_id:
        raise HTTPException(status_code=401, detail="Refresh token non valido o scaduto")
    result = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = result.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=401, detail="Brand non trovato")
    return {"access_token": create_access_token(brand.id), "token_type": "bearer"}


@app.get("/brand/me")
async def brand_me(current_brand: Brand = Depends(get_current_brand)):
    return brand_to_dict(current_brand)


class BrandProfileUpdate(BaseModel):
    name:        Annotated[Optional[str], Field(default=None, min_length=2, max_length=100)]
    description: Annotated[Optional[str], Field(default=None, max_length=1000)]
    website:     Annotated[Optional[str], Field(default=None, max_length=500)]


@app.patch("/brand/me")
async def brand_update_profile(
    data: BrandProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_brand: Brand = Depends(get_current_brand),
):
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(current_brand, field, value)
    await db.commit()
    await db.refresh(current_brand)
    return brand_to_dict(current_brand)


@app.post("/brand/logo")
async def brand_upload_logo(
    photo: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_brand: Brand = Depends(get_current_brand),
):
    filename = await save_upload(photo, "brand_logo")
    current_brand.logo_url = f"/uploads/{filename}"
    await db.commit()
    return {"ok": True, "logo_url": current_brand.logo_url}


# ── Brand Products CRUD ───────────────────────────────────────────────────────

class BrandProductCreate(BaseModel):
    name:          Annotated[str,          Field(min_length=1, max_length=200)]
    category:      Annotated[str,          Field(min_length=1, max_length=50)]
    color_primary: Annotated[Optional[str], Field(default=None, max_length=50)]
    color_hex:     Annotated[Optional[str], Field(default=None, max_length=7, pattern=r'^#[0-9A-Fa-f]{6}$')]
    style_tags:    Annotated[list,          Field(default_factory=list, max_length=20)]
    season_tags:   Annotated[list,          Field(default_factory=list, max_length=10)]
    occasion_tags: Annotated[list,          Field(default_factory=list, max_length=15)]
    price:         Annotated[Optional[float], Field(default=None, ge=0, le=100000)]
    currency:      Annotated[str,          Field(default="EUR", max_length=3, pattern=r'^[A-Z]{3}$')]
    buy_url:       Annotated[Optional[str], Field(default=None, max_length=2000)]
    description:   Annotated[Optional[str], Field(default=None, max_length=2000)]


class BrandProductUpdate(BaseModel):
    name:          Annotated[Optional[str],   Field(default=None, max_length=200)]
    category:      Annotated[Optional[str],   Field(default=None, max_length=50)]
    color_primary: Annotated[Optional[str],   Field(default=None, max_length=50)]
    color_hex:     Annotated[Optional[str],   Field(default=None, max_length=7)]
    style_tags:    Annotated[Optional[list],  Field(default=None, max_length=20)]
    season_tags:   Annotated[Optional[list],  Field(default=None, max_length=10)]
    occasion_tags: Annotated[Optional[list],  Field(default=None, max_length=15)]
    price:         Annotated[Optional[float], Field(default=None, ge=0, le=100000)]
    currency:      Annotated[Optional[str],   Field(default=None, max_length=3)]
    buy_url:       Annotated[Optional[str],   Field(default=None, max_length=2000)]
    description:   Annotated[Optional[str],   Field(default=None, max_length=2000)]
    active:        Optional[bool] = None


@app.get("/brand/products")
async def brand_list_products(
    db: AsyncSession = Depends(get_db),
    current_brand: Brand = Depends(get_current_brand),
):
    result = await db.execute(
        select(BrandProduct)
        .where(BrandProduct.brand_id == current_brand.id)
        .order_by(BrandProduct.created_at.desc())
    )
    return [brand_product_to_dict(p, current_brand.name) for p in result.scalars().all()]


@app.post("/brand/products", status_code=201)
async def brand_create_product(
    data: BrandProductCreate,
    db: AsyncSession = Depends(get_db),
    current_brand: Brand = Depends(get_current_brand),
):
    product = BrandProduct(
        brand_id=current_brand.id,
        **data.model_dump(),
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return brand_product_to_dict(product, current_brand.name)


@app.patch("/brand/products/{product_id}")
async def brand_update_product(
    product_id: int,
    data: BrandProductUpdate,
    db: AsyncSession = Depends(get_db),
    current_brand: Brand = Depends(get_current_brand),
):
    result = await db.execute(
        select(BrandProduct).where(BrandProduct.id == product_id, BrandProduct.brand_id == current_brand.id)
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Prodotto non trovato")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(p, field, value)
    await db.commit()
    await db.refresh(p)
    return brand_product_to_dict(p, current_brand.name)


@app.delete("/brand/products/{product_id}")
async def brand_delete_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_brand: Brand = Depends(get_current_brand),
):
    result = await db.execute(
        select(BrandProduct).where(BrandProduct.id == product_id, BrandProduct.brand_id == current_brand.id)
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Prodotto non trovato")
    if p.image_url:
        (UPLOAD_DIR / p.image_url).unlink(missing_ok=True)
    await db.delete(p)
    await db.commit()
    return {"ok": True}


@app.post("/brand/products/{product_id}/image")
async def brand_upload_product_image(
    product_id: int,
    photo: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_brand: Brand = Depends(get_current_brand),
):
    result = await db.execute(
        select(BrandProduct).where(BrandProduct.id == product_id, BrandProduct.brand_id == current_brand.id)
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Prodotto non trovato")
    filename = await save_upload(photo, "brand_product")
    if p.image_url:
        (UPLOAD_DIR / p.image_url).unlink(missing_ok=True)
    p.image_url = filename
    await db.commit()
    return {"ok": True, "image_url": f"/uploads/{filename}"}


# ── Brand Analytics ───────────────────────────────────────────────────────────

@app.get("/brand/analytics")
async def brand_analytics(
    db: AsyncSession = Depends(get_db),
    current_brand: Brand = Depends(get_current_brand),
):
    """Statistiche aggregate: impressioni e click per prodotto, ultimi 30 giorni."""
    from sqlalchemy import func as sqlfunc
    from datetime import timedelta

    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    # Totale impressioni per prodotto
    imp_result = await db.execute(
        select(
            BrandProductImpression.product_id,
            BrandProductImpression.impression_type,
            sqlfunc.count(BrandProductImpression.id).label("count"),
        )
        .where(
            BrandProductImpression.brand_id == current_brand.id,
            BrandProductImpression.created_at >= thirty_days_ago,
        )
        .group_by(BrandProductImpression.product_id, BrandProductImpression.impression_type)
    )
    rows = imp_result.all()

    stats: dict = {}  # product_id → {suggestions: n, clicks: n}
    for row in rows:
        pid = row.product_id
        if pid not in stats:
            stats[pid] = {"suggestions": 0, "clicks": 0}
        if row.impression_type == "suggestion":
            stats[pid]["suggestions"] = row.count
        elif row.impression_type == "click":
            stats[pid]["clicks"] = row.count

    # Totali globali
    total_suggestions = sum(s["suggestions"] for s in stats.values())
    total_clicks      = sum(s["clicks"]      for s in stats.values())

    # Prodotti con dati
    prod_result = await db.execute(
        select(BrandProduct).where(BrandProduct.brand_id == current_brand.id)
    )
    products = prod_result.scalars().all()

    product_stats = []
    for p in products:
        s = stats.get(p.id, {"suggestions": 0, "clicks": 0})
        ctr = round(s["clicks"] / s["suggestions"] * 100, 1) if s["suggestions"] > 0 else 0.0
        product_stats.append({
            "product_id":  p.id,
            "product_name": p.name,
            "category":    p.category,
            "image_url":   f"/uploads/{p.image_url}" if p.image_url else None,
            "active":      p.active,
            "suggestions": s["suggestions"],
            "clicks":      s["clicks"],
            "ctr":         ctr,
        })

    product_stats.sort(key=lambda x: x["suggestions"], reverse=True)

    return {
        "period_days":       30,
        "total_suggestions": total_suggestions,
        "total_clicks":      total_clicks,
        "global_ctr":        round(total_clicks / total_suggestions * 100, 1) if total_suggestions > 0 else 0.0,
        "products":          product_stats,
    }


# ── Utilizzo giornaliero / settimanale brand ──────────────────────────────────
@app.get("/brand/usage")
async def brand_usage(
    db: AsyncSession = Depends(get_db),
    current_brand: Brand = Depends(get_current_brand),
):
    """Usage giornaliero e settimanale: suggerimenti, click e costo stimato OpenAI."""
    from sqlalchemy import func as sqlfunc
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # Inizio settimana corrente (lunedì)
    week_start = today_start - timedelta(days=today_start.weekday())

    async def _count(since):
        res = await db.execute(
            select(
                BrandProductImpression.impression_type,
                sqlfunc.count(BrandProductImpression.id).label("cnt"),
            )
            .where(
                BrandProductImpression.brand_id == current_brand.id,
                BrandProductImpression.created_at >= since,
            )
            .group_by(BrandProductImpression.impression_type)
        )
        return {row.impression_type: row.cnt for row in res.all()}

    day_rows  = await _count(today_start)
    week_rows = await _count(week_start)

    # Costo stimato: ogni "suggestion" corrisponde a ~1 chiamata parziale a GPT-4o-mini
    # Stima conservativa: $0.0001 per suggerimento (diviso tra i prodotti coinvolti)
    COST_PER_SUGGESTION = 0.0001   # USD

    day_sug   = day_rows.get("suggestion", 0)
    day_clk   = day_rows.get("click",      0)
    week_sug  = week_rows.get("suggestion", 0)
    week_clk  = week_rows.get("click",     0)

    return {
        "today": {
            "suggestions":        day_sug,
            "clicks":             day_clk,
            "estimated_cost_usd": round(day_sug * COST_PER_SUGGESTION, 4),
        },
        "week": {
            "suggestions":        week_sug,
            "clicks":             week_clk,
            "estimated_cost_usd": round(week_sug * COST_PER_SUGGESTION, 4),
        },
        "soft_limits": {
            "daily_suggestions":  500,
            "weekly_suggestions": 2500,
        },
    }


# ── Traccia click su prodotto brand (chiamato dall'app utente) ─────────────────
@app.post("/brand/products/{product_id}/click")
async def track_brand_click(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(BrandProduct).where(BrandProduct.id == product_id, BrandProduct.active == True))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Prodotto non trovato")
    imp = BrandProductImpression(product_id=p.id, brand_id=p.brand_id, impression_type="click")
    db.add(imp)
    await db.commit()
    return {"ok": True}


# ── Feedback utente sui prodotti brand suggeriti dalla chat ───────────────────
class BrandFeedbackRequest(BaseModel):
    vote:   Annotated[str,          Field(max_length=10, pattern=r'^(like|dislike)$')]
    reason: Annotated[Optional[str], Field(default=None, max_length=300)]


@app.post("/brand/products/{product_id}/feedback")
async def brand_product_feedback(
    product_id: int,
    data: BrandFeedbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.vote not in ('like', 'dislike'):
        raise HTTPException(status_code=422, detail="vote deve essere 'like' o 'dislike'")

    result = await db.execute(select(BrandProduct).where(BrandProduct.id == product_id, BrandProduct.active == True))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Prodotto non trovato")

    # Upsert: aggiorna se l'utente aveva già votato questo prodotto
    existing = await db.execute(
        select(BrandProductFeedback).where(
            BrandProductFeedback.user_id == current_user.id,
            BrandProductFeedback.product_id == product_id,
        )
    )
    fb = existing.scalar_one_or_none()
    if fb:
        fb.vote   = data.vote
        fb.reason = data.reason
    else:
        fb = BrandProductFeedback(
            user_id=current_user.id,
            product_id=product_id,
            vote=data.vote,
            reason=data.reason,
        )
        db.add(fb)

    await db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# SOCIAL FEED
# ═══════════════════════════════════════════════════════════════════════════════

async def _build_post(post: SocialPost, current_user_id: int, db: AsyncSession) -> dict:
    """Costruisce il dict completo di un post con autore, contenuto, like, commenti."""
    # Like count e liked_by_me
    likes_res = await db.execute(select(PostLike).where(PostLike.post_id == post.id))
    likes = likes_res.scalars().all()
    like_count = len(likes)
    liked_by_me = any(l.user_id == current_user_id for l in likes)

    # Comment count
    comm_res = await db.execute(select(PostComment).where(PostComment.post_id == post.id))
    comment_count = len(comm_res.scalars().all())

    base = {
        "id":            post.id,
        "post_type":     post.post_type,
        "item_type":     post.post_type,   # alias usato dal frontend
        "caption":       post.caption,
        "bg_color":      post.bg_color,
        "is_sponsored":  post.is_sponsored,
        "like_count":    like_count,
        "liked_by_me":   liked_by_me,
        "comment_count": comment_count,
        "created_at":    post.created_at.isoformat() if post.created_at else None,
    }

    # ── Post utente ──────────────────────────────────────────────────────────
    if post.user_id:
        user_res = await db.execute(select(User).where(User.id == post.user_id))
        author = user_res.scalar_one_or_none()
        prof_res = await db.execute(select(UserProfile).where(UserProfile.user_id == post.user_id))
        prof = prof_res.scalar_one_or_none()
        base["type"] = "user"
        base["author"] = {
            "id":              author.id if author else None,
            "username":        author.username if author else "?",
            "profile_picture": prof.profile_picture if prof else None,
        }

        if post.post_type == "outfit" and post.outfit_id:
            out_res = await db.execute(select(Outfit).where(Outfit.id == post.outfit_id))
            outfit = out_res.scalar_one_or_none()
            if outfit:
                # Recupera tutti i capi dell'outfit con le loro foto
                cover_url = None
                garments_data = []
                for gid in (outfit.garment_ids or []):
                    gr = await db.execute(select(Garment).where(Garment.id == gid))
                    g = gr.scalar_one_or_none()
                    if g:
                        garments_data.append({
                            "id":           g.id,
                            "category":     g.category,
                            "name":         g.name,
                            "brand":        g.brand,
                            "color_primary": g.color_primary,
                            "color_hex":    g.color_hex,
                            "size":         g.size,
                            "price":        g.price,
                            "material":     g.material,
                            "description":  g.description,
                            "style_tags":   g.style_tags   or [],
                            "season_tags":  g.season_tags  or [],
                            "occasion_tags": g.occasion_tags or [],
                            "photo_front":  f"/uploads/{g.photo_front}" if g.photo_front else None,
                            "photo_bg":     None,  # bg removal overwrites photo_front in-place
                        })
                        if cover_url is None and g.photo_front:
                            cover_url = f"/uploads/{g.photo_front}"
                base["content"] = {
                    "outfit_id":   outfit.id,
                    "name":        outfit.name,
                    "garment_ids": outfit.garment_ids,
                    "transforms":  outfit.transforms or {},
                    "garments":    garments_data,
                    "cover_url":   cover_url,
                }
        elif post.post_type == "garment" and post.garment_id:
            gr = await db.execute(select(Garment).where(Garment.id == post.garment_id))
            garment = gr.scalar_one_or_none()
            if garment:
                base["content"] = {
                    "garment_id": garment.id,
                    "name":       garment.name,
                    "category":   garment.category,
                    "brand":      garment.brand,
                    "photo_url":  f"/uploads/{garment.photo_front}" if garment.photo_front else None,
                }

    # ── Post brand sponsorizzato ─────────────────────────────────────────────
    elif post.brand_id:
        br_res = await db.execute(select(Brand).where(Brand.id == post.brand_id))
        brand = br_res.scalar_one_or_none()
        base["type"] = "brand"
        base["brand"] = {
            "id":       brand.id if brand else None,
            "name":     brand.name if brand else "?",
            "logo_url": brand.logo_url if brand else None,
        }

        if post.brand_product_id:
            prod_res = await db.execute(select(BrandProduct).where(BrandProduct.id == post.brand_product_id))
            prod = prod_res.scalar_one_or_none()
            if prod:
                base["content"] = {
                    "product_id": prod.id,
                    "name":       prod.name,
                    "category":   prod.category,
                    "price":      prod.price,
                    "currency":   prod.currency,
                    "buy_url":    prod.buy_url,
                    "photo_url":  f"/uploads/{prod.image_url}" if prod.image_url else None,
                    "description": prod.description,
                }

    return base


@app.post("/social/posts", status_code=201)
async def create_social_post(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    post_type = data.get("post_type")
    if post_type not in ("outfit", "garment"):
        raise HTTPException(status_code=400, detail="post_type deve essere 'outfit' o 'garment'")

    caption   = (data.get("caption")   or "").strip()[:500]
    bg_color  = (data.get("bg_color")  or "").strip()[:30] or None

    post = SocialPost(
        user_id=current_user.id,
        post_type=post_type,
        outfit_id=data.get("outfit_id"),
        garment_id=data.get("garment_id"),
        caption=caption or None,
        bg_color=bg_color,
        is_sponsored=False,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return await _build_post(post, current_user.id, db)


@app.get("/social/feed")
async def get_social_feed(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Feed: post degli utenti seguiti + post brand sponsorizzati intercalati."""
    # IDs degli utenti seguiti
    fr_res = await db.execute(
        select(Friendship).where(
            Friendship.requester_id == current_user.id,
            Friendship.status == "following",
        )
    )
    following_ids = [f.addressee_id for f in fr_res.scalars().all()]

    # Post utente (solo da chi seguo + i miei)
    user_ids = list(set(following_ids + [current_user.id]))
    posts_res = await db.execute(
        select(SocialPost)
        .where(SocialPost.user_id.in_(user_ids))
        .order_by(SocialPost.created_at.desc())
        .limit(100)
    )
    user_posts = posts_res.scalars().all()

    # Post brand sponsorizzati (tutti, ordinati per recenti)
    brand_res = await db.execute(
        select(SocialPost)
        .where(SocialPost.is_sponsored == True)
        .order_by(SocialPost.created_at.desc())
        .limit(20)
    )
    brand_posts = brand_res.scalars().all()

    # Intercala: ogni 4 post utente inserisce 1 post brand
    built_user   = [await _build_post(p, current_user.id, db) for p in user_posts]
    built_brand  = [await _build_post(p, current_user.id, db) for p in brand_posts]

    feed = []
    brand_idx = 0
    for i, post in enumerate(built_user):
        feed.append(post)
        if (i + 1) % 4 == 0 and brand_idx < len(built_brand):
            feed.append(built_brand[brand_idx])
            brand_idx += 1
    # Aggiungi i brand post rimanenti in fondo
    feed.extend(built_brand[brand_idx:])

    return feed


@app.get("/social/profile/{username}")
async def get_user_posts(
    username: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    target_res = await db.execute(select(User).where(User.username == username))
    target = target_res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Utente non trovato")

    # Profilo utente (bio, foto)
    prof_res = await db.execute(select(UserProfile).where(UserProfile.user_id == target.id))
    prof = prof_res.scalar_one_or_none()

    # Conteggio follower (chi segue target)
    followers_res = await db.execute(
        select(Friendship).where(Friendship.addressee_id == target.id, Friendship.status == 'accepted')
    )
    followers_count = len(followers_res.scalars().all())

    # Conteggio following (chi target segue)
    following_res = await db.execute(
        select(Friendship).where(Friendship.requester_id == target.id, Friendship.status == 'accepted')
    )
    following_count = len(following_res.scalars().all())

    posts_res = await db.execute(
        select(SocialPost)
        .where(SocialPost.user_id == target.id)
        .order_by(SocialPost.created_at.desc())
    )
    posts = posts_res.scalars().all()
    built_posts = [await _build_post(p, current_user.id, db) for p in posts]

    return {
        "user": {
            "username":        target.username,
            "profile_picture": prof.profile_picture if prof else None,
            "bio":             None,
            "followers_count": followers_count,
            "following_count": following_count,
            "posts_count":     len(built_posts),
        },
        "posts": built_posts,
    }


@app.delete("/social/posts/{post_id}")
async def delete_social_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(SocialPost).where(SocialPost.id == post_id))
    post = res.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post non trovato")
    if post.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    # Elimina like e commenti collegati
    await db.execute(delete(PostLike).where(PostLike.post_id == post_id))
    await db.execute(delete(PostComment).where(PostComment.post_id == post_id))
    await db.delete(post)
    await db.commit()
    return {"ok": True}


@app.post("/social/posts/{post_id}/like")
async def toggle_like(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(SocialPost).where(SocialPost.id == post_id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Post non trovato")

    like_res = await db.execute(
        select(PostLike).where(PostLike.post_id == post_id, PostLike.user_id == current_user.id)
    )
    existing = like_res.scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()
        return {"liked": False}
    else:
        db.add(PostLike(post_id=post_id, user_id=current_user.id))
        await db.commit()
        return {"liked": True}


@app.get("/social/posts/{post_id}/comments")
async def get_comments(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(PostComment).where(PostComment.post_id == post_id).order_by(PostComment.created_at)
    )
    comments = res.scalars().all()
    out = []
    for c in comments:
        user_res = await db.execute(select(User).where(User.id == c.user_id))
        author = user_res.scalar_one_or_none()
        prof_res = await db.execute(select(UserProfile).where(UserProfile.user_id == c.user_id))
        prof = prof_res.scalar_one_or_none()
        out.append({
            "id":         c.id,
            "content":    c.content,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "is_mine":    c.user_id == current_user.id,
            "author": {
                "username":        author.username if author else "?",
                "profile_picture": prof.profile_picture if prof else None,
            },
        })
    return out


@app.post("/social/posts/{post_id}/comments", status_code=201)
async def add_comment(
    post_id: int,
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(SocialPost).where(SocialPost.id == post_id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Post non trovato")

    content = (data.get("content") or "").strip()[:500]
    if not content:
        raise HTTPException(status_code=400, detail="Commento vuoto")

    comment = PostComment(post_id=post_id, user_id=current_user.id, content=content)
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    prof_res = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    prof = prof_res.scalar_one_or_none()
    return {
        "id":         comment.id,
        "content":    comment.content,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "is_mine":    True,
        "author": {
            "username":        current_user.username,
            "profile_picture": prof.profile_picture if prof else None,
        },
    }


@app.delete("/social/comments/{comment_id}")
async def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(PostComment).where(PostComment.id == comment_id))
    comment = res.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Commento non trovato")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    await db.delete(comment)
    await db.commit()
    return {"ok": True}


# ── Post brand sponsorizzati ─────────────────────────────────────────────────
@app.post("/brand/posts", status_code=201)
async def create_brand_post(
    data: dict,
    current_brand: Brand = Depends(get_current_brand),
    db: AsyncSession = Depends(get_db),
):
    product_id = data.get("brand_product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="brand_product_id obbligatorio")

    # Verifica che il prodotto appartenga al brand
    prod_res = await db.execute(
        select(BrandProduct).where(BrandProduct.id == product_id, BrandProduct.brand_id == current_brand.id)
    )
    if not prod_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Prodotto non trovato")

    caption = (data.get("caption") or "").strip()[:500]
    post = SocialPost(
        brand_id=current_brand.id,
        post_type="brand_product",
        brand_product_id=product_id,
        caption=caption or None,
        is_sponsored=True,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)

    prod_res2 = await db.execute(select(BrandProduct).where(BrandProduct.id == product_id))
    prod = prod_res2.scalar_one_or_none()
    return {
        "id":           post.id,
        "brand_product_id": product_id,
        "product_name": prod.name if prod else None,
        "caption":      post.caption,
        "created_at":   post.created_at.isoformat() if post.created_at else None,
    }


@app.get("/brand/posts")
async def list_brand_posts(
    current_brand: Brand = Depends(get_current_brand),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(SocialPost)
        .where(SocialPost.brand_id == current_brand.id)
        .order_by(SocialPost.created_at.desc())
    )
    posts = res.scalars().all()
    out = []
    for p in posts:
        # Like e commenti
        likes_res = await db.execute(select(PostLike).where(PostLike.post_id == p.id))
        like_count = len(likes_res.scalars().all())
        comm_res = await db.execute(select(PostComment).where(PostComment.post_id == p.id))
        comment_count = len(comm_res.scalars().all())

        prod_name = None
        prod_img  = None
        if p.brand_product_id:
            pr = await db.execute(select(BrandProduct).where(BrandProduct.id == p.brand_product_id))
            prod = pr.scalar_one_or_none()
            if prod:
                prod_name = prod.name
                prod_img  = prod.image_url

        out.append({
            "id":               p.id,
            "brand_product_id": p.brand_product_id,
            "product_name":     prod_name,
            "product_image":    prod_img,
            "caption":          p.caption,
            "like_count":       like_count,
            "comment_count":    comment_count,
            "created_at":       p.created_at.isoformat() if p.created_at else None,
        })
    return out


@app.delete("/brand/posts/{post_id}")
async def delete_brand_post(
    post_id: int,
    current_brand: Brand = Depends(get_current_brand),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(SocialPost).where(SocialPost.id == post_id))
    post = res.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post non trovato")
    if post.brand_id != current_brand.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    await db.execute(delete(PostLike).where(PostLike.post_id == post_id))
    await db.execute(delete(PostComment).where(PostComment.post_id == post_id))
    await db.delete(post)
    await db.commit()
    return {"ok": True}


# ── Banner pubblicitari brand interni ─────────────────────────────────────────
@app.get("/ads/brand")
async def get_brand_ads(
    limit: int = 3,
    db: AsyncSession = Depends(get_db),
):
    """Restituisce prodotti brand attivi per banner pubblicitari (endpoint pubblico)."""
    import random
    result = await db.execute(
        select(BrandProduct, Brand)
        .join(Brand, BrandProduct.brand_id == Brand.id)
        .where(BrandProduct.active == True, BrandProduct.image_url != None)
    )
    rows = result.all()
    if not rows:
        return []
    random.shuffle(rows)
    ads = []
    for product, brand in rows[:limit]:
        ads.append({
            "product_id": product.id,
            "name":       product.name,
            "category":   product.category,
            "price":      product.price,
            "currency":   product.currency or "€",
            "buy_url":    product.buy_url,
            "photo_url":  f"/uploads/{product.image_url}",
            "brand_name": brand.name,
            "brand_logo": brand.logo_url,
        })
    return ads


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


# ── Stripe Payments ───────────────────────────────────────────────────────────
# Endpoint per creare sessione Checkout Stripe e gestire webhook abbonamenti.
# Richiede: pip install stripe
# Variabili .env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY

import importlib
_stripe_available = importlib.util.find_spec("stripe") is not None

STRIPE_SECRET_KEY          = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET      = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_MONTHLY       = os.getenv("STRIPE_PRICE_MONTHLY", "")
STRIPE_PRICE_YEARLY        = os.getenv("STRIPE_PRICE_YEARLY", "")
STRIPE_PRICE_PLUS_MONTHLY  = os.getenv("STRIPE_PRICE_PLUS_MONTHLY", "")
STRIPE_PRICE_PLUS_YEARLY   = os.getenv("STRIPE_PRICE_PLUS_YEARLY", "")

_STRIPE_PRICE_MAP = {
    "premium":              lambda: STRIPE_PRICE_MONTHLY,
    "premium_annual":       lambda: STRIPE_PRICE_YEARLY,
    "premium_plus":         lambda: STRIPE_PRICE_PLUS_MONTHLY,
    "premium_plus_annual":  lambda: STRIPE_PRICE_PLUS_YEARLY,
}

class StripeCheckoutRequest(BaseModel):
    plan: str  # "premium" | "premium_annual" | "premium_plus" | "premium_plus_annual"

@app.post("/payments/checkout")
async def create_checkout_session(
    body: StripeCheckoutRequest,
    current_user: User = Depends(get_current_user),
):
    """Crea una sessione Stripe Checkout per abbonamento Premium o Premium Plus."""
    if not _stripe_available:
        raise HTTPException(503, "Stripe non installato. Esegui: pip install stripe")
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "STRIPE_SECRET_KEY non configurata")

    import stripe
    stripe.api_key = STRIPE_SECRET_KEY

    user = current_user
    app_url = os.getenv("APP_URL", "http://localhost:5173")

    price_fn = _STRIPE_PRICE_MAP.get(body.plan)
    if not price_fn:
        raise HTTPException(400, f"Piano non valido: {body.plan}")
    price_id = price_fn()
    if not price_id:
        raise HTTPException(400, f"Price ID per {body.plan} non configurato nelle variabili d'ambiente")

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            customer_email=user.email,
            metadata={"user_id": str(user.id), "plan": body.plan},
            success_url=f"{app_url}/#/premium?success=1",
            cancel_url=f"{app_url}/#/premium?cancelled=1",
        )
        return {"checkout_url": session.url}
    except Exception as e:
        err_msg = str(e)
        logger.error(f"[Stripe checkout] plan={body.plan} price_id={price_id} error={err_msg}")
        raise HTTPException(500, f"Errore pagamento: {err_msg}")


@app.post("/payments/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Riceve eventi Stripe (subscription created/updated/deleted) e aggiorna il piano utente."""
    if not _stripe_available:
        raise HTTPException(503, "Stripe non installato")

    import stripe
    stripe.api_key = STRIPE_SECRET_KEY

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        if "signature" in str(e).lower() or "SignatureVerification" in type(e).__name__:
            raise HTTPException(400, "Firma webhook non valida")
        raise HTTPException(400, f"Webhook error: {str(e)}")

    event_type = event["type"]
    subscription = event["data"]["object"]
    user_id = subscription.get("metadata", {}).get("user_id")

    if event_type in ("customer.subscription.created", "customer.subscription.updated"):
        plan_map = {
            STRIPE_PRICE_MONTHLY:      "premium",
            STRIPE_PRICE_YEARLY:       "premium_annual",
            STRIPE_PRICE_PLUS_MONTHLY: "premium_plus",
            STRIPE_PRICE_PLUS_YEARLY:  "premium_plus_annual",
        }
        plan_items = subscription.get("items", {}).get("data", [])
        price_id = plan_items[0]["price"]["id"] if plan_items else ""
        new_plan = plan_map.get(price_id, "premium")

        if user_id:
            from sqlalchemy import update as _update
            await db.execute(_update(User).where(User.id == int(user_id)).values(plan=new_plan))
            await db.commit()
            logger.info(f"[Stripe] User {user_id} aggiornato a piano {new_plan}")

    elif event_type == "customer.subscription.deleted":
        if user_id:
            from sqlalchemy import update as _update
            await db.execute(_update(User).where(User.id == int(user_id)).values(plan="free"))
            await db.commit()
            logger.info(f"[Stripe] User {user_id} tornato a piano free")

    elif event_type == "checkout.session.completed":
        # Pacchetto upload one-time
        session_obj = event["data"]["object"]
        meta        = session_obj.get("metadata", {})
        uid         = meta.get("user_id")
        credits_str = meta.get("upload_credits")
        if uid and credits_str and session_obj.get("payment_status") == "paid":
            try:
                credits = int(credits_str)
                from sqlalchemy import select as _sel
                result  = await db.execute(_sel(User).where(User.id == int(uid)))
                u       = result.scalar_one_or_none()
                if u:
                    u.upload_extra = (u.upload_extra or 0) + credits
                    await db.commit()
                    logger.info(f"[Stripe] User {uid} +{credits} upload_extra (tot {u.upload_extra})")
            except Exception as ex:
                logger.error(f"[Stripe] Errore crediti upload: {ex}")

    return {"received": True}


class UploadPackBody(BaseModel):
    pack: str   # 's' | 'm' | 'l'

@app.post("/payments/upload-pack")
async def create_upload_pack_checkout(
    body: UploadPackBody,
    current_user: User = Depends(get_current_user),
):
    """Crea sessione Stripe (one-time) per l'acquisto di un pacchetto upload extra."""
    if not _stripe_available or not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Stripe non configurato")

    import stripe
    stripe.api_key = STRIPE_SECRET_KEY

    pack_map = {
        's': (STRIPE_PRICE_UPLOAD_S, UPLOAD_PACK_S, "2"),
        'm': (STRIPE_PRICE_UPLOAD_M, UPLOAD_PACK_M, "5"),
        'l': (STRIPE_PRICE_UPLOAD_L, UPLOAD_PACK_L, "10"),
    }
    entry = pack_map.get(body.pack)
    if not entry:
        raise HTTPException(400, f"Pacchetto non valido: {body.pack}")
    price_id, credits, price_eur = entry
    if not price_id:
        raise HTTPException(400, f"Price ID per il pacchetto '{body.pack}' non configurato nelle variabili d'ambiente")

    app_url = os.getenv("APP_URL", "http://localhost:5173")
    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="payment",
            line_items=[{"price": price_id, "quantity": 1}],
            customer_email=current_user.email,
            metadata={
                "user_id":       str(current_user.id),
                "upload_credits": str(credits),
                "pack":           body.pack,
            },
            success_url=f"{app_url}/#/settings?upload_success=1",
            cancel_url=f"{app_url}/#/settings",
        )
        return {"checkout_url": session.url}
    except Exception as e:
        raise HTTPException(500, f"Errore pagamento: {str(e)}")


@app.get("/payments/portal")
async def stripe_billing_portal(
    current_user: User = Depends(get_current_user),
):
    """Genera link al portale di fatturazione Stripe per gestire abbonamento."""
    if not _stripe_available or not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Stripe non configurato")

    import stripe
    stripe.api_key = STRIPE_SECRET_KEY

    user = current_user
    app_url = os.getenv("APP_URL", "http://localhost:5173")

    # Trova il customer Stripe dall'email
    customers = stripe.Customer.list(email=user.email, limit=1)
    if not customers.data:
        raise HTTPException(404, "Nessun abbonamento attivo trovato")

    session = stripe.billing_portal.Session.create(
        customer=customers.data[0].id,
        return_url=f"{app_url}/#/settings",
    )
    return {"portal_url": session.url}
