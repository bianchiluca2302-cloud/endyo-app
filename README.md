# Endyo — AI Wardrobe

> Your wardrobe, made intelligent. Endyo analyzes your clothes with AI, builds outfits, and helps you dress better every day.

**Endyo** is a full-stack PWA installable on iOS, Android, and Desktop. Upload a photo of any garment and the AI identifies category, colors, materials, style tags, and season — instantly. Build outfits visually, chat with an AI stylist, discover what to buy next, and share looks with friends.

---

## Features

### Wardrobe
- Upload garment photos (front / back / label) — AI fills in all details automatically
- Automatic background removal (u2netp model, runs locally)
- Filter and sort by category, color, brand, season, or date
- Pull-to-refresh, skeleton loading, haptic feedback
- Compact or standard card layout

### Outfit Builder
- Visual drag-and-drop **Mixer** — layer garments as they'd look when worn
- Save outfits, track how often you wear them
- **AI Stylist** (Claude) — describe an occasion and get a full outfit suggestion
- Weather-aware recommendations via live forecast
- AI auto-complete: have the AI fill in the missing pieces for a selected base

### Color Analysis (Armocromia)
- Upload a face photo — AI identifies your seasonal color palette
- Recommendations for which colors in your wardrobe suit you best

### Travel Planner
- Enter a destination and dates — AI builds a packing list from your actual wardrobe

### Social
- Follow friends, post outfits and garments
- Social feed with infinite scroll (preloaded on login)
- Likes, notifications, user discovery based on style tags

### Shopping Advisor
- AI scans your wardrobe for gaps and suggests real brand products

### Account
- Email + password or **Google OAuth**
- Free plan with daily/weekly AI quotas
- **Premium** via Stripe — unlimited AI requests
- Profile with measurements, style preferences, profile picture
- Full Italian and English support

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + Vite, Zustand, React Router, PWA |
| **Mobile UI** | Dedicated `Mobile*` components detected via `useIsMobile()` |
| **Backend** | FastAPI + SQLAlchemy (async), PostgreSQL, deployed on Railway |
| **AI — Analysis** | GPT-4 Vision — garment recognition, color analysis, armocromia |
| **AI — Stylist** | Claude (Anthropic) — chat, outfit generation, travel planner |
| **BG Removal** | `rembg` / u2netp via isolated Python subprocess |
| **Auth** | JWT (access + refresh tokens), Google OAuth 2.0 |
| **Payments** | Stripe |
| **i18n** | `useT()` hook — `it` / `en` |

---

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- PostgreSQL database (or use Railway)

### Frontend

```bash
npm install
npm run dev
```

App runs at `http://localhost:5173`.

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

API runs at `http://localhost:8000`.

### Environment variables

Create `backend/.env`:

```env
DATABASE_URL=postgresql+asyncpg://user:password@host/dbname
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
SECRET_KEY=your-random-secret-key
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
```

---

## Project Structure

```
wardrobe-ai-app/
├── src/
│   ├── pages/          # Wardrobe, Upload, OutfitBuilder, Profile, Friends, Shopping, Premium
│   ├── mobile/         # Mobile-first components (MobileWardrobe, MobileUpload, …)
│   ├── components/     # Shared UI — Navbar, Modals, Toast, GarmentCard, OutfitCanvas
│   ├── store/          # Zustand stores — wardrobeStore, authStore, settingsStore
│   ├── hooks/          # useIsMobile, usePullToRefresh, useHaptic, useDebounce, useWeather
│   ├── api/            # API client, brand client
│   └── i18n/           # Translations it/en
├── backend/
│   ├── main.py         # All FastAPI endpoints
│   ├── models.py       # SQLAlchemy models
│   ├── ai_service.py   # GPT-4 Vision + Claude integrations
│   └── bg_service.py   # Background removal subprocess (u2netp)
├── public/
│   ├── Endyoapp.png    # App icon
│   └── manifest.json   # PWA manifest
└── index.html
```

---

## API Overview

| Endpoint | Method | Description |
|---|---|---|
| `/garments` | GET / POST | List all garments / create new |
| `/garments/analyze` | POST | AI analysis without saving |
| `/garments/confirm` | POST | Save garment after analysis |
| `/garments/{id}` | PATCH / DELETE | Update / delete a garment |
| `/garments/{id}/remove-bg` | POST | Trigger background removal |
| `/outfits` | GET / POST | List / create outfits |
| `/outfits/{id}/wear` | POST | Record a wear event |
| `/ai/chat` | POST | Stylist chat (streaming) |
| `/ai/complete-outfit` | POST | AI auto-complete outfit |
| `/ai/generate-outfits` | POST | Generate outfit suggestions |
| `/profile` | GET / POST | User profile |
| `/auth/register` | POST | Register with email |
| `/auth/login` | POST | Login with email |
| `/auth/google` | POST | Google OAuth login |
| `/auth/refresh` | POST | Refresh access token |
| `/shopping/advisor` | POST | AI shopping recommendations |
| `/social/feed` | GET | Social feed |
| `/social/posts` | GET / POST | Posts |
| `/social/follow/{username}` | POST | Follow a user |
| `/premium/checkout` | POST | Stripe checkout session |

---

## Image Storage

Garment photos (front, back, label) and profile pictures are stored as base64 in `TEXT` columns on PostgreSQL. This keeps images available across server restarts without relying on a filesystem or external object storage.

---

## License

Private — all rights reserved.
