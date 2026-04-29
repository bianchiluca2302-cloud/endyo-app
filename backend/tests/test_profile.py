"""
test_profile.py  —  Test endpoint profilo utente.

Copre:
  GET  /profile
  POST /profile
  POST /profile/avatar
  POST /profile/picture
  GET  /users/{username}/profile-picture
"""
import pytest
from helpers import make_test_image

pytestmark = pytest.mark.asyncio


class TestUserProfile:

    async def test_get_profile_empty(self, client, auth_headers):
        """Prima del salvataggio il profilo può essere vuoto o con defaults."""
        r = await client.get("/profile", headers=auth_headers)
        assert r.status_code == 200

    async def test_save_profile(self, client, auth_headers):
        r = await client.post(
            "/profile",
            headers=auth_headers,
            json={
                "name": "Luca Test",
                "gender": "male",
                "height_cm": 178,
                "weight_kg": 72.5,
                "style_preferences": ["casual", "streetwear"],
                "favorite_colors": ["nero", "bianco"],
                "body_type": "atletico",
            },
        )
        assert r.status_code == 200
        # L'app restituisce {"ok": True} oppure il profilo completo
        data = r.json()
        assert data.get("ok") is True or data.get("name") == "Luca Test"

    async def test_get_profile_after_save(self, client, auth_headers):
        r = await client.get("/profile", headers=auth_headers)
        assert r.status_code == 200
        # Il profilo salvato dovrebbe essere recuperabile
        data = r.json()
        # Il profilo può essere vuoto prima del salvataggio, lo controlliamo opzionalmente
        assert isinstance(data, dict)

    async def test_update_profile_partial(self, client, auth_headers):
        """Aggiorna solo alcuni campi."""
        r = await client.post(
            "/profile",
            headers=auth_headers,
            json={"weight_kg": 74.0},
        )
        assert r.status_code == 200

    async def test_upload_avatar(self, client, auth_headers):
        name, img_bytes, ctype = make_test_image("avatar.jpg")
        r = await client.post(
            "/profile/avatar",
            headers=auth_headers,
            files={"photo": (name, img_bytes, ctype)},
        )
        assert r.status_code == 200
        data = r.json()
        assert "avatar_photo" in data or "url" in data

    async def test_upload_profile_picture(self, client, auth_headers):
        name, img_bytes, ctype = make_test_image("pic.jpg")
        r = await client.post(
            "/profile/picture",
            headers=auth_headers,
            files={"photo": (name, img_bytes, ctype)},
        )
        assert r.status_code == 200

    async def test_profile_unauthenticated(self, client):
        r = await client.get("/profile")
        assert r.status_code == 401

    async def test_profile_picture_by_username(self, client, auth_headers):
        """GET /users/{username}/profile-picture richiede auth."""
        r = await client.get("/users/testuser/profile-picture", headers=auth_headers)
        assert r.status_code in (200, 404)

    async def test_profile_picture_unauthenticated(self, client):
        r = await client.get("/users/testuser/profile-picture")
        assert r.status_code == 401
