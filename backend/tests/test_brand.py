"""
test_brand.py  —  Test portale brand (B2B).

Copre:
  POST   /brand/register
  POST   /brand/login
  POST   /brand/forgot-password
  POST   /brand/reset-password
  POST   /brand/refresh
  GET    /brand/me
  PATCH  /brand/me
  POST   /brand/logo
  POST   /brand/products
  GET    /brand/products
  PATCH  /brand/products/{id}
  DELETE /brand/products/{id}
  POST   /brand/products/{id}/image
  GET    /brand/analytics
  POST   /brand/products/{id}/click      (da app utente)
  POST   /brand/products/{id}/feedback   (like/dislike)
"""
import pytest
from sqlalchemy import text
from helpers import make_test_image

# Costanti e DB helper dal conftest radice
import conftest as _cf
_test_session_local = _cf._test_session_local
_BRAND_EMAIL    = _cf._BRAND_EMAIL
_BRAND_PASSWORD = _cf._BRAND_PASSWORD

pytestmark = pytest.mark.asyncio

_product_id: int = None


class TestBrandAuth:

    async def test_register_success(self, client):
        r = await client.post("/brand/register", json={
            "name": "BrandTest SpA",
            "email": "brandtest_new@example.com",
            "password": "BrandPass99!",
        })
        assert r.status_code == 201
        body = r.json()
        # L'app restituisce message + brand, non access_token
        assert "message" in body or "brand" in body or "access_token" in body

    async def test_register_duplicate(self, client, brand_headers):
        """Email già registrata → 400 o 409."""
        r = await client.post("/brand/register", json={
            "name": "Altro Brand",
            "email": _BRAND_EMAIL,
            "password": "AnotherPass99!",
        })
        assert r.status_code in (400, 409)

    async def test_login_success(self, client):
        r = await client.post("/brand/login", json={
            "email": _BRAND_EMAIL,
            "password": _BRAND_PASSWORD,
        })
        assert r.status_code == 200
        assert "access_token" in r.json()

    async def test_login_wrong_password(self, client):
        r = await client.post("/brand/login", json={
            "email": _BRAND_EMAIL,
            "password": "WrongPass!",
        })
        assert r.status_code == 401

    async def test_refresh_token(self, client):
        login = await client.post("/brand/login", json={
            "email": _BRAND_EMAIL,
            "password": _BRAND_PASSWORD,
        })
        refresh_token = login.json()["refresh_token"]
        r = await client.post("/brand/refresh", json={"refresh_token": refresh_token})
        assert r.status_code == 200
        assert "access_token" in r.json()

    async def test_forgot_password(self, client):
        r = await client.post("/brand/forgot-password", json={"email": _BRAND_EMAIL})
        assert r.status_code == 200

    async def test_reset_password_valid_token(self, client):
        from auth import generate_secure_token, token_expiry
        token = generate_secure_token()
        expiry = token_expiry(1)

        async with _test_session_local() as session:
            await session.execute(
                text("""UPDATE brands
                        SET reset_token = :t, reset_token_expires = :e
                        WHERE email = :email"""),
                {"t": token, "e": expiry, "email": _BRAND_EMAIL},
            )
            await session.commit()

        r = await client.post("/brand/reset-password", json={
            "token": token,
            "new_password": "NewBrandPass99!",
        })
        assert r.status_code == 200


class TestBrandProfile:

    async def test_get_me(self, client, brand_headers):
        r = await client.get("/brand/me", headers=brand_headers)
        assert r.status_code == 200
        data = r.json()
        assert "name" in data
        assert "email" in data

    async def test_update_me(self, client, brand_headers):
        r = await client.patch(
            "/brand/me",
            headers=brand_headers,
            json={
                "name": "TestBrand Aggiornato",
                "description": "Il miglior brand di moda italiana",
                "website": "https://testbrand.it",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("description") == "Il miglior brand di moda italiana"

    async def test_upload_logo(self, client, brand_headers):
        name, img_bytes, ctype = make_test_image("logo.jpg")
        r = await client.post(
            "/brand/logo",
            headers=brand_headers,
            files={"photo": (name, img_bytes, ctype)},
        )
        assert r.status_code == 200

    async def test_me_unauthenticated(self, client):
        r = await client.get("/brand/me")
        assert r.status_code == 401


class TestBrandProducts:

    async def test_create_product(self, client, brand_headers):
        global _product_id
        r = await client.post(
            "/brand/products",
            headers=brand_headers,
            json={
                "name": "Sneaker Premium",
                "category": "scarpe",
                "color_primary": "bianco",
                "color_hex": "#FFFFFF",
                "style_tags": ["casual", "sportivo"],
                "season_tags": ["estate", "primavera"],
                "occasion_tags": ["everyday"],
                "price": 149.99,
                "currency": "EUR",
                "buy_url": "https://testbrand.it/sneaker",
                "description": "Sneaker premium in pelle",
                "active": True,
            },
        )
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "Sneaker Premium"
        _product_id = data["id"]

    async def test_list_products(self, client, brand_headers):
        r = await client.get("/brand/products", headers=brand_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        ids = [p["id"] for p in r.json()]
        assert _product_id in ids

    async def test_update_product(self, client, brand_headers):
        assert _product_id is not None
        r = await client.patch(
            f"/brand/products/{_product_id}",
            headers=brand_headers,
            json={"price": 129.99, "description": "Prezzo scontato"},
        )
        assert r.status_code == 200
        assert r.json()["price"] == 129.99

    async def test_upload_product_image(self, client, brand_headers):
        assert _product_id is not None
        name, img_bytes, ctype = make_test_image("product.jpg")
        r = await client.post(
            f"/brand/products/{_product_id}/image",
            headers=brand_headers,
            files={"photo": (name, img_bytes, ctype)},
        )
        assert r.status_code == 200

    async def test_create_product_missing_fields(self, client, brand_headers):
        r = await client.post(
            "/brand/products",
            headers=brand_headers,
            json={"category": "scarpe"},  # manca 'name'
        )
        assert r.status_code == 422

    async def test_products_unauthenticated(self, client):
        r = await client.get("/brand/products")
        assert r.status_code == 401

    async def test_delete_product(self, client, brand_headers):
        r = await client.post(
            "/brand/products",
            headers=brand_headers,
            json={"name": "Da eliminare", "category": "maglietta"},
        )
        assert r.status_code == 201
        pid = r.json()["id"]

        del_r = await client.delete(f"/brand/products/{pid}", headers=brand_headers)
        assert del_r.status_code == 200


class TestBrandAnalytics:

    async def test_analytics(self, client, brand_headers):
        r = await client.get("/brand/analytics", headers=brand_headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)

    async def test_analytics_unauthenticated(self, client):
        r = await client.get("/brand/analytics")
        assert r.status_code == 401

    async def test_usage(self, client, brand_headers):
        """GET /brand/usage restituisce statistiche giornaliere e settimanali."""
        r = await client.get("/brand/usage", headers=brand_headers)
        assert r.status_code == 200
        data = r.json()
        assert "today" in data
        assert "week" in data
        assert "suggestions" in data["today"]
        assert "clicks" in data["today"]
        assert "suggestions" in data["week"]
        assert "clicks" in data["week"]

    async def test_usage_unauthenticated(self, client):
        r = await client.get("/brand/usage")
        assert r.status_code == 401


class TestBrandTracking:

    async def test_click_tracking(self, client, auth_headers):
        assert _product_id is not None
        r = await client.post(
            f"/brand/products/{_product_id}/click",
            headers=auth_headers,
        )
        assert r.status_code == 200

    async def test_feedback_like(self, client, auth_headers):
        assert _product_id is not None
        r = await client.post(
            f"/brand/products/{_product_id}/feedback",
            headers=auth_headers,
            json={"vote": "like"},
        )
        assert r.status_code == 200

    async def test_feedback_dislike_with_reason(self, client, auth_headers):
        assert _product_id is not None
        r = await client.post(
            f"/brand/products/{_product_id}/feedback",
            headers=auth_headers,
            json={"vote": "dislike", "reason": "Prezzo troppo alto"},
        )
        assert r.status_code == 200

    async def test_feedback_invalid_vote(self, client, auth_headers):
        assert _product_id is not None
        r = await client.post(
            f"/brand/products/{_product_id}/feedback",
            headers=auth_headers,
            json={"vote": "meh"},
        )
        assert r.status_code in (400, 422)

    async def test_click_nonexistent_product(self, client, auth_headers):
        r = await client.post("/brand/products/999999/click", headers=auth_headers)
        assert r.status_code == 404

    async def test_tracking_unauthenticated(self, client):
        r = await client.post(f"/brand/products/{_product_id}/click")
        assert r.status_code == 401
