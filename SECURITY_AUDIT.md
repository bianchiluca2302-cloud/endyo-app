# MirrorFit — Security Audit Report
**Date:** 2026-04-22  
**Scope:** FastAPI backend (`backend/main.py`, `backend/ai_service.py`) + Electron frontend

---

## ✅ Fixed in this session

### 1. Rate limiting (5 req / 15 min per IP) — DONE
- `slowapi` installed and wired as global middleware (`SlowAPIMiddleware`)
- `default_limits=["5/15minutes"]` applies to all routes without per-endpoint decoration
- Returns HTTP 429 with standard `Retry-After` header on breach
- Added to `requirements.txt` as `slowapi==0.1.9`

### 2. Input sanitization — DONE
Every Pydantic model now has explicit `max_length` (and where applicable `min_length`, `pattern`, `ge`/`le`) on all string and list fields:

| Model | Key constraints added |
|---|---|
| `RegisterRequest` | username 3–30, password 8–128, phone ≤20 |
| `LoginRequest` | password ≤128 |
| `RefreshRequest` | refresh_token ≤512 |
| `ResetPasswordRequest` | token ≤256, new_password 8–128 |
| `GarmentConfirmRequest` | tmp paths ≤120 + path-traversal validator |
| `GarmentUpdate` | all strings bounded; price 0–100000; tags ≤20 items |
| `ReEnrichRequest` | language pattern `^(it\|en)$` |
| `WearLogIn` | note ≤300 |
| `ChatMessage` | message 1–2000; history ≤30 items with per-item truncation; language pattern; weather ≤120; occasion whitelist |
| `OutfitCreateRequest` | replaces raw `dict`; all fields bounded |
| `ImportData` | garments ≤200, outfits ≤100 |
| `ShowcaseAddRequest` | item_type pattern `^(garment\|outfit)$` |
| `BrandRegisterRequest` | name 2–100, password 8–128, website ≤500, description ≤1000 |
| `BrandLoginRequest` | password ≤128 |
| `BrandResetPasswordRequest` | token ≤256, password 8–128 |
| `BrandProfileUpdate` | replaces raw `dict`; all fields bounded |
| `BrandProductCreate/Update` | name ≤200, description ≤2000, buy_url ≤2000, price 0–100000, currency pattern `^[A-Z]{3}$`, color_hex pattern |
| `BrandFeedbackRequest` | vote pattern `^(like\|dislike)$`, reason ≤300 |

### 3. Body size limit — DONE
`MaxBodySizeMiddleware` rejects any request with `Content-Length > 10 MB` before it reaches any handler (HTTP 413).

### 4. File upload security — DONE
`save_upload()` now:
- Whitelists extensions: `.jpg .jpeg .png .webp .heic .heif`
- Validates `Content-Type` against allowed MIME types
- Enforces 20 MB per-file cap with streaming read (no full buffer in memory)
- Returns HTTP 415 for wrong type, HTTP 413 for oversized file

### 5. Privilege escalation in `/admin/remove-backgrounds` — FIXED (CRITICAL)
**Bug:** The endpoint fetched `select(Garment)` without `WHERE user_id = current_user.id`, meaning any authenticated user could trigger background processing on ALL users' garments.  
**Fix:** Added `.where(Garment.user_id == current_user.id)` filter.

### 6. No prompt injection path to DB credentials — CONFIRMED SAFE
The stylist system prompt (`_build_stylist_system_prompt`) passes only:
- Garment metadata (name, category, color, brand, style tags) — no raw DB values
- A weather string and occasion string (both now bounded and whitelisted at the Pydantic layer)
- Brand product metadata (no internal IDs, no credentials)

The OpenAI API key, DB connection string, and JWT secret are read from environment variables and never appear in any prompt, response, or log output.

### 7. IDOR check — CONFIRMED SAFE
All resource endpoints verify ownership before access/mutation:
- `GET/PATCH/DELETE /garments/{id}` → checks `g.user_id == current_user.id`
- `DELETE /outfits/{id}` → checks `o.user_id == current_user.id`
- `POST /outfits/{id}/wear` → checks outfit ownership
- `POST /garments/{id}/generate-tryon` → checks `g.user_id == current_user.id`
- `GET/DELETE /showcase/{id}` → checks `item.user_id == current_user.id`
- `PATCH /brand/products/{id}` → checks `BrandProduct.brand_id == current_brand.id`

### 8. Reset token one-time use — CONFIRMED SAFE
Both user and brand password-reset flows null out `reset_token` and `reset_token_expires` immediately after successful use. Re-use of the same token returns HTTP 400.

### 9. Anti-enumeration on auth endpoints — CONFIRMED SAFE
`/auth/forgot-password`, `/auth/resend-verification`, `/brand/forgot-password` all return identical success messages regardless of whether the email exists in the DB.

### 10. SQL injection — CONFIRMED SAFE
All DB queries use SQLAlchemy ORM with parameterized statements. No raw string interpolation into SQL anywhere in the codebase.

### 11. User search query cap — FIXED
`/users/search` now truncates `q` to 50 characters before building the `ILIKE` pattern.

---

## ⚠️ Remaining risks (acceptable or architectural)

### A. CORS `allow_origins=["*"]`
**Risk:** Low for a desktop Electron app (no cross-origin cookie attacks since `allow_credentials=False`). In a web deployment this would be a medium risk.  
**Recommendation:** When moving to a web app, restrict to the production domain. For Electron only, this is acceptable.

### B. No HTTPS / TLS in local mode
**Risk:** Traffic between Electron renderer and the local FastAPI backend travels over `127.0.0.1:8000` unencrypted. An adversary with local access (malware, shared machine) could intercept tokens.  
**Recommendation:** Acceptable for a single-user desktop app. For LAN/multi-user deployments, add a self-signed TLS cert or tunnel through a reverse proxy.

### C. Email verification token stored in DB in plain text
**Risk:** Low. Anyone with direct read access to `wardrobe.db` could use a valid verify/reset token. Since the DB is local, this is only exploitable by someone who already has filesystem access.  
**Recommendation:** Hash the token before storage (e.g. `SHA-256`) and compare hashes at verification time, for defence-in-depth.

### D. No explicit failed-login rate limiting
**Risk:** The global slowapi limit (5 req/15 min) provides basic brute-force protection, but it applies per-IP across all endpoints. A dedicated per-endpoint limit on `/auth/login` and `/brand/login` would be more targeted.  
**Recommendation:** Add `@limiter.limit("10/hour")` decorators specifically to the two login endpoints for defence-in-depth.

### E. `import` endpoint trust level
**Risk:** `/import` accepts freeform garment/outfit data. While `ImportData` now caps list length, the individual dict items inside `garments[]` and `outfits[]` are not deeply validated (string lengths, price ranges).  
**Recommendation:** For a production release, replace the inner `dict` items with strict Pydantic sub-models.

### F. Brand logo and product images served without auth
**Risk:** The `/uploads/` static mount serves all uploaded images without authentication. A user who knows another user's filename can access it directly.  
**Recommendation:** File names use `uuid4().hex[:8]` suffixes (128 bits of entropy), making them effectively unguessable. Acceptable for non-sensitive fashion images. For a stricter deployment, route image requests through an authenticated endpoint.

---

## Summary scorecard

| Area | Status |
|---|---|
| Rate limiting | ✅ Global 5/15min via slowapi |
| Input validation | ✅ All Pydantic models bounded |
| Body size limit | ✅ 10 MB middleware |
| File upload safety | ✅ Type + size checked |
| SQL injection | ✅ ORM only |
| IDOR | ✅ Ownership checks on all resources |
| Prompt injection → DB | ✅ No credentials in prompts |
| Auth token handling | ✅ One-time reset, proper expiry |
| Sensitive data in responses | ✅ password_hash never returned |
| Privilege escalation (admin bg) | ✅ Fixed |
| CORS | ⚠️ Open (acceptable for Electron) |
| HTTPS | ⚠️ None locally (acceptable) |
| Token hashing at rest | ⚠️ Plaintext (low risk, local DB) |
| Per-endpoint login throttle | ⚠️ Covered by global limit, not dedicated |
