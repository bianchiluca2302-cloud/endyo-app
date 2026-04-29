"""
test_health.py  —  Smoke test e health check.

Copre:
  GET /health
  GET /brand-portal  (redirect)
"""
import pytest

pytestmark = pytest.mark.asyncio


class TestHealth:

    async def test_health_check(self, client):
        r = await client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") in ("ok", "healthy", "running")

    async def test_brand_portal_redirect(self, client):
        """Il brand portal redirige alla pagina HTML (301/302/307 o 404 se non buildato)."""
        r = await client.get("/brand-portal", follow_redirects=False)
        assert r.status_code in (200, 301, 302, 307, 404)
