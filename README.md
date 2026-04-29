# 👔 Wardrobe AI

App desktop cross-platform per la gestione intelligente dell'armadio con visualizzazione 3D e stylist AI.

---

## 🚀 Avvio rapido

### 1. Setup (una sola volta)

**macOS / Linux:**
```bash
chmod +x setup.sh
./setup.sh
```

**Windows:**
```
setup.bat
```

### 2. Configura API Key

Apri `backend/.env` e inserisci la tua chiave OpenAI:
```
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
> Ottieni la chiave su https://platform.openai.com/api-keys

### 3. Avvia l'app

```bash
npm run dev
```

Questo avvia in parallelo:
- Il **server backend** Python su `http://localhost:8000`
- L'**app Electron** con UI React

---

## 🏗️ Architettura

```
wardrobe-ai-app/
├── electron.cjs          # Electron main process
├── src/                  # React frontend
│   ├── pages/
│   │   ├── Wardrobe.jsx  # Griglia capi con filtri
│   │   ├── Upload.jsx    # Caricamento foto + analisi AI
│   │   ├── OutfitBuilder.jsx  # Editor outfit + avatar 3D
│   │   └── Assistant.jsx # Chat con stylist AI
│   ├── components/
│   │   ├── Viewer3D.jsx  # Visualizzatore 3D per singolo capo
│   │   └── AvatarOutfit.jsx  # Avatar 3D completo con outfit
│   └── store/
│       └── wardrobeStore.js  # State management (Zustand)
└── backend/              # FastAPI Python
    ├── main.py           # API endpoints
    ├── models.py         # DB models (SQLAlchemy)
    ├── ai_service.py     # Integrazione OpenAI
    └── wardrobe.db       # Database SQLite (auto-generato)
```

---

## ✨ Funzionalità

| Feature | Stato |
|---------|-------|
| Upload foto (fronte/retro/etichetta) | ✅ |
| Analisi AI automatica (GPT-4 Vision) | ✅ |
| Riconoscimento brand, taglia, prezzo, materiale | ✅ |
| Viewer 3D ruotabile per singolo capo | ✅ |
| Avatar 3D con outfit indossato | ✅ |
| Builder outfit drag & select | ✅ |
| Generazione outfit AI | ✅ |
| Chat con stylist AI | ✅ |
| Database locale (offline) | ✅ |
| 6 categorie capi | ✅ |

---

## ⚠️ Limitazioni principali

### 1. 🎭 Modelli 3D geometrici, non realistici
I modelli 3D dei capi sono costruiti con geometrie Three.js (box, cylinder, sphere). Rappresentano la *forma* del capo con la texture della foto applicata, ma non sono ricostruzioni fotorealistiche. Per arrivare a modelli 3D realistici servirebbero:
- Tecniche di **NeRF** o **3D Gaussian Splatting** (richiedono decine di foto + GPU potente)
- Servizi cloud specializzati come Luma AI o Zero123

### 2. 🧍 Avatar stilizzato, non personalizzato
L'avatar 3D è una figura umana semplificata fatta di primitive Three.js. Per un avatar basato sulle misure reali dell'utente servirebbe:
- **Body scanning** (iPhone Pro con LiDAR, o app dedicate come Body Labs)
- Modelli parametrici come **SMPL/SMPL-X** (ricerca accademica)
- I capi *non si adattano fisicamente* al corpo (no cloth simulation)

### 3. 🧵 Nessuna cloth simulation
Fare "indossare" realisticamente un capo a un avatar richiede una simulazione fisica dei tessuti (come Marvelous Designer o motori come NVIDIA PhysX). Questo è computazionalmente intensivo e va oltre l'ambito di un'app desktop leggera.

### 4. 💰 Ricerca prezzi limitata
Il prezzo viene letto dall'etichetta (se visibile). Per ottenere prezzi di mercato aggiornati servirebbe:
- Integrazione con Google Shopping API
- Scraping di Zalando/Amazon (soggetto a ToS)

### 5. 📏 Rilevamento taglie approssimativo
La taglia viene letta dall'etichetta fotografata. Senza misurazioni corporee non è possibile dire se un capo *andrà bene* all'utente.

### 6. 🌐 Dipendenza da OpenAI
Il riconoscimento automatico e gli outfit AI richiedono connessione internet e costi API di OpenAI. In assenza di chiave API, le funzionalità AI sono disabilitate ma l'app funziona in modalità manuale.

---

## 🛣️ Roadmap futura

- [ ] Import da foto multipole per ricostruzione 3D migliorata
- [ ] Integrazione con Luma AI per modelli 3D fotorealistici
- [ ] Body measurements onboarding per avatar proporzionato
- [ ] Meteo integration (suggerisce outfit in base al tempo)
- [ ] Calendario outfits (non indossare lo stesso outfit due volte vicine)
- [ ] Export look come immagine / PDF
- [ ] Condivisione outfit con amici

---

## 🔧 API Backend

| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/garments` | GET | Lista tutti i capi |
| `/garments` | POST | Aggiungi capo (multipart) |
| `/garments/{id}` | PATCH | Modifica capo |
| `/garments/{id}` | DELETE | Elimina capo |
| `/outfits` | GET | Lista outfit |
| `/outfits` | POST | Salva outfit |
| `/ai/generate-outfits` | POST | Genera outfit con AI |
| `/ai/chat` | POST | Chat con stylist AI |
| `/profile` | GET/POST | Profilo utente |
