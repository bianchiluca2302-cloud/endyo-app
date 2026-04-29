"""
helpers.py  —  Costanti e utility condivise tra i test.

Importabile da qualsiasi test file senza effetti collaterali.
"""
import io
import sys
from pathlib import Path

# Assicura che backend/ sia nel path (ridondante se conftest già lo fa, ma sicuro)
_BACKEND = Path(__file__).parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

# ── Credenziali utente di test ────────────────────────────────────────────────
_USER_EMAIL    = "test_user@example.com"
_USER_PASSWORD = "TestPass123!"
_USER_USERNAME = "testuser"

# ── Credenziali brand di test ─────────────────────────────────────────────────
_BRAND_EMAIL    = "brand@example.com"
_BRAND_PASSWORD = "BrandPass123!"
_BRAND_NAME     = "TestBrand"


def make_test_image(name: str = "test.jpg") -> tuple:
    """
    Restituisce (filename, bytes, content_type) per un'immagine JPEG 10x10
    usata nei test di upload.
    """
    from PIL import Image as _PILImage
    buf = io.BytesIO()
    img = _PILImage.new("RGB", (10, 10), color=(200, 150, 100))
    img.save(buf, format="JPEG")
    buf.seek(0)
    return name, buf.read(), "image/jpeg"
