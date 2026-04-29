import os
import base64
import json
import io
from openai import AsyncOpenAI
from pathlib import Path
from dotenv import load_dotenv
from PIL import Image

load_dotenv()

# ── Client OpenAI separati per servizio ───────────────────────────────────────
# Ogni client usa la propria API key (progetto separato su platform.openai.com)
client_vision   = AsyncOpenAI(api_key=os.getenv("OPENAI_KEY_VISION",   ""))  # analisi/caricamento capi
client_stylist  = AsyncOpenAI(api_key=os.getenv("OPENAI_KEY_STYLIST",  ""))  # stylist chat + outfit AI
client_shopping = AsyncOpenAI(api_key=os.getenv("OPENAI_KEY_SHOPPING", ""))  # shopping advisor

# Alias retrocompatibile (usato nei check os.getenv interni)
client = client_stylist

# Modelli configurabili via .env
VISION_MODEL = os.getenv("VISION_MODEL", "gpt-4o-mini")
TEXT_MODEL   = os.getenv("TEXT_MODEL",   "gpt-4o-mini")

CATEGORIES_IT = {
    "cappello":   "hat/cap/beanie",
    "maglietta":  "t-shirt/shirt/polo",
    "felpa":      "sweatshirt/sweater/hoodie/knitwear",
    "giacchetto": "jacket/coat/blazer/vest",
    "pantaloni":  "pants/jeans/trousers/shorts/skirt",
    "scarpe":     "shoes/sneakers/boots/sandals",
    "occhiali":   "glasses/sunglasses/eyewear",
    "cintura":    "belt",
    "borsa":      "bag/backpack/handbag/wallet/purse",
    "orologio":   "watch/smartwatch",
    "altro":      "other accessory (jewelry, scarf, tie, gloves, socks, underwear, etc.)",
}


def encode_image(image_path: str, max_px: int = 512) -> tuple[str, str]:
    """
    Ridimensiona l'immagine a max_px sul lato più lungo, poi la codifica in base64.
    Restituisce (base64_string, media_type).

    Perché: OpenAI tokenizza la stringa base64 come testo prima di processarla come
    immagine. Una foto da 3 MP → ~3 MB → base64 ~4 MB → decine di migliaia di token.
    Dopo il resize a 512px la base64 è < 50 KB → ~10-15x meno token in input.
    """
    with Image.open(image_path) as img:
        img.thumbnail((max_px, max_px), Image.LANCZOS)
        if img.mode in ('RGBA', 'P', 'LA'):
            img = img.convert('RGB')
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=85, optimize=True)
        buf.seek(0)
        encoded = base64.standard_b64encode(buf.read()).decode('utf-8')
    return encoded, 'image/jpeg'


async def analyze_garment(
    photo_front: str | None = None,
    photo_back: str | None = None,
    photo_label: str | None = None,
    language: str = 'it',
) -> dict:
    """
    Analisi in due step per ottimizzare costi e qualità:
      Step 1 — VISION_MODEL (mini) con immagini → riconoscimento oggettivo
               (name, category, brand, color, size, price, material)
      Step 2 — TEXT_MODEL (gpt-4o) solo testo → arricchimento qualitativo
               (description, style_tags, season_tags, occasion_tags)
    Costo totale stimato: ~€0.0035 vs ~€0.010 con gpt-4o full.
    """
    if not os.getenv("OPENAI_KEY_VISION"):
        return _mock_analysis(language)

    # ── Step 1: riconoscimento visivo con VISION_MODEL ─────────────────────────
    color_lang_hint = (
        "main color in English (e.g. 'white', 'black', 'navy blue')"
        if language == 'en' else
        "main color in Italian (e.g. 'bianco', 'nero', 'blu navy')"
    )
    vision_content = [
        {
            "type": "text",
            "text": f"""Look at these clothing item photos and extract the objective visual information.

Return ONLY a JSON object with these fields:
{{
  "name": "descriptive name (e.g. 'Nike Air Force 1 White Sneakers')",
  "category": "one of: cappello | maglietta | felpa | giacchetto | pantaloni | scarpe | occhiali | cintura | borsa | orologio | altro",
  "brand": "brand name or null if not visible",
  "color_primary": "{color_lang_hint}",
  "color_hex": "hex code of the primary color (e.g. '#FFFFFF')",
  "size": "size if visible. For shoes ALWAYS convert to EU size (e.g. US 10.5 → '44.5', UK 9 → '43'). For clothing use label value (e.g. 'M', 'L'). For belts use waist cm if visible. For watches/glasses/bags/altro put null.",
  "price": "price as number if visible (e.g. 89.99) or null",
  "material": "fabric if visible (e.g. '100% cotone') or null"
}}

Return ONLY the JSON, no markdown, no explanation."""
        }
    ]

    if photo_front and os.path.exists(photo_front):
        b64, mime = encode_image(photo_front, max_px=512)   # low detail → 512px basta, ~85 token
        vision_content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "low"}
        })
    if photo_back and os.path.exists(photo_back):
        b64, mime = encode_image(photo_back, max_px=512)
        vision_content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "low"}
        })
    if photo_label and os.path.exists(photo_label):
        b64, mime = encode_image(photo_label, max_px=1024)  # high detail → max 4 tile = ~765 token
        vision_content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "high"}
        })

    try:
        vision_resp = await client_vision.chat.completions.create(
            model=VISION_MODEL,
            messages=[{"role": "user", "content": vision_content}],
            max_tokens=400,
            temperature=0.1,
        )
        raw = vision_resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        base_data = json.loads(raw)
    except Exception as e:
        print(f"Vision analysis error: {e}")
        return _mock_analysis()

    # ── Step 2: arricchimento qualitativo con TEXT_MODEL ──────────────────────
    if language == 'en':
        enrich_prompt = f"""You are a fashion expert. Based on the following objective data about a clothing item,
generate the missing qualitative information.

Item data:
- Name: {base_data.get('name')}
- Category: {base_data.get('category')}
- Brand: {base_data.get('brand') or 'not detected'}
- Primary color: {base_data.get('color_primary')}
- Material: {base_data.get('material') or 'not detected'}

Return ONLY a JSON object with these fields:
{{
  "description": "2-3 sentences in English describing the style, fit and notable details of the item",
  "style_tags": ["array from: casual, formal, sportivo, elegante, streetwear, vintage, minimal, bohemian, rock, smart-casual"],
  "season_tags": ["array from: spring, summer, autumn, winter"],
  "occasion_tags": ["array from: everyday, work, evening, sport, ceremony, beach, outdoor"]
}}

Return ONLY the JSON, no markdown, no explanation."""
    else:
        enrich_prompt = f"""Sei un esperto di moda. Basandoti sui seguenti dati oggettivi di un capo d'abbigliamento,
genera le informazioni qualitative mancanti.

Dati del capo:
- Nome: {base_data.get('name')}
- Categoria: {base_data.get('category')}
- Brand: {base_data.get('brand') or 'non rilevato'}
- Colore principale: {base_data.get('color_primary')}
- Materiale: {base_data.get('material') or 'non rilevato'}

Return ONLY a JSON object with these fields:
{{
  "description": "2-3 frasi in italiano che descrivono stile, vestibilità e dettagli notevoli del capo",
  "style_tags": ["array da: casual, formal, sportivo, elegante, streetwear, vintage, minimal, bohemian, rock, smart-casual"],
  "season_tags": ["array da: primavera, estate, autunno, inverno"],
  "occasion_tags": ["array da: quotidiano, lavoro, serata, sport, cerimonia, spiaggia, outdoor"]
}}

Return ONLY the JSON, no markdown, no explanation."""

    try:
        enrich_resp = await client_vision.chat.completions.create(
            model=TEXT_MODEL,
            messages=[{"role": "user", "content": enrich_prompt}],
            max_tokens=400,
            temperature=0.4,
        )
        raw2 = enrich_resp.choices[0].message.content.strip()
        if raw2.startswith("```"):
            raw2 = raw2.split("```")[1]
            if raw2.startswith("json"):
                raw2 = raw2[4:]
        enriched = json.loads(raw2)
    except Exception as e:
        print(f"Enrichment error: {e}")
        # Fallback: campi qualitativi vuoti ma non blocchiamo l'upload
        enriched = {
            "description": "",
            "style_tags": [],
            "season_tags": [],
            "occasion_tags": [],
        }

    return {**base_data, **enriched}


async def reenrich_garment(garment_data: dict, language: str = 'it') -> dict:
    """
    Rigenera description, style_tags, season_tags e occasion_tags
    a partire dai dati già salvati, senza bisogno delle foto originali.
    """
    if not os.getenv("OPENAI_KEY_VISION"):
        return {}

    if language == 'en':
        prompt = f"""You are a fashion expert. Based on the following clothing item data,
generate qualitative information in English.

Item data:
- Name: {garment_data.get('name')}
- Category: {garment_data.get('category')}
- Brand: {garment_data.get('brand') or 'unknown'}
- Primary color: {garment_data.get('color_primary')}
- Material: {garment_data.get('material') or 'unknown'}

Return ONLY a JSON object with these fields:
{{
  "description": "2-3 sentences in English describing the style, fit and notable details of the item",
  "style_tags": ["array from: casual, formal, sporty, elegant, streetwear, vintage, minimal, bohemian, rock, smart-casual"],
  "season_tags": ["array from: spring, summer, autumn, winter"],
  "occasion_tags": ["array from: everyday, work, evening, sport, ceremony, beach, outdoor"]
}}

Return ONLY the JSON, no markdown, no explanation."""
    else:
        prompt = f"""Sei un esperto di moda. Basandoti sui seguenti dati di un capo d'abbigliamento,
genera le informazioni qualitative in italiano.

Dati del capo:
- Nome: {garment_data.get('name')}
- Categoria: {garment_data.get('category')}
- Brand: {garment_data.get('brand') or 'non rilevato'}
- Colore principale: {garment_data.get('color_primary')}
- Materiale: {garment_data.get('material') or 'non rilevato'}

Return ONLY a JSON object with these fields:
{{
  "description": "2-3 frasi in italiano che descrivono stile, vestibilità e dettagli notevoli del capo",
  "style_tags": ["array da: casual, formal, sportivo, elegante, streetwear, vintage, minimal, bohemian, rock, smart-casual"],
  "season_tags": ["array da: primavera, estate, autunno, inverno"],
  "occasion_tags": ["array da: quotidiano, lavoro, serata, sport, cerimonia, spiaggia, outdoor"]
}}

Return ONLY the JSON, no markdown, no explanation."""

    try:
        resp = await client_vision.chat.completions.create(
            model=TEXT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=400,
            temperature=0.4,
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception as e:
        print(f"Re-enrich error: {e}")
        return {}


async def generate_outfit_recommendations(
    garments: list[dict],
    user_profile: dict | None,
    request: str = "",
    n: int = 3,
) -> list[dict]:
    """
    Generate outfit recommendations using GPT-4.
    Returns a list of outfit dicts: { name, garment_ids, occasion, season, notes }
    """
    if not os.getenv("OPENAI_KEY_STYLIST"):
        return _mock_outfits(garments, n)

    # Prepare garment summary for the prompt
    garment_summary = []
    for g in garments:
        garment_summary.append({
            "id": g["id"],
            "name": g["name"],
            "category": g["category"],
            "color": g["color_primary"],
            "brand": g.get("brand"),
            "style_tags": g.get("style_tags", []),
            "season_tags": g.get("season_tags", []),
            "occasion_tags": g.get("occasion_tags", []),
        })

    profile_text = ""
    if user_profile:
        profile_text = f"""
User style profile:
- Style preferences: {user_profile.get('style_preferences', [])}
- Favorite colors: {user_profile.get('favorite_colors', [])}
- Typical occasions: {user_profile.get('occasions', [])}
"""

    user_request = f"Specific request: {request}" if request else ""

    prompt = f"""You are a professional fashion stylist. Create {n} complete outfits from these wardrobe items.
{profile_text}
{user_request}

Available garments:
{json.dumps(garment_summary, indent=2, ensure_ascii=False)}

Rules:
- Each outfit should include at most one item per category
- Outfits must make sense stylistically (colors, style, occasion match)
- Prefer cohesive, wearable combinations
- Explain WHY this combination works

Return a JSON array with exactly {n} outfits:
[
  {{
    "name": "outfit name in Italian (e.g. 'Look Casual Weekend')",
    "garment_ids": [array of garment IDs to include],
    "occasion": "primary occasion",
    "season": "primary season",
    "notes": "2-3 sentences in Italian explaining the look and styling tips"
  }}
]

Return ONLY the JSON array."""

    try:
        response = await client.chat.completions.create(
            model=TEXT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1500,
            temperature=0.7,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception as e:
        print(f"Outfit generation error: {e}")
        return _mock_outfits(garments, n)


async def complete_outfit(
    selected_garments: list[dict],
    all_garments: list[dict],
    user_profile: dict | None = None,
) -> dict:
    """
    Given already-selected garments, suggest complementary items from the wardrobe
    to complete the outfit. Returns { additional_ids, notes }.
    """
    if not os.getenv("OPENAI_KEY_STYLIST"):
        # Mock: just pick one garment not already selected
        selected_ids = {g["id"] for g in selected_garments}
        remaining = [g for g in all_garments if g["id"] not in selected_ids]
        return {
            "additional_ids": [remaining[0]["id"]] if remaining else [],
            "notes": "Configura la tua OpenAI API key per completare outfit con l'AI.",
        }

    selected_ids = {g["id"] for g in selected_garments}
    covered_categories = {g["category"] for g in selected_garments}
    remaining = [g for g in all_garments if g["id"] not in selected_ids]

    def summarize(g):
        return {
            "id": g["id"],
            "name": g["name"],
            "category": g["category"],
            "color": g.get("color_primary"),
            "brand": g.get("brand"),
            "style_tags": g.get("style_tags", []),
            "season_tags": g.get("season_tags", []),
            "occasion_tags": g.get("occasion_tags", []),
        }

    selected_summary = [summarize(g) for g in selected_garments]
    remaining_summary = [summarize(g) for g in remaining]

    profile_text = ""
    if user_profile:
        profile_text = f"User style: {user_profile.get('style_preferences', [])}. Favorite colors: {user_profile.get('favorite_colors', [])}.\n"

    covered_text = ", ".join(covered_categories) if covered_categories else "none"

    prompt = f"""You are a professional fashion stylist. The user has already selected these garments:

{json.dumps(selected_summary, indent=2, ensure_ascii=False)}

Already covered categories: {covered_text}
{profile_text}
From the remaining wardrobe below, choose the BEST items to COMPLETE this outfit.
- Only suggest items from UNCOVERED categories (do not suggest more tops if there is already a top, etc.)
- Choose items that match in style, color harmony, and occasion
- Suggest at most one item per missing category
- Only suggest items that genuinely improve the outfit

Available remaining wardrobe:
{json.dumps(remaining_summary, indent=2, ensure_ascii=False)}

Return ONLY a JSON object:
{{
  "additional_ids": [list of garment IDs to add, max one per category],
  "notes": "2-3 sentences in Italian explaining why these items complete the outfit perfectly"
}}"""

    try:
        response = await client.chat.completions.create(
            model=TEXT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=600,
            temperature=0.6,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception as e:
        print(f"Complete outfit error: {e}")
        return {"additional_ids": [], "notes": "Errore nel completamento outfit."}


def _build_stylist_system_prompt(
    garments: list[dict],
    user_profile: dict | None,
    language: str,
    brand_products: list[dict] | None = None,
    dislike_notes: list[str] | None = None,
    weather: str | None = None,
    occasion: str | None = None,
    usual_outfits: list[dict] | None = None,
    wear_history: list[dict] | None = None,
) -> str:
    """Costruisce il system prompt per lo stylist chat.
    Passa i capi con ID, contesto completo dell'utente e prodotti brand partner.
    """
    # ── Armadio con ID e metadati completi (max 50 capi) ─────────────────────
    garment_lines = "\n".join(
        f"  id={g['id']} | {g['name']} | {g['category']} | {g.get('color_primary', '?')}"
        + (f" | brand: {g['brand']}" if g.get('brand') else "")
        + (f" | taglia: {g['size']}" if g.get('size') else "")
        + (f" | stile: {', '.join(g.get('style_tags', []))}" if g.get('style_tags') else "")
        + (f" | stagione: {', '.join(g.get('season_tags', []))}" if g.get('season_tags') else "")
        + (f" | occasione: {', '.join(g.get('occasion_tags', []))}" if g.get('occasion_tags') else "")
        for g in garments[:50]
    )

    # ── Analisi statistica dell'armadio ────────────────────────────────────────
    wardrobe_stats = ""
    if garments:
        from collections import Counter
        all_styles = [t for g in garments for t in (g.get('style_tags') or [])]
        all_colors = [g.get('color_primary') for g in garments if g.get('color_primary')]
        all_cats   = [g.get('category') for g in garments if g.get('category')]
        all_seasons = [t for g in garments for t in (g.get('season_tags') or [])]
        top_styles  = Counter(all_styles).most_common(4)
        top_colors  = Counter(all_colors).most_common(4)
        cat_dist    = Counter(all_cats)
        top_seasons = Counter(all_seasons).most_common(2)
        wardrobe_stats = (
            f"\nAnalisi armadio: {len(garments)} capi totali. "
            + (f"Stili dominanti: {', '.join(f'{s}({n})' for s,n in top_styles)}. " if top_styles else "")
            + (f"Colori più frequenti: {', '.join(f'{c}({n})' for c,n in top_colors)}. " if top_colors else "")
            + (f"Stagioni: {', '.join(f'{s}({n})' for s,n in top_seasons)}. " if top_seasons else "")
            + (f"Categorie: {', '.join(f'{k}:{v}' for k,v in cat_dist.most_common())}." if cat_dist else "")
        )

    # ── Profilo utente ─────────────────────────────────────────────────────────
    profile_ctx = ""
    if user_profile:
        prefs    = user_profile.get('style_preferences') or []
        occasions = user_profile.get('occasions') or []
        fav_colors = user_profile.get('favorite_colors') or []
        disliked_colors = user_profile.get('disliked_colors') or []
        body_type = user_profile.get('body_type')
        gender    = user_profile.get('gender')
        height_cm = user_profile.get('height_cm')
        armocromia = user_profile.get('armocromia_season')
        if gender:          profile_ctx += f"Genere: {gender}. "
        if body_type:       profile_ctx += f"Tipo fisico: {body_type}. "
        if height_cm:       profile_ctx += f"Altezza: {height_cm}cm. "
        if prefs:           profile_ctx += f"Stile preferito: {', '.join(prefs)}. "
        if occasions:       profile_ctx += f"Occasioni principali: {', '.join(occasions)}. "
        if fav_colors:      profile_ctx += f"Colori preferiti: {', '.join(fav_colors)}. "
        if disliked_colors: profile_ctx += f"Colori da evitare: {', '.join(disliked_colors)}. "
        if armocromia:      profile_ctx += f"Stagione cromatica (analisi AI certificata): {armocromia}. "

    # Prodotti brand partner (max 25)
    brand_lines = ""
    if brand_products:
        brand_lines = "\n".join(
            f"  id={p['id']} | {p['name']} | {p['category']}"
            + (f" | €{p['price']}" if p.get('price') else "")
            + (f" | {p['brand_name']}" if p.get('brand_name') else "")
            + (f" | stile: {', '.join(p.get('style_tags', []))}" if p.get('style_tags') else "")
            for p in brand_products[:25]
        )

    # ── Sezioni contesto aggiuntive ────────────────────────────────────────────
    usual_section_en = ""
    if usual_outfits:
        lines = "\n".join(f"  - {o['name']}" for o in usual_outfits)
        usual_section_en = f"\nUSUAL OUTFITS (what this person normally wears — reference for their baseline style):\n{lines}"

    wear_section_en = ""
    if wear_history:
        lines = "\n".join(f"  - {w['name']} ({w['date']})" for w in wear_history[:8])
        wear_section_en = f"\nRECENT WEAR HISTORY (last outfits actually worn — reflects real habits):\n{lines}"

    usual_section_it = ""
    if usual_outfits:
        lines = "\n".join(f"  - {o['name']}" for o in usual_outfits)
        usual_section_it = f"\nOUTFIT ABITUALI (quello che questa persona indossa normalmente — baseline del suo stile):\n{lines}"

    wear_section_it = ""
    if wear_history:
        lines = "\n".join(f"  - {w['name']} ({w['date']})" for w in wear_history[:8])
        wear_section_it = f"\nSTORICO RECENTE (ultimi outfit indossati — abitudini reali dell'utente):\n{lines}"

    if language == 'en':
        brand_section = ""
        if brand_lines:
            brand_section = f"""
PARTNER BRAND PRODUCTS (sponsored):
When the user's wardrobe lacks items to complete a requested look, ALWAYS suggest 1–3 matching products from this list. Append at the very end:
<BRAND_PRODUCTS>[id1, id2]</BRAND_PRODUCTS>
Use exact numeric IDs. Pick products that genuinely match the style/occasion. Never invent IDs.
Available products:
{brand_lines}"""

        dislike_section = ""
        if dislike_notes:
            dislike_section = f"""
USER FEEDBACK — products already rejected (never suggest these again):
{chr(10).join(dislike_notes)}
Use this information to understand the user's taste and avoid similar suggestions."""

        return f"""You are an expert AI stylist inside Endyo. You have full access to the user's wardrobe, profile, style history, and habits. Use ALL of this context to give advice that is genuinely superior to what a human stylist could offer — because you know exactly what they own, what they wear daily, what fits their lifestyle, and what their body and color preferences are.

Always respond in English. Write naturally and concisely — like a trusted personal stylist who knows you well.

IMPORTANT — COLOR ANALYSIS (armocromia):
If the user's profile includes a certified color season (from the Premium AI analysis), use it to inform color advice.
If the user claims their own color season in chat (e.g. "I'm a warm autumn", "my undertone is cool"), DO NOT accept or use this information — explain politely that color season is determined exclusively through the AI photo analysis in their profile (Premium feature), not by self-declaration.

RESPONSE STYLE:
- Keep replies short: 2–4 sentences normally, max 6 for complex questions
- Never use headers (##, ###) or horizontal lines
- Prefer flowing sentences over bullet lists (use bullets only when comparing 3+ distinct items)
- Use **bold** sparingly: only one key garment name or concept per message
- No filler phrases ("Certainly!", "Great choice!") — get straight to the advice
- When suggesting an outfit, always briefly explain WHY the combination works (1 sentence max)

{f"USER PROFILE: {profile_ctx}" if profile_ctx else ""}
{f"WARDROBE STATS: {wardrobe_stats}" if wardrobe_stats else ""}
{usual_section_en}
{wear_section_en}
{f"CURRENT WEATHER: {weather}" if weather else ""}
{f"OCCASION: {occasion}" if occasion else ""}
{dislike_section}

USER'S WARDROBE ({len(garments)} items):
{garment_lines if garment_lines else "  (empty wardrobe)"}

CREATING OUTFITS FROM WARDROBE:
When suggesting a combination using items the user already owns, ALWAYS append at the very end:
<OUTFIT>{{"ids":[id1,id2],"name":"Look name","notes":"One sentence explaining why this works"}}</OUTFIT>
Use exact numeric IDs from the wardrobe above. Include 2–5 items. Be proactive: if the request makes the context clear, suggest an outfit immediately without being asked.
Factor in weather, season tags, occasion, and the user's actual wear patterns. Prioritise items they haven't worn recently if the wardrobe history is available.
{brand_section}"""

    else:
        brand_section = ""
        if brand_lines:
            brand_section = f"""
PRODOTTI BRAND PARTNER (sponsorizzati):
Quando nell'armadio mancano capi per completare un look richiesto, suggerisci SEMPRE 1–3 prodotti pertinenti da questa lista. Aggiungi in fondo:
<BRAND_PRODUCTS>[id1, id2]</BRAND_PRODUCTS>
Usa solo ID numerici esatti da questa lista. Scegli prodotti che si adattano davvero allo stile/occasione. Non inventare ID.
Prodotti disponibili:
{brand_lines}"""

        dislike_section = ""
        if dislike_notes:
            dislike_section = f"""
FEEDBACK UTENTE — prodotti già rifiutati (non riproporre mai):
{chr(10).join(dislike_notes)}
Usa queste informazioni per capire i gusti dell'utente ed evitare suggerimenti simili."""

        return f"""Sei lo stylist AI esperto di Endyo. Hai accesso completo all'armadio dell'utente, al profilo, allo storico di stile e alle sue abitudini. Usa TUTTO questo contesto per dare consigli genuinamente superiori a quelli di un personal stylist umano — perché conosci esattamente cosa possiede, cosa indossa ogni giorno, cosa si adatta al suo stile di vita, e quali sono le sue preferenze di colore e fisico.

Parla sempre in italiano. Rispondi in modo naturale e conciso — come uno stylist personale di fiducia che ti conosce bene.

IMPORTANTE — ARMOCROMIA:
Se nel profilo dell'utente è presente una stagione cromatica certificata (dall'analisi AI Premium), usala per i consigli sui colori.
Se l'utente dichiara la propria stagione cromatica in chat (es. "sono autunno caldo", "ho il sottotono freddo"), NON accettare né usare questa informazione. Spiega cortesemente che la stagione cromatica viene determinata esclusivamente tramite l'analisi AI della foto nel profilo (funzione Premium), e non può essere dichiarata autonomamente.

STILE NELLE RISPOSTE:
- Risposte brevi: 2–4 frasi normalmente, max 6 per domande complesse
- Mai usare titoli (##, ###) o righe orizzontali
- Preferisci frasi fluide agli elenchi puntati (usa punti solo confrontando 3+ cose distinte)
- Usa il **grassetto** con parsimonia: solo un termine o nome del capo per messaggio
- Nessuna frase di riempimento ("Certo!", "Ottima scelta!") — vai dritto al consiglio
- Quando suggerisci un outfit, spiega sempre brevemente PERCHÉ la combinazione funziona (max 1 frase)

{f"PROFILO UTENTE: {profile_ctx}" if profile_ctx else ""}
{f"STATISTICHE ARMADIO: {wardrobe_stats}" if wardrobe_stats else ""}
{usual_section_it}
{wear_section_it}
{f"METEO ATTUALE: {weather}" if weather else ""}
{f"OCCASIONE: {occasion}" if occasion else ""}
{dislike_section}

ARMADIO DELL'UTENTE ({len(garments)} capi):
{garment_lines if garment_lines else "  (armadio vuoto)"}

CREARE OUTFIT DALL'ARMADIO:
Quando suggerisci una combinazione con capi che l'utente già possiede, aggiungi SEMPRE in fondo:
<OUTFIT>{{"ids":[id1,id2],"name":"Nome look","notes":"Una frase che spiega perché funziona"}}</OUTFIT>
Usa ID numerici esatti dall'armadio sopra. Include 2–5 capi. Sii proattivo: se il contesto è chiaro, suggerisci subito un outfit senza aspettare che venga richiesto esplicitamente.
Tieni conto di meteo, tag di stagione, occasione e le abitudini reali dell'utente. Se c'è uno storico, privilegia capi non indossati di recente per variare.
{brand_section}"""


async def chat_with_stylist(
    message: str,
    garments: list[dict],
    conversation_history: list[dict],
    user_profile: dict | None = None,
    language: str = 'it',
    brand_products: list[dict] | None = None,
) -> str:
    """Stylist chat — risposta singola (non streaming). Usato come fallback."""
    if not os.getenv("OPENAI_KEY_STYLIST"):
        if language == 'en':
            return "⚠️ Configure your OpenAI API key in the `.env` file to activate the AI assistant."
        return "⚠️ Configura la tua OpenAI API key nel file `.env` per attivare l'assistente AI."

    system_prompt = _build_stylist_system_prompt(garments, user_profile, language, brand_products)
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation_history[-12:])
    messages.append({"role": "user", "content": message})

    try:
        response = await client.chat.completions.create(
            model=TEXT_MODEL,
            messages=messages,
            max_tokens=500,
            temperature=0.75,
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Errore: {str(e)}"


async def stream_chat_with_stylist(
    message: str,
    garments: list[dict],
    conversation_history: list[dict],
    user_profile: dict | None = None,
    language: str = 'it',
    brand_products: list[dict] | None = None,
    dislike_notes: list[str] | None = None,
    weather: str | None = None,
    occasion: str | None = None,
    usual_outfits: list[dict] | None = None,
    wear_history: list[dict] | None = None,
):
    """Generatore asincrono che restituisce token SSE dalla chat dello stylist.
    Yields: stringhe di testo (token) man mano che arrivano da OpenAI.
    """
    if not os.getenv("OPENAI_KEY_STYLIST"):
        msg = ("⚠️ Configure your OpenAI API key in the `.env` file."
               if language == 'en' else
               "⚠️ Configura la tua OpenAI API key nel file `.env`.")
        yield msg
        return

    system_prompt = _build_stylist_system_prompt(
        garments, user_profile, language, brand_products, dislike_notes,
        weather, occasion, usual_outfits, wear_history
    )
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation_history[-12:])
    messages.append({"role": "user", "content": message})

    try:
        stream = await client.chat.completions.create(
            model=TEXT_MODEL,
            messages=messages,
            max_tokens=600,
            temperature=0.75,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
    except Exception as e:
        yield f"\n\n⚠️ Errore: {str(e)}"


def _mock_analysis(language: str = 'it') -> dict:
    if language == 'en':
        return {
            "name": "Item not analysed (configure API key)",
            "category": "maglietta",
            "brand": None,
            "color_primary": "white",
            "color_hex": "#FFFFFF",
            "size": "M",
            "price": None,
            "material": None,
            "description": "Configure your OpenAI API key for automatic item analysis.",
            "style_tags": ["casual"],
            "season_tags": ["spring", "summer"],
            "occasion_tags": ["everyday"],
        }
    return {
        "name": "Capo non analizzato (configura API key)",
        "category": "maglietta",
        "brand": None,
        "color_primary": "bianco",
        "color_hex": "#FFFFFF",
        "size": "M",
        "price": None,
        "material": None,
        "description": "Configura la tua OpenAI API key per l'analisi automatica dei capi.",
        "style_tags": ["casual"],
        "season_tags": ["primavera", "estate"],
        "occasion_tags": ["quotidiano"],
    }


def _mock_outfits(garments: list, n: int) -> list:
    if len(garments) < 2:
        return []
    result = []
    for i in range(min(n, 2)):
        ids = [g["id"] for g in garments[:3]]
        result.append({
            "name": f"Look #{i+1}",
            "garment_ids": ids,
            "occasion": "quotidiano",
            "season": "primavera",
            "notes": "Configura la tua OpenAI API key per outfit personalizzati.",
        })
    return result
