# Endyo — AI Wardrobe App

PWA per la gestione intelligente dell'armadio con Stylist AI, rimozione sfondo automatica e shopping advisor.

---

## Stack

| Layer | Tecnologie |
|-------|-----------|
| Frontend | React 18 + Vite, Zustand, React Router, PWA (manifest + service worker) |
| Backend | FastAPI + SQLAlchemy async, PostgreSQL, Railway |
| AI | GPT-4 Vision (analisi capi), Claude (stylist chat, outfit generation) |
| BG Removal | u2netp via `bg_service.py` (subprocess isolato) |
| Auth | JWT + Google OAuth |
| i18n | `useT()` hook — supporto `it` / `en` |

---

## Avvio rapido

```bash
# Frontend
npm install
npm run dev

# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Configura `backend/.env`:
```
DATABASE_URL=postgresql+asyncpg://...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
SECRET_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

## Struttura

```
wardrobe-ai-app/
├── src/
│   ├── pages/          # Wardrobe, Upload, OutfitBuilder, Profile, Friends, …
│   ├── mobile/         # Componenti mobile (prefisso Mobile*)
│   ├── components/     # Navbar, Modali, UI condivisa
│   ├── store/          # wardrobeStore, authStore, settingsStore (Zustand)
│   ├── api/            # client.ts — chiamate API + helpers
│   └── i18n/           # Traduzioni it/en
├── backend/
│   ├── main.py         # FastAPI — tutti gli endpoint
│   ├── models.py       # SQLAlchemy models
│   ├── ai_service.py   # GPT-4 Vision + Claude
│   └── bg_service.py   # Rimozione sfondo (u2netp)
├── public/
│   ├── Endyoapp.png    # Logo / icona app
│   └── manifest.json   # PWA manifest
└── index.html
```

---

## Funzionalità principali

- Upload foto capo (fronte/retro/etichetta) con analisi AI automatica
- Rimozione sfondo automatica (u2netp)
- Builder outfit drag & select + Mixer visuale
- Stylist AI chat (Claude) — suggerisce abbinamenti
- Shopping Advisor — raccomanda prodotti brand in base al guardaroba
- Analisi Armocromia (foto viso → stagione colore)
- Profilo utente con misure, stile, foto persistente
- Sistema amicizie e feed social (post outfit/capi)
- Piano Free / Premium con quote giornaliere/settimanali
- PWA installabile su iOS/Android/Desktop

---

## Persistenza immagini

Le foto dei capi (fronte, retro, etichetta) e la foto profilo vengono salvate come base64 in colonne `TEXT` su PostgreSQL (`photo_front_data`, `photo_back_data`, `photo_label_data`, `profile_picture_data`). Questo garantisce che le immagini sopravvivano ai restart del server senza dipendere dal filesystem.

---

## API principali

| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/garments` | GET/POST | Lista / crea capi |
| `/garments/analyze` | POST | Analisi AI senza creare record |
| `/garments/confirm` | POST | Conferma capo dopo analisi |
| `/garments/{id}` | PATCH/DELETE | Modifica / elimina |
| `/outfits` | GET/POST | Lista / crea outfit |
| `/ai/chat` | POST | Chat stylist AI |
| `/ai/generate-outfits` | POST | Genera outfit con AI |
| `/profile` | GET/POST | Profilo utente |
| `/auth/login` | POST | Login email+password |
| `/auth/google` | POST | Login Google OAuth |
| `/shopping/advisor` | POST | Raccomandazioni prodotti |
