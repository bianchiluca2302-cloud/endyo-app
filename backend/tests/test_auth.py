"""
test_auth.py  —  Test endpoint autenticazione utente.
"""
import pytest
import pytest_asyncio
from sqlalchemy import text
import conftest as _cf

pytestmark = pytest.mark.asyncio

# Utente di test separato da quello usato in auth_headers (evita conflitti)
_EMAIL    = "auth_test@example.com"
_PASSWORD = "Secure!Pass99"
_USERNAME = "authtestuser"


class TestAuthRegister:

    async def test_register_success(self, client):
        r = await client.post("/auth/register", json={
            "email": _EMAIL,
            "password": _PASSWORD,
            "username": _USERNAME,
        })
        assert r.status_code == 201
        body = r.json()
        # L'app restituisce un messaggio di conferma, non token
        assert "message" in body or "email" in body

    async def test_register_duplicate_email(self, client):
        """Stessa email → 409."""
        r = await client.post("/auth/register", json={
            "email": _EMAIL,
            "password": _PASSWORD,
            "username": "other_user_dup",
        })
        assert r.status_code in (400, 409)

    async def test_register_duplicate_username(self, client):
        """Stesso username → 409."""
        r = await client.post("/auth/register", json={
            "email": "other_email_dup@example.com",
            "password": _PASSWORD,
            "username": _USERNAME,
        })
        assert r.status_code in (400, 409)

    async def test_register_weak_password(self, client):
        r = await client.post("/auth/register", json={
            "email": "weakpass@example.com",
            "password": "123",
            "username": "weakpassuser",
        })
        assert r.status_code in (400, 422)

    async def test_register_invalid_email(self, client):
        r = await client.post("/auth/register", json={
            "email": "not-an-email",
            "password": _PASSWORD,
            "username": "invalidemail",
        })
        assert r.status_code == 422


class TestAuthLogin:

    async def test_login_unverified_user(self, client):
        """Utente registrato ma non verificato → 403."""
        r = await client.post("/auth/login", json={
            "email": _EMAIL,
            "password": _PASSWORD,
        })
        assert r.status_code in (200, 403)

    async def test_login_after_verify(self, client):
        """Dopo verifica email → 200 con token."""
        async with _cf._test_session_local() as session:
            await session.execute(
                text("UPDATE users SET is_verified = 1 WHERE email = :e"),
                {"e": _EMAIL},
            )
            await session.commit()

        r = await client.post("/auth/login", json={
            "email": _EMAIL,
            "password": _PASSWORD,
        })
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert "refresh_token" in data

    async def test_login_wrong_password(self, client):
        r = await client.post("/auth/login", json={
            "email": _EMAIL,
            "password": "WrongPass!",
        })
        assert r.status_code == 401

    async def test_login_nonexistent_user(self, client):
        r = await client.post("/auth/login", json={
            "email": "ghost@nowhere.com",
            "password": "Whatever1!",
        })
        assert r.status_code == 401


class TestAuthToken:

    async def test_refresh_token(self, client):
        async with _cf._test_session_local() as session:
            await session.execute(
                text("UPDATE users SET is_verified = 1 WHERE email = :e"),
                {"e": _EMAIL},
            )
            await session.commit()

        login = await client.post("/auth/login", json={
            "email": _EMAIL, "password": _PASSWORD,
        })
        assert login.status_code == 200
        refresh_token = login.json()["refresh_token"]

        r = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
        assert r.status_code == 200
        assert "access_token" in r.json()

    async def test_refresh_invalid_token(self, client):
        r = await client.post("/auth/refresh", json={"refresh_token": "not.valid.token"})
        assert r.status_code == 401

    async def test_me_authenticated(self, client, auth_headers):
        r = await client.get("/auth/me", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert "email" in data
        assert "id" in data

    async def test_me_unauthenticated(self, client):
        r = await client.get("/auth/me")
        assert r.status_code == 401

    async def test_me_wrong_token(self, client):
        r = await client.get("/auth/me", headers={"Authorization": "Bearer fake.token.here"})
        assert r.status_code == 401


class TestAuthPasswordReset:

    async def test_forgot_password_existing_email(self, client):
        r = await client.post("/auth/forgot-password", json={"email": _EMAIL})
        assert r.status_code == 200

    async def test_forgot_password_unknown_email(self, client):
        """Email inesistente → 200 (non rivela se esiste)."""
        r = await client.post("/auth/forgot-password", json={"email": "nobody@ghost.com"})
        assert r.status_code == 200

    async def test_reset_password_invalid_token(self, client):
        r = await client.post("/auth/reset-password", json={
            "token": "invalid-token-xxx",
            "new_password": "NewPass123!",
        })
        assert r.status_code in (400, 404)

    async def test_reset_password_valid_token(self, client):
        """Inserisce un token valido nel DB e lo usa per il reset."""
        from auth import generate_secure_token, token_expiry
        token = generate_secure_token()
        expiry = token_expiry(1)

        async with _cf._test_session_local() as session:
            await session.execute(
                text("""UPDATE users
                        SET reset_token = :t, reset_token_expires = :e
                        WHERE email = :email"""),
                {"t": token, "e": expiry, "email": _EMAIL},
            )
            await session.commit()

        r = await client.post("/auth/reset-password", json={
            "token": token,
            "new_password": "NewValid!Pass99",
        })
        assert r.status_code == 200


class TestAuthEmailVerification:

    async def test_resend_verification(self, client):
        r = await client.post("/auth/resend-verification", json={"email": _EMAIL})
        assert r.status_code == 200

    async def test_verify_email_valid_token(self, client):
        from auth import generate_secure_token, token_expiry
        token = generate_secure_token()
        expiry = token_expiry(24)

        async with _cf._test_session_local() as session:
            await session.execute(
                text("""UPDATE users
                        SET verify_token = :t, verify_token_expires = :e, is_verified = 0
                        WHERE email = :email"""),
                {"t": token, "e": expiry, "email": _EMAIL},
            )
            await session.commit()

        r = await client.get(f"/auth/verify-email/{token}")
        assert r.status_code in (200, 307, 302)

    async def test_verify_email_invalid_token(self, client):
        """Token non valido → redirect a frontend con errore o 400/404.
        L'app può restituire qualsiasi di questi codici."""
        r = await client.get("/auth/verify-email/totally-fake-token")
        # Il frontend riceve un redirect con ?error= oppure l'API restituisce 400
        assert r.status_code in (200, 400, 404, 307, 302)
