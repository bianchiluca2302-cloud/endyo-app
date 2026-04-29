"""
conftest.py  —  Fixtures globali per tutti i test Endyo.

Strategia:
  • DB SQLite temporaneo (test_wardrobe.db) invece di wardrobe.db
  • httpx.AsyncClient con ASGITransport → nessun server reale necessario
  • AI, rembg e tryon mockati → nessun costo OpenAI, nessuna GPU
  • Fixtures "session-scoped" per velocità (DB creato una sola volta)
"""
import os
import sys
import asyncio
import io
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

# ── Path setup ────────────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).parent   # backend/conftest.py → parent = backend/
sys.path.insert(0, str(BACKEND_DIR))

# ── Env vars prima di qualsiasi import app ────────────────────────────────────
os.environ.setdefault("OPENAI_KEY_VISION",     "sk-test-fake-key-for-testing")
os.environ.setdefault("OPENAI_KEY_STYLIST",    "sk-test-fake-key-for-testing")
os.environ.setdefault("OPENAI_KEY_ARMOCROMIA", "sk-test-fake-key-for-testing")
os.environ.setdefault("OPENAI_KEY_SHOPPING",   "sk-test-fake-key-for-testing")
os.environ.setdefault("SECRET_KEY", "test-secret-endyo-2024")
os.environ.setdefault("SMTP_HOST", "")  # Disabilita email reali

# ── Patch DB prima di importare database / main ───────────────────────────────
import database
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

_TEST_DB_PATH = str(BACKEND_DIR / "tests" / "test_temp.db")
_TEST_URL = f"sqlite+aiosqlite:///{_TEST_DB_PATH}"
_test_engine = create_async_engine(_TEST_URL, echo=False)
_test_session_local = async_sessionmaker(_test_engine, expire_on_commit=False)

database.engine = _test_engine
database.AsyncSessionLocal = _test_session_local

# ── Mock rembg (modello pesante, non necessario nei test) ─────────────────────
import bg_service
bg_service.preload_model_sync = lambda: None

async def _fake_remove_bg(path):
    """Restituisce l'immagine invariata (tiny 1×1 JPEG)."""
    return path

bg_service.remove_background = _fake_remove_bg

# ── Mock tryon ─────────────────────────────────────────────────────────────────
import tryon_service
tryon_service.generate_tryon = AsyncMock(return_value={"status": "done", "image_url": "/uploads/fake_tryon.jpg"})
tryon_service.generate_outfit_tryon = AsyncMock(return_value={"status": "done", "image_url": "/uploads/fake_tryon.jpg"})

# ── Ora importa main (usa già le versioni patchate) ───────────────────────────
from httpx import AsyncClient, ASGITransport
from database import get_db, Base, init_db
import main as _main_module

app = _main_module.app

# ─────────────────────────────────────────────────────────────────────────────
# Helper: minimal JPEG 1×1 pixel (usato nei test di upload immagini)
# ─────────────────────────────────────────────────────────────────────────────
from PIL import Image as _PILImage

def make_test_image(name: str = "test.jpg") -> tuple[str, bytes, str]:
    """Restituisce (filename, bytes, content_type) per un'immagine di test 10×10."""
    buf = io.BytesIO()
    img = _PILImage.new("RGB", (10, 10), color=(255, 100, 50))
    img.save(buf, format="JPEG")
    buf.seek(0)
    return name, buf.read(), "image/jpeg"


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop():
    """Event loop condiviso per tutta la session."""
    policy = asyncio.get_event_loop_policy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def init_test_db():
    """Crea tutte le tabelle nel DB di test (una volta sola)."""
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Cleanup dopo tutti i test
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    try:
        os.unlink(_TEST_DB_PATH)
    except FileNotFoundError:
        pass


@pytest_asyncio.fixture
async def client(init_test_db):
    """Client httpx collegato all'app FastAPI con DB di test."""
    async def _override_get_db():
        async with _test_session_local() as session:
            try:
                yield session
            finally:
                await session.close()

    app.dependency_overrides[get_db] = _override_get_db

    # Patch OpenAI in ogni richiesta (evita chiamate reali)
    with patch("ai_service.client") as mock_ai:
        mock_ai.chat.completions.create = AsyncMock(
            return_value=MagicMock(
                choices=[MagicMock(
                    message=MagicMock(content='{"name":"Test Outfit","occasion":"casual","garment_ids":[]}'),
                    delta=MagicMock(content="Ecco un outfit per te!"),
                    finish_reason="stop",
                )]
            )
        )
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as c:
            yield c

    app.dependency_overrides.clear()


# ─────────────────────────────────────────────────────────────────────────────
# Fixture: utente registrato + token di accesso
# ─────────────────────────────────────────────────────────────────────────────

_USER_EMAIL    = "test_user@example.com"
_USER_PASSWORD = "TestPass123!"
_USER_USERNAME = "testuser"

@pytest_asyncio.fixture
async def auth_headers(client):
    """
    Registra (o ri-logga) l'utente di test e restituisce headers con Bearer token.
    Ordine corretto: register → verifica email nel DB → login.
    """
    from sqlalchemy import text

    # 1. Prova a registrare (ok se già esiste)
    await client.post("/auth/register", json={
        "email": _USER_EMAIL,
        "password": _USER_PASSWORD,
        "username": _USER_USERNAME,
    })

    # 2. Forza verifica email nel DB (l'email reale non viene spedita in test)
    async with _test_session_local() as session:
        await session.execute(
            text("UPDATE users SET is_verified = 1 WHERE email = :email"),
            {"email": _USER_EMAIL},
        )
        await session.commit()

    # 3. Login con utente verificato
    login = await client.post("/auth/login", json={
        "email": _USER_EMAIL,
        "password": _USER_PASSWORD,
    })
    assert login.status_code == 200, f"Login fallito: {login.text}"
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ─────────────────────────────────────────────────────────────────────────────
# Fixture: brand registrato + token brand
# ─────────────────────────────────────────────────────────────────────────────

_BRAND_EMAIL    = "brand@example.com"
_BRAND_PASSWORD = "BrandPass123!"
_BRAND_NAME     = "TestBrand"

@pytest_asyncio.fixture
async def brand_headers(client):
    """Registra (o ri-logga) il brand di test e restituisce headers.
    Forza il reset della password nel DB per garantire che il login funzioni
    anche se test precedenti hanno cambiato la password.
    """
    from sqlalchemy import text
    from passlib.context import CryptContext
    _pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

    # 1. Prova registrazione (ok se già esiste → 409)
    await client.post("/brand/register", json={
        "name": _BRAND_NAME,
        "email": _BRAND_EMAIL,
        "password": _BRAND_PASSWORD,
    })

    # 2. Forza la password nota nel DB (in caso test precedenti l'abbiano cambiata)
    hashed = _pwd_ctx.hash(_BRAND_PASSWORD)
    async with _test_session_local() as session:
        await session.execute(
            text("UPDATE brands SET password_hash = :h WHERE email = :e"),
            {"h": hashed, "e": _BRAND_EMAIL},
        )
        await session.commit()

    # 3. Login
    login = await client.post("/brand/login", json={
        "email": _BRAND_EMAIL,
        "password": _BRAND_PASSWORD,
    })
    assert login.status_code == 200, f"Brand login fallito: {login.text}"
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
