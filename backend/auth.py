"""
Utilità di autenticazione: hashing password, JWT access/refresh token,
generazione token sicuri per verifica email e reset password.
"""
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt as _bcrypt
from jose import JWTError, jwt

# ── Configurazione ─────────────────────────────────────────────────────────────
# In produzione impostare SECRET_KEY con una stringa casuale lunga (≥ 32 byte).
SECRET_KEY         = os.getenv("SECRET_KEY", secrets.token_hex(32))
ALGORITHM          = "HS256"
ACCESS_TOKEN_TTL   = 15    # minuti
REFRESH_TOKEN_TTL  = 30    # giorni
VERIFY_TOKEN_TTL   = 24    # ore
RESET_TOKEN_TTL    = 1     # ore


# ── Password ───────────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ── JWT ────────────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)

def create_access_token(user_id: int) -> str:
    expire = _now() + timedelta(minutes=ACCESS_TOKEN_TTL)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "type": "access"},
        SECRET_KEY, algorithm=ALGORITHM,
    )

def create_refresh_token(user_id: int) -> str:
    expire = _now() + timedelta(days=REFRESH_TOKEN_TTL)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "type": "refresh"},
        SECRET_KEY, algorithm=ALGORITHM,
    )

def decode_token(token: str, expected_type: str = "access") -> Optional[int]:
    """Decodifica e valida un JWT. Restituisce user_id o None se non valido."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != expected_type:
            return None
        return int(payload["sub"])
    except JWTError:
        return None


# ── Token opachi (verifica email, reset password) ──────────────────────────────
def generate_secure_token(nbytes: int = 32) -> str:
    """Genera un token URL-safe crittograficamente sicuro."""
    return secrets.token_urlsafe(nbytes)

def token_expiry(hours: float) -> datetime:
    return _now() + timedelta(hours=hours)
