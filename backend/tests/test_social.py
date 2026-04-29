"""
test_social.py  —  Test sistema sociale (follow, vetrina).

Copre:
  GET    /users/search
  POST   /friends/request
  GET    /friends
  GET    /followers
  DELETE /friends/{id}
  GET    /showcase
  GET    /showcase/{username}
  POST   /showcase
  DELETE /showcase/{id}
"""
import pytest
from sqlalchemy import text
from helpers import make_test_image
import conftest as _cf
_test_session_local = _cf._test_session_local
_USER_USERNAME = _cf._USER_USERNAME

pytestmark = pytest.mark.asyncio

# Secondo utente per testare follow
_SECOND_EMAIL    = "social_second@example.com"
_SECOND_PASSWORD = "SecondPass99!"
_SECOND_USERNAME = "social_second"


async def _ensure_second_user(client):
    """Crea e verifica il secondo utente se non esiste già."""
    r = await client.post("/auth/register", json={
        "email": _SECOND_EMAIL,
        "password": _SECOND_PASSWORD,
        "username": _SECOND_USERNAME,
    })
    async with _test_session_local() as session:
        await session.execute(
            text("UPDATE users SET is_verified = 1 WHERE email = :e"),
            {"e": _SECOND_EMAIL},
        )
        await session.commit()
    return r


class TestUserSearch:

    async def test_search_existing_user(self, client, auth_headers):
        await _ensure_second_user(client)
        r = await client.get(
            "/users/search",
            headers=auth_headers,
            params={"q": "social_second"},
        )
        assert r.status_code == 200
        results = r.json()
        assert isinstance(results, list)
        usernames = [u.get("username") for u in results]
        assert _SECOND_USERNAME in usernames

    async def test_search_nonexistent(self, client, auth_headers):
        r = await client.get(
            "/users/search",
            headers=auth_headers,
            params={"q": "xxxxxxnonexistent"},
        )
        assert r.status_code == 200
        assert r.json() == []

    async def test_search_unauthenticated(self, client):
        r = await client.get("/users/search", params={"q": "test"})
        assert r.status_code == 401


class TestFriends:
    _friendship_id: int = None

    async def test_follow_user(self, client, auth_headers):
        await _ensure_second_user(client)
        r = await client.post(
            "/friends/request",
            headers=auth_headers,
            json={"username": _SECOND_USERNAME},
        )
        assert r.status_code in (200, 201)
        data = r.json()
        # L'app può restituire {"id": ...} oppure {"ok": True, "message": ...}
        fid = data.get("id")
        if fid is None:
            # Recupera il friendship_id dalla lista dei following
            list_r = await client.get("/friends", headers=auth_headers)
            if list_r.status_code == 200:
                friends = list_r.json()
                for f in friends:
                    if f.get("username") == _SECOND_USERNAME:
                        fid = f.get("friendship_id")
                        break
        TestFriends._friendship_id = fid

    async def test_list_following(self, client, auth_headers):
        r = await client.get("/friends", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    async def test_list_followers(self, client, auth_headers):
        r = await client.get("/followers", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    async def test_follow_self(self, client, auth_headers):
        """Non si può seguire sé stessi → 400."""
        r = await client.post(
            "/friends/request",
            headers=auth_headers,
            json={"username": _USER_USERNAME},
        )
        assert r.status_code == 400

    async def test_follow_nonexistent(self, client, auth_headers):
        r = await client.post(
            "/friends/request",
            headers=auth_headers,
            json={"username": "ghost_user_xyz"},
        )
        assert r.status_code == 404

    async def test_unfollow(self, client, auth_headers):
        fid = TestFriends._friendship_id
        if fid is None:
            pytest.skip("Nessun follow creato in test precedente")
        r = await client.delete(f"/friends/{fid}", headers=auth_headers)
        assert r.status_code == 200

    async def test_friends_unauthenticated(self, client):
        r = await client.get("/friends")
        assert r.status_code == 401


class TestShowcase:
    _showcase_id: int = None

    async def test_get_my_showcase_empty(self, client, auth_headers):
        r = await client.get("/showcase", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    async def test_add_garment_to_showcase(self, client, auth_headers):
        # Crea un garment da mostrare
        name, img_bytes, ctype = make_test_image("showcase.jpg")
        gr = await client.post(
            "/garments",
            headers=auth_headers,
            files={"photo_front": (name, img_bytes, ctype)},
            data={"name": "Capo in vetrina", "category": "maglietta"},
        )
        assert gr.status_code in (200, 201)
        garment_id = gr.json()["id"]

        r = await client.post(
            "/showcase",
            headers=auth_headers,
            json={"item_type": "garment", "item_id": garment_id},
        )
        assert r.status_code in (200, 201)
        # L'app restituisce {"ok": True} senza id → recupera dalla lista
        list_r = await client.get("/showcase", headers=auth_headers)
        assert list_r.status_code == 200
        items = list_r.json()
        # La lista ha {"showcase_id": ..., "type": ..., "data": {...}}
        for item in items:
            if item.get("type") == "garment" and item.get("data", {}).get("id") == garment_id:
                TestShowcase._showcase_id = item.get("showcase_id")
                break

    async def test_get_showcase_after_add(self, client, auth_headers):
        r = await client.get("/showcase", headers=auth_headers)
        assert r.status_code == 200
        items = r.json()
        # La lista ha {"showcase_id": ..., "type": ..., "data": {...}}
        showcase_ids = [s.get("showcase_id") for s in items]
        assert TestShowcase._showcase_id in showcase_ids or len(items) > 0

    async def test_get_user_showcase(self, client, auth_headers):
        # L'endpoint richiede auth + following → 403 se non si segue l'utente
        r = await client.get(f"/showcase/{_USER_USERNAME}", headers=auth_headers)
        # Non possiamo seguire noi stessi → 403, ma la request è autenticata
        assert r.status_code in (200, 400, 403, 404)

    async def test_get_nonexistent_showcase(self, client, auth_headers):
        r = await client.get("/showcase/ghost_user_xyz", headers=auth_headers)
        assert r.status_code in (403, 404)

    async def test_get_showcase_unauthenticated(self, client):
        """Senza auth → 401."""
        r = await client.get(f"/showcase/{_USER_USERNAME}")
        assert r.status_code == 401

    async def test_remove_from_showcase(self, client, auth_headers):
        sid = TestShowcase._showcase_id
        if sid is None:
            pytest.skip("Nessun item in vetrina creato o showcase_id non disponibile")
        r = await client.delete(f"/showcase/{sid}", headers=auth_headers)
        assert r.status_code == 200

    async def test_showcase_unauthenticated_add(self, client):
        r = await client.post("/showcase", json={"item_type": "garment", "item_id": 1})
        assert r.status_code == 401
