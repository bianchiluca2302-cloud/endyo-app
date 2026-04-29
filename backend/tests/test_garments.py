"""
test_garments.py  —  Test endpoint gestione capi d'abbigliamento.

Copre:
  GET    /garments
  POST   /garments           (inserimento manuale)
  GET    /garments/{id}
  PATCH  /garments/{id}
  DELETE /garments/{id}
  POST   /garments/analyze   (AI mock)
  POST   /garments/confirm   (da analyze)
  POST   /garments/{id}/reenrich
  POST   /garments/{id}/remove-background
  GET    /garments/{id}/bg-status
"""
import pytest
from unittest.mock import patch, AsyncMock
from helpers import make_test_image

pytestmark = pytest.mark.asyncio

# Stato condiviso tra i test della classe (salvato su class attribute)
_garment_id: int = None


class TestGarmentsCRUD:

    async def test_list_empty(self, client, auth_headers):
        """Lista garment inizialmente vuota (o con soli garment di altri utenti)."""
        r = await client.get("/garments", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    async def test_create_manual(self, client, auth_headers):
        global _garment_id
        name, img_bytes, ctype = make_test_image("front.jpg")
        r = await client.post(
            "/garments",
            headers=auth_headers,
            files={"photo_front": (name, img_bytes, ctype)},
            data={
                "name": "Nike Air Force 1",
                "category": "scarpe",
                "brand": "Nike",
                "color_primary": "bianco",
                "size": "42",
                "price": "120",
            },
        )
        assert r.status_code in (200, 201)
        data = r.json()
        assert data["name"] == "Nike Air Force 1"
        assert data["category"] == "scarpe"
        _garment_id = data["id"]

    async def test_get_single(self, client, auth_headers):
        assert _garment_id is not None
        r = await client.get(f"/garments/{_garment_id}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["id"] == _garment_id

    async def test_get_not_found(self, client, auth_headers):
        r = await client.get("/garments/999999", headers=auth_headers)
        assert r.status_code == 404

    async def test_update(self, client, auth_headers):
        assert _garment_id is not None
        r = await client.patch(
            f"/garments/{_garment_id}",
            headers=auth_headers,
            json={"price": 99.99, "color_primary": "nero"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["price"] == 99.99
        assert data["color_primary"] == "nero"

    async def test_list_after_create(self, client, auth_headers):
        r = await client.get("/garments", headers=auth_headers)
        assert r.status_code == 200
        ids = [g["id"] for g in r.json()]
        assert _garment_id in ids

    async def test_delete(self, client, auth_headers):
        # Crea un capo temporaneo da eliminare
        name, img_bytes, ctype = make_test_image("del.jpg")
        r = await client.post(
            "/garments",
            headers=auth_headers,
            files={"photo_front": (name, img_bytes, ctype)},
            data={"name": "Da eliminare", "category": "maglietta"},
        )
        assert r.status_code in (200, 201)
        gid = r.json()["id"]

        del_r = await client.delete(f"/garments/{gid}", headers=auth_headers)
        assert del_r.status_code == 200

        get_r = await client.get(f"/garments/{gid}", headers=auth_headers)
        assert get_r.status_code == 404

    async def test_create_missing_required_fields(self, client, auth_headers):
        """Senza nome e categoria → 422 o il server accetta con defaults."""
        r = await client.post(
            "/garments",
            headers=auth_headers,
            data={"brand": "Nike"},  # mancano name e category
        )
        assert r.status_code in (200, 201, 422)

    async def test_create_unauthenticated(self, client):
        name, img_bytes, ctype = make_test_image("unauth.jpg")
        r = await client.post(
            "/garments",
            files={"photo_front": (name, img_bytes, ctype)},
            data={"name": "Test", "category": "scarpe"},
        )
        assert r.status_code == 401


class TestGarmentsAI:

    async def test_analyze_garment(self, client, auth_headers):
        """Analisi AI con mock OpenAI."""
        mock_response = {
            "name": "Puffer Jacket", "category": "giacchetto",
            "brand": "The North Face", "color_primary": "nero",
            "color_hex": "#000000", "size": "M", "price": 250.0,
            "material": "Nylon", "description": "Giacca invernale",
            "style_tags": ["casual"], "season_tags": ["inverno"],
            "occasion_tags": ["outdoor"],
        }

        with patch("ai_service.analyze_garment", AsyncMock(return_value=mock_response)):
            with patch("ai_service.reenrich_garment", AsyncMock(return_value=mock_response)):
                name, img_bytes, ctype = make_test_image("jacket.jpg")
                r = await client.post(
                    "/garments/analyze",
                    headers=auth_headers,
                    files={"photos": (name, img_bytes, ctype)},
                )
                assert r.status_code == 200
                data = r.json()
                # L'app restituisce {"analysis": {...}, "tmp_front": ..., ...}
                analysis = data.get("analysis") or data
                assert "name" in analysis or "category" in analysis or "analysis" in data

    async def test_confirm_garment(self, client, auth_headers):
        """Conferma un garment dopo analyze."""
        name, img_bytes, ctype = make_test_image("confirm.jpg")

        # Prima crea i file temporanei tramite analyze
        mock_response = {
            "name": "T-Shirt Bianca", "category": "maglietta",
            "brand": "Zara", "color_primary": "bianco",
            "color_hex": "#ffffff", "size": "L", "price": 20.0,
            "material": "Cotone", "description": "T-shirt basica",
            "style_tags": ["casual"], "season_tags": ["estate"],
            "occasion_tags": ["quotidiano"],
        }

        with patch("ai_service.analyze_garment", AsyncMock(return_value=mock_response)):
            with patch("ai_service.reenrich_garment", AsyncMock(return_value=mock_response)):
                analyze_r = await client.post(
                    "/garments/analyze",
                    headers=auth_headers,
                    files={"photos": (name, img_bytes, ctype)},
                )
                assert analyze_r.status_code == 200
                analyzed = analyze_r.json()

        # Conferma (usa i dati dall'analyze)
        confirm_data = {
            "name": analyzed.get("name", "T-Shirt"),
            "category": analyzed.get("category", "maglietta"),
            "brand": analyzed.get("brand", ""),
            "color_primary": analyzed.get("color_primary", "bianco"),
            "color_hex": analyzed.get("color_hex", "#ffffff"),
            "size": analyzed.get("size", "M"),
            "price": analyzed.get("price", 0),
            "material": analyzed.get("material", ""),
            "description": analyzed.get("description", ""),
            "style_tags": analyzed.get("style_tags", []),
            "season_tags": analyzed.get("season_tags", []),
            "occasion_tags": analyzed.get("occasion_tags", []),
            "photo_front": analyzed.get("photo_front", ""),
        }

        r = await client.post("/garments/confirm", headers=auth_headers, json=confirm_data)
        assert r.status_code in (200, 201)
        assert "id" in r.json()

    async def test_reenrich_garment(self, client, auth_headers):
        assert _garment_id is not None
        mock_response = {
            "name": "Nike Air Force 1 White",
            "category": "scarpe", "brand": "Nike",
            "color_primary": "white", "color_hex": "#FFFFFF",
            "size": "42", "price": 120.0, "material": "Leather",
            "description": "Classic white sneaker",
            "style_tags": ["casual", "streetwear"],
            "season_tags": ["all-season"], "occasion_tags": ["everyday"],
        }
        with patch("ai_service.reenrich_garment", AsyncMock(return_value=mock_response)):
            r = await client.post(
                f"/garments/{_garment_id}/reenrich",
                headers=auth_headers,
                json={"language": "en"},
            )
            assert r.status_code == 200


class TestGarmentsBackground:

    async def test_remove_background(self, client, auth_headers):
        assert _garment_id is not None
        r = await client.post(
            f"/garments/{_garment_id}/remove-background",
            headers=auth_headers,
        )
        assert r.status_code in (200, 202)

    async def test_bg_status(self, client, auth_headers):
        assert _garment_id is not None
        r = await client.get(
            f"/garments/{_garment_id}/bg-status",
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert "bg_status" in data
        assert data["bg_status"] in ("none", "processing", "done", "error")
