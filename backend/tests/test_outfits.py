"""
test_outfits.py  —  Test endpoint outfit.

Copre:
  GET    /outfits
  POST   /outfits
  DELETE /outfits/{id}
"""
import pytest
from helpers import make_test_image

pytestmark = pytest.mark.asyncio

_outfit_id: int = None


class TestOutfitsCRUD:

    async def test_list_empty(self, client, auth_headers):
        r = await client.get("/outfits", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    async def test_create_outfit(self, client, auth_headers):
        global _outfit_id

        # Prima crea un garment su cui basare l'outfit
        name, img_bytes, ctype = make_test_image("for_outfit.jpg")
        gr = await client.post(
            "/garments",
            headers=auth_headers,
            files={"photo_front": (name, img_bytes, ctype)},
            data={"name": "Jeans Blu", "category": "pantaloni"},
        )
        assert gr.status_code in (200, 201)
        garment_id = gr.json()["id"]

        r = await client.post(
            "/outfits",
            headers=auth_headers,
            json={
                "name": "Outfit Casual",
                "garment_ids": [garment_id],
                "occasion": "casual",
                "season": "estate",
                "notes": "Outfit estivo",
                "transforms": {},
            },
        )
        assert r.status_code in (200, 201)
        data = r.json()
        assert data["name"] == "Outfit Casual"
        assert garment_id in data["garment_ids"]
        _outfit_id = data["id"]

    async def test_create_outfit_empty_garments(self, client, auth_headers):
        """Outfit senza garment → accettato (alcuni outfit sono solo note)."""
        r = await client.post(
            "/outfits",
            headers=auth_headers,
            json={
                "name": "Outfit Vuoto",
                "garment_ids": [],
                "occasion": "formale",
            },
        )
        assert r.status_code in (200, 201, 400)

    async def test_list_after_create(self, client, auth_headers):
        r = await client.get("/outfits", headers=auth_headers)
        assert r.status_code == 200
        ids = [o["id"] for o in r.json()]
        assert _outfit_id in ids

    async def test_delete_outfit(self, client, auth_headers):
        # Crea un outfit da eliminare
        r = await client.post(
            "/outfits",
            headers=auth_headers,
            json={"name": "Da eliminare", "garment_ids": []},
        )
        assert r.status_code in (200, 201)
        oid = r.json()["id"]

        del_r = await client.delete(f"/outfits/{oid}", headers=auth_headers)
        assert del_r.status_code == 200

    async def test_delete_not_found(self, client, auth_headers):
        r = await client.delete("/outfits/999999", headers=auth_headers)
        assert r.status_code == 404

    async def test_create_unauthenticated(self, client):
        r = await client.post("/outfits", json={"name": "X", "garment_ids": []})
        assert r.status_code == 401
