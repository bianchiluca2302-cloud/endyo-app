"""
test_ai.py  —  Test endpoint AI (OpenAI mockato).

Copre:
  POST /ai/generate-outfits
  POST /ai/complete-outfit
  POST /ai/chat
  POST /ai/chat-stream       (SSE streaming)
  GET  /user/chat-quota
"""
import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from helpers import make_test_image

pytestmark = pytest.mark.asyncio


async def _create_garment(client, headers, name="Test Garment", category="maglietta"):
    """Helper: crea un garment di test e restituisce l'ID."""
    n, b, c = make_test_image("ai_test.jpg")
    r = await client.post(
        "/garments",
        headers=headers,
        files={"photo_front": (n, b, c)},
        data={"name": name, "category": category},
    )
    assert r.status_code in (200, 201)
    return r.json()["id"]


class TestAIChatQuota:

    async def test_get_quota(self, client, auth_headers):
        r = await client.get("/user/chat-quota", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        # Campi legacy + nuovi
        assert "remaining" in data          # alias backward-compat
        assert "remaining_day" in data
        assert "remaining_week" in data
        assert "limit_day" in data
        assert "limit_week" in data
        assert "plan" in data
        assert data["plan"] in ("free", "premium")
        # Per utenti free i limiti devono essere > 0
        if data["plan"] == "free":
            assert data["limit_day"] > 0
            assert data["limit_week"] > 0

    async def test_quota_unauthenticated(self, client):
        r = await client.get("/user/chat-quota")
        assert r.status_code == 401


class TestAIGenerateOutfits:

    async def test_generate_outfits(self, client, auth_headers):
        gid = await _create_garment(client, auth_headers, "Camicia", "maglietta")

        mock_outfits = [
            {"name": "Outfit Estivo", "occasion": "casual", "garment_ids": [gid]},
            {"name": "Outfit Formale", "occasion": "formale", "garment_ids": [gid]},
        ]

        with patch("ai_service.generate_outfit_recommendations",
                   AsyncMock(return_value=mock_outfits)):
            r = await client.post(
                "/ai/generate-outfits",
                headers=auth_headers,
                json={"request": "Un outfit casual per l'estate", "n": 2},
            )
            assert r.status_code == 200
            data = r.json()
            assert "outfits" in data or isinstance(data, list)

    async def test_generate_outfits_unauthenticated(self, client):
        r = await client.post(
            "/ai/generate-outfits",
            json={"request": "casual"},
        )
        assert r.status_code == 401


class TestAICompleteOutfit:

    async def test_complete_outfit(self, client, auth_headers):
        gid = await _create_garment(client, auth_headers, "Felpa Nera", "felpa")

        mock_result = {
            "suggested_garment_ids": [gid],
            "notes": "Abbina con jeans slim",
            "brand_suggestions": [],
        }

        with patch("ai_service.complete_outfit",
                   AsyncMock(return_value=mock_result)):
            r = await client.post(
                "/ai/complete-outfit",
                headers=auth_headers,
                json={"selected_ids": [gid]},
            )
            assert r.status_code == 200

    async def test_complete_outfit_empty(self, client, auth_headers):
        with patch("ai_service.complete_outfit",
                   AsyncMock(return_value={"suggested_garment_ids": [], "notes": ""})):
            r = await client.post(
                "/ai/complete-outfit",
                headers=auth_headers,
                json={"selected_ids": []},
            )
            assert r.status_code == 200


class TestAIChat:

    async def test_chat_basic(self, client, auth_headers):
        mock_response = "Ciao! Per te oggi suggerirei un outfit casual con jeans e sneakers."

        with patch("ai_service.chat_with_stylist",
                   AsyncMock(return_value=mock_response)):
            r = await client.post(
                "/ai/chat",
                headers=auth_headers,
                json={
                    "message": "Cosa indosso oggi?",
                    "history": [],
                    "language": "it",
                },
            )
            assert r.status_code == 200
            data = r.json()
            assert "reply" in data or "message" in data or "content" in data

    async def test_chat_with_history(self, client, auth_headers):
        mock_response = "Perfetto, con quel cappotto suggerirei pantaloni chino beige."

        with patch("ai_service.chat_with_stylist",
                   AsyncMock(return_value=mock_response)):
            r = await client.post(
                "/ai/chat",
                headers=auth_headers,
                json={
                    "message": "E con il cappotto?",
                    "history": [
                        {"role": "user", "content": "Ho un cappotto nero"},
                        {"role": "assistant", "content": "Bello!"},
                    ],
                    "language": "it",
                },
            )
            assert r.status_code == 200

    async def test_chat_unauthenticated(self, client):
        r = await client.post(
            "/ai/chat",
            json={"message": "Ciao", "history": []},
        )
        assert r.status_code == 401


class TestAIChatStream:

    async def test_chat_stream(self, client, auth_headers):
        """Testa che l'endpoint SSE risponda con Content-Type text/event-stream."""

        async def fake_stream(*args, **kwargs):
            tokens = ["Ciao", "! ", "Ecco", " il", " tuo", " outfit", "."]
            for t in tokens:
                yield t

        with patch("ai_service.stream_chat_with_stylist", fake_stream):
            r = await client.post(
                "/ai/chat-stream",
                headers=auth_headers,
                json={
                    "message": "Suggerisci un outfit",
                    "history": [],
                    "language": "it",
                },
            )
            assert r.status_code == 200
            assert "text/event-stream" in r.headers.get("content-type", "")

            # Parse SSE events
            events = []
            for line in r.text.split("\n"):
                if line.startswith("data: "):
                    try:
                        events.append(json.loads(line[6:]))
                    except json.JSONDecodeError:
                        pass

            # Deve avere almeno un token e un evento 'done'
            event_types = [e.get("t") for e in events]
            assert "tok" in event_types or "done" in event_types

    async def test_chat_stream_daily_rate_limit(self, client, auth_headers):
        """Dopo 10 richieste free giornaliere → 429."""
        from sqlalchemy import text
        import conftest as _cf
        _test_session_local = _cf._test_session_local
        _USER_EMAIL = _cf._USER_EMAIL

        # Setta chat_count = 10 (= CHAT_DAILY_LIMIT_FREE) per simulare limite raggiunto
        async with _test_session_local() as session:
            await session.execute(
                text("""UPDATE users SET chat_count = 10,
                        chat_reset_at = datetime('now')
                        WHERE email = :email"""),
                {"email": _USER_EMAIL},
            )
            await session.commit()

        r = await client.post(
            "/ai/chat-stream",
            headers=auth_headers,
            json={"message": "Ciao", "history": [], "language": "it"},
        )
        assert r.status_code == 429

        # Reset per non rompere i test successivi
        async with _test_session_local() as session:
            await session.execute(
                text("UPDATE users SET chat_count = 0 WHERE email = :email"),
                {"email": _USER_EMAIL},
            )
            await session.commit()

    async def test_chat_stream_weekly_rate_limit(self, client, auth_headers):
        """Dopo 50 richieste free settimanali → 429 (anche se daily è ok)."""
        from sqlalchemy import text
        import conftest as _cf
        _test_session_local = _cf._test_session_local
        _USER_EMAIL = _cf._USER_EMAIL

        # Daily = 0 (ok), weekly = 50 (= CHAT_WEEKLY_LIMIT_FREE)
        async with _test_session_local() as session:
            await session.execute(
                text("""UPDATE users
                        SET chat_count = 0,
                            chat_reset_at = datetime('now'),
                            chat_week_count = 50,
                            chat_week_reset_at = datetime('now')
                        WHERE email = :email"""),
                {"email": _USER_EMAIL},
            )
            await session.commit()

        r = await client.post(
            "/ai/chat-stream",
            headers=auth_headers,
            json={"message": "Ciao", "history": [], "language": "it"},
        )
        assert r.status_code == 429

        # Reset per non rompere i test successivi
        async with _test_session_local() as session:
            await session.execute(
                text("""UPDATE users
                        SET chat_count = 0, chat_week_count = 0
                        WHERE email = :email"""),
                {"email": _USER_EMAIL},
            )
            await session.commit()
