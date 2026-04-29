/**
 * WardrobeAnalysis — analisi visiva dell'armadio
 * Grafici CSS puri, nessuna dipendenza esterna.
 */

import { useMemo, useState, useCallback } from 'react'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import { imgUrl } from '../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────
function count(arr, key) {
  return arr.reduce((acc, item) => {
    const val = item[key] || 'N/D'
    acc[val] = (acc[val] || 0) + 1
    return acc
  }, {})
}

function countTags(arr, key) {
  return arr.reduce((acc, item) => {
    const tags = Array.isArray(item[key]) ? item[key] : []
    tags.forEach(tag => { acc[tag] = (acc[tag] || 0) + 1 })
    return acc
  }, {})
}

function sortedEntries(obj) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1])
}

const CAT_LABELS = {
  it: {
    cappello:   'Cappello',
    maglietta:  'Maglietta / Camicia',
    top:        'Top / Canotta',
    felpa:      'Felpa / Maglione',
    giacchetto: 'Giacca / Capospalla',
    pantaloni:  'Pantaloni',
    gonna:      'Gonna',
    vestito:    'Vestito / Abito',
    scarpe:     'Scarpe',
    occhiali:   'Occhiali',
    cintura:    'Cintura',
    borsa:      'Borsa',
    orologio:   'Orologio',
    altro:      'Altro',
  },
  en: {
    cappello:   'Hat',
    maglietta:  'T-shirt / Shirt',
    top:        'Top / Tank top',
    felpa:      'Sweatshirt / Jumper',
    giacchetto: 'Jacket / Outerwear',
    pantaloni:  'Trousers',
    gonna:      'Skirt',
    vestito:    'Dress',
    scarpe:     'Shoes',
    occhiali:   'Glasses',
    cintura:    'Belt',
    borsa:      'Bag',
    orologio:   'Watch',
    altro:      'Other',
  },
}

function catLabel(cat, lang) {
  return (CAT_LABELS[lang] || CAT_LABELS.it)[cat] || cat
}

// Percentuali "ideali" di un armadio equilibrato (maschio)
const IDEAL_PCT_MALE = {
  maglietta:  30,
  pantaloni:  24,
  giacchetto: 16,
  felpa:      14,
  scarpe:     12,
  cappello:    4,
}

// Percentuali "ideali" per armadio femminile
const IDEAL_PCT_FEMALE = {
  maglietta:  16,
  top:        10,
  felpa:       8,
  giacchetto: 12,
  pantaloni:  12,
  gonna:      10,
  vestito:    12,
  scarpe:     12,
  borsa:       8,
}

// Seleziona IDEAL_PCT in base al genere del profilo
function getIdealPct(gender) {
  return gender === 'femmina' ? IDEAL_PCT_FEMALE : IDEAL_PCT_MALE
}

// Tenuto per retro-compatibilità (usa default maschio)
const IDEAL_PCT = IDEAL_PCT_MALE

// ── Grafico barre orizzontali ──────────────────────────────────────────────────
function HBar({ label, value, max, color = 'var(--primary)', sublabel }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{value}{sublabel ? ` ${sublabel}` : ''}</span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99,
          background: color,
          width: `${pct}%`,
          transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
        }} />
      </div>
    </div>
  )
}

// ── Donut chart SVG ───────────────────────────────────────────────────────────
function DonutChart({ segments, size = 140, lang = 'it' }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return null

  const r = 50, cx = 60, cy = 60
  const circum = 2 * Math.PI * r
  let offset = 0

  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={18} />
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circum
        const gap  = circum - dash
        const el = (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={18}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px' }}
          />
        )
        offset += dash
        return el
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--text)">{total}</text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize="9" fill="var(--text-dim)">{lang === 'en' ? 'items' : 'capi'}</text>
    </svg>
  )
}

// ── Gap analysis ──────────────────────────────────────────────────────────────
function GapAnalysis({ garments, lang = 'it', gender = 'altro' }) {
  const total = garments.length
  const IDEAL_PCT = getIdealPct(gender)

  const G = lang === 'en' ? {
    minItems:   'Add at least 3 items to see the gap analysis.',
    underTitle: 'Under-represented categories',
    overTitle:  'Over-represented categories',
    detail:     (n, pct, ideal) => `${n} item${n !== 1 ? 's' : ''} (${pct}%) · ideal ≥ ${ideal}%`,
    detailOver: (n, pct, ideal) => `${n} item${n !== 1 ? 's' : ''} (${pct}%) · ideal ≤ ${ideal}%`,
    missing:    (n) => `+${n} missing`,
    wellStocked:'well stocked',
    balanced:   '✓ Your wardrobe is well balanced across the main categories!',
  } : {
    minItems:   'Aggiungi almeno 3 capi per vedere l\'analisi dei gap.',
    underTitle: 'Categorie sotto-rappresentate',
    overTitle:  'Categorie sovra-rappresentate',
    detail:     (n, pct, ideal) => `${n} cap${n !== 1 ? 'i' : 'o'} (${pct}%) · ideale ≥ ${ideal}%`,
    detailOver: (n, pct, ideal) => `${n} cap${n !== 1 ? 'i' : 'o'} (${pct}%) · ideale ≤ ${ideal}%`,
    missing:    (n) => `+${n} manc${n !== 1 ? 'anti' : 'ante'}`,
    wellStocked:'ben fornito',
    balanced:   '✓ Il tuo armadio è ben bilanciato tra le categorie principali!',
  }

  if (total < 3) return (
    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{G.minItems}</p>
  )

  const byCat = count(garments, 'category')
  const gaps = Object.entries(IDEAL_PCT).map(([cat, idealPct]) => {
    const actual = byCat[cat] || 0
    const actualPct = Math.round((actual / total) * 100)
    const diff = actualPct - idealPct
    return { cat, label: catLabel(cat, lang), actual, actualPct, idealPct, diff }
  }).sort((a, b) => a.diff - b.diff)

  const missing = gaps.filter(g => g.diff < -5)
  const excess  = gaps.filter(g => g.diff > 8)

  return (
    <div>
      {missing.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f87171', marginBottom: 8 }}>
            {G.underTitle}
          </div>
          {missing.map(g => (
            <div key={g.cat} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', marginBottom: 6, borderRadius: 10,
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{g.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {G.detail(g.actual, g.actualPct, g.idealPct)}
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f87171' }}>
                {G.missing(Math.ceil((g.idealPct - g.actualPct) / 100 * total))}
              </div>
            </div>
          ))}
        </div>
      )}

      {excess.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#facc15', marginBottom: 8 }}>
            {G.overTitle}
          </div>
          {excess.map(g => (
            <div key={g.cat} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', marginBottom: 6, borderRadius: 10,
              background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.2)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{g.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {G.detailOver(g.actual, g.actualPct, g.idealPct)}
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#facc15' }}>
                {G.wellStocked}
              </div>
            </div>
          ))}
        </div>
      )}

      {missing.length === 0 && excess.length === 0 && (
        <div style={{
          padding: '14px 16px', borderRadius: 12,
          background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
          fontSize: 13, color: 'var(--text-muted)',
        }}>
          {G.balanced}
        </div>
      )}
    </div>
  )
}

// ── Tooltip anteprima capo ────────────────────────────────────────────────────
function GarmentTooltip({ garment, pos, lang = 'it' }) {
  const photo = garment.photo_front ? imgUrl(garment.photo_front) : null
  const label = garment.name || catLabel(garment.category, lang)
  // Offset per non uscire dal viewport
  const left = Math.min(pos.x + 14, window.innerWidth - 180)
  const top  = Math.min(pos.y - 10, window.innerHeight - 230)

  return (
    <div style={{
      position: 'fixed',
      left, top,
      zIndex: 9999,
      width: 160,
      background: 'var(--card)',
      border: '1px solid var(--primary)',
      borderRadius: 14,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 3px var(--primary-dim)',
      overflow: 'hidden',
      pointerEvents: 'none',
      animation: 'fadeIn 0.15s ease',
    }}>
      {photo ? (
        <img
          src={photo}
          alt={label}
          style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{ width: '100%', height: 140, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 36, opacity: 0.25 }}>👗</span>
        </div>
      )}
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{label}</div>
        {garment.color_primary && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{garment.color_primary}</div>
        )}
        {garment.brand && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{garment.brand}</div>
        )}
      </div>
    </div>
  )
}

// ── Analisi utilizzo capi ─────────────────────────────────────────────────────
function WearAnalysis({ garments, outfits, lang }) {
  const [tooltip, setTooltip] = useState(null) // { garment, pos: {x,y} }

  const total = garments.length
  if (total === 0) return null

  // Quante volte ogni capo appare in un outfit
  const garmentOutfitCount = {}
  outfits.forEach(o => {
    ;(o.garment_ids || []).forEach(gid => {
      garmentOutfitCount[gid] = (garmentOutfitCount[gid] || 0) + 1
    })
  })

  const usedIds   = new Set(Object.keys(garmentOutfitCount).map(Number))
  const neverUsed = garments.filter(g => !usedIds.has(g.id))
  const mostUsed  = [...garments]
    .filter(g => usedIds.has(g.id))
    .sort((a, b) => (garmentOutfitCount[b.id] || 0) - (garmentOutfitCount[a.id] || 0))
    .slice(0, 5)

  const usedPct = Math.round((usedIds.size / total) * 100)

  const L = {
    it: {
      usedPct: (p, n, t) => `${p}% dei capi usati in almeno un outfit (${n} su ${t})`,
      neverTitle: 'Mai abbinati in un outfit',
      neverEmpty: 'Tutti i capi sono stati usati in almeno un outfit.',
      topTitle: 'Capi più abbinati',
      times: (n) => `${n} outfit`,
    },
    en: {
      usedPct: (p, n, t) => `${p}% of items used in at least one outfit (${n} of ${t})`,
      neverTitle: 'Never styled in an outfit',
      neverEmpty: 'All items have been used in at least one outfit.',
      topTitle: 'Most styled items',
      times: (n) => `${n} outfit${n !== 1 ? 's' : ''}`,
    },
  }[lang] || {}

  const barColor = usedPct >= 70 ? '#10b981' : usedPct >= 40 ? '#f59e0b' : '#ef4444'

  return (
    <div>
      {/* Tooltip anteprima */}
      {tooltip && <GarmentTooltip garment={tooltip.garment} pos={tooltip.pos} lang={lang} />}

      {/* Barra sommario */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{L.usedPct(usedPct, usedIds.size, total)}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>{usedPct}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 99, background: barColor, width: `${usedPct}%`, transition: 'width 0.6s cubic-bezier(.4,0,.2,1)' }} />
        </div>
      </div>

      {/* Capi mai usati */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          {L.neverTitle}
        </div>
        {neverUsed.length === 0 ? (
          <div style={{ fontSize: 13, color: '#10b981', padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)' }}>
            ✓ {L.neverEmpty}
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {neverUsed.slice(0, 12).map(g => (
              <div
                key={g.id}
                onMouseEnter={e => setTooltip({ garment: g, pos: { x: e.clientX, y: e.clientY } })}
                onMouseMove={e => setTooltip(t => t ? { ...t, pos: { x: e.clientX, y: e.clientY } } : t)}
                onMouseLeave={() => setTooltip(null)}
                style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 20, cursor: 'default',
                  background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
                  color: 'var(--text-muted)', transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)'; e.currentTarget.style.background = 'rgba(239,68,68,0.13)' }}
                onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'; e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; setTooltip(null) }}
              >
                {g.name || catLabel(g.category, lang)}
              </div>
            ))}
            {neverUsed.length > 12 && (
              <div style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, color: 'var(--text-dim)' }}>
                +{neverUsed.length - 12}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Top 5 più usati */}
      {mostUsed.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            {L.topTitle}
          </div>
          {mostUsed.map((g, i) => {
            const n = garmentOutfitCount[g.id] || 0
            const maxN = garmentOutfitCount[mostUsed[0].id] || 1
            return (
              <div
                key={g.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'default' }}
                onMouseEnter={e => setTooltip({ garment: g, pos: { x: e.clientX, y: e.clientY } })}
                onMouseMove={e => setTooltip(t => t ? { ...t, pos: { x: e.clientX, y: e.clientY } } : t)}
                onMouseLeave={() => setTooltip(null)}
              >
                <span style={{ fontSize: 11, color: 'var(--text-dim)', width: 14, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{g.name || catLabel(g.category, lang)}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{L.times(n)}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 99, background: 'var(--primary)', width: `${Math.round((n / maxN) * 100)}%`, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Suggerimenti acquisto ─────────────────────────────────────────────────────
function ShoppingSuggestions({ garments, outfits, lang }) {
  const byCat   = count(garments, 'category')
  const byColor = count(garments, 'color_primary')
  const total   = garments.length
  if (total < 3) return null

  // Colori presenti normalizzati
  const ownedColors = Object.keys(byColor).map(c => c.toLowerCase())
  const hasColor = (candidates) => candidates.some(c => ownedColors.some(oc => oc.includes(c)))

  const suggestions = []

  const L = lang === 'en' ? {
    catMissing: (label, n) => `Add more ${label} — you only have ${n}`,
    missingNeutral: (colors) => `Missing neutral tones (${colors.join(', ')}) — key for versatile outfits`,
    addLight: (cat) => `A light-toned ${cat} (white or beige) would pair well with your dark palette`,
    addDark: (cat) => `A dark-toned ${cat} (black or navy) would complete your light palette`,
    addAccent: (cat) => `An accent-coloured ${cat} (red, green or mustard) would brighten your outfits`,
    noWinterBase: 'Consider a dark heavy outerwear piece for autumn/winter layering',
    noSummerBase: 'A light linen or cotton top would improve your warm-weather options',
    lowSeasonal: 'Several items have no season tag — check their cataloguing',
    balanced: 'Well-rounded wardrobe! Keep the balance between categories and colours.',
    unusedMany: (n) => `${n} items have never been styled in an outfit — try pairing them`,
    allGood: 'All your items have been used in at least one outfit.',
  } : {
    catMissing: (label, n) => `Aggiungi più ${label} — ne hai solo ${n}`,
    missingNeutral: (colors) => `Mancano toni neutri (${colors.join(', ')}) — fondamentali per creare outfit versatili`,
    addLight: (cat) => `Un ${cat} in tonalità chiara (bianco o beige) si abbinerebbe bene alla tua palette scura`,
    addDark: (cat) => `Un ${cat} scuro (nero o blu navy) completarebbe la tua palette chiara`,
    addAccent: (cat) => `Un ${cat} con un colore accent (rosso, verde o senape) vivacizzerebbe i tuoi outfit`,
    noWinterBase: 'Valuta un capospalla pesante in tono scuro per i layer autunno/inverno',
    noSummerBase: 'Un top in lino o cotone leggero migliorerebbe le opzioni per la stagione calda',
    lowSeasonal: 'Molti capi non hanno stagione assegnata — verifica la catalogazione',
    balanced: 'Armadio ben bilanciato! Mantieni l\'equilibrio tra categorie e colori.',
    unusedMany: (n) => `${n} capi non sono mai stati abbinati in un outfit — prova a usarli`,
    allGood: 'Tutti i capi sono stati usati in almeno un outfit.',
  }

  // 1. Gap categorie con suggerimento colore specifico
  Object.entries(IDEAL_PCT).forEach(([cat, idealPct]) => {
    const actual = byCat[cat] || 0
    const actualPct = (actual / total) * 100
    if (actualPct < idealPct - 5) {
      const label = catLabel(cat, lang)
      suggestions.push({ text: L.catMissing(label, actual), priority: 'high' })
    }
  })

  // 2. Analisi palette colori — neutrali mancanti
  const missingNeutrals = []
  if (!hasColor(['bianco', 'white', 'crema', 'cream'])) missingNeutrals.push(lang === 'en' ? 'white' : 'bianco')
  if (!hasColor(['nero', 'black'])) missingNeutrals.push(lang === 'en' ? 'black' : 'nero')
  if (!hasColor(['grigio', 'grey', 'gray'])) missingNeutrals.push(lang === 'en' ? 'grey' : 'grigio')
  if (missingNeutrals.length >= 2 && total >= 5) {
    suggestions.push({ text: L.missingNeutral(missingNeutrals), priority: 'medium' })
  }

  // 3. Suggerimento contrasto palette
  if (total >= 6) {
    const darkColors  = ['nero', 'black', 'navy', 'blu', 'bordeaux', 'marrone', 'brown']
    const lightColors = ['bianco', 'white', 'beige', 'crema', 'cream', 'grigio chiaro', 'light grey']
    const darkCount  = ownedColors.filter(c => darkColors.some(d => c.includes(d))).length
    const lightCount = ownedColors.filter(c => lightColors.some(l => c.includes(l))).length
    const mainCat    = lang === 'en' ? 'top' : 'top'

    if (darkCount > lightCount + 3) {
      suggestions.push({ text: L.addLight(lang === 'en' ? 'top or bottom' : 'top o pantalone'), priority: 'medium' })
    } else if (lightCount > darkCount + 3) {
      suggestions.push({ text: L.addDark(lang === 'en' ? 'bottom or outerwear' : 'pantalone o capospalla'), priority: 'medium' })
    }

    // Colori accent assenti
    const accentColors = ['rosso', 'red', 'verde', 'green', 'senape', 'mustard', 'arancione', 'orange', 'terracotta']
    if (!hasColor(accentColors)) {
      suggestions.push({ text: L.addAccent(lang === 'en' ? 'top or accessory' : 'top o accessorio'), priority: 'low' })
    }
  }

  // 4. Copertura stagionale
  if (total >= 8) {
    const bySeason  = countTags(garments, 'season_tags')
    const hasWinter = ['inverno', 'autunno', 'winter', 'autumn', 'fall'].some(s => bySeason[s] > 0)
    const hasSummer = ['estate', 'primavera', 'summer', 'spring'].some(s => bySeason[s] > 0)
    if (!hasWinter) suggestions.push({ text: L.noWinterBase, priority: 'medium' })
    if (!hasSummer) suggestions.push({ text: L.noSummerBase, priority: 'medium' })
  }

  // 5. Capi mai utilizzati
  if (outfits.length > 0) {
    const usedIds = new Set(outfits.flatMap(o => o.garment_ids || []))
    const neverUsed = garments.filter(g => !usedIds.has(g.id)).length
    if (neverUsed > 3) {
      suggestions.push({ text: L.unusedMany(neverUsed), priority: 'low' })
    }
  }

  if (suggestions.length === 0) {
    suggestions.push({ text: L.balanced, priority: 'low' })
  }

  const dotColor = { high: '#f87171', medium: '#fb923c', low: '#a3e635' }
  const bgColor  = { high: 'rgba(239,68,68,0.05)', medium: 'rgba(251,146,60,0.05)', low: 'rgba(163,230,53,0.05)' }
  const brColor  = { high: 'rgba(239,68,68,0.15)', medium: 'rgba(251,146,60,0.15)', low: 'rgba(163,230,53,0.15)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {suggestions.slice(0, 6).map((s, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 14px', borderRadius: 12,
          background: bgColor[s.priority], border: `1px solid ${brColor[s.priority]}`,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor[s.priority], flexShrink: 0, marginTop: 4 }} />
          <span style={{ fontSize: 13, lineHeight: 1.55 }}>{s.text}</span>
        </div>
      ))}
    </div>
  )
}

// ── Sezione wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 14, color: 'var(--text)' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

// ── Palette colori ────────────────────────────────────────────────────────────
function ColorPalette({ garments }) {
  const byColor = count(garments, 'color_primary')
  const sorted = sortedEntries(byColor)
  const max = sorted[0]?.[1] || 1

  // Mappa colore nome → hex approssimativo
  const colorMap = {
    // IT
    nero: '#1a1a1a', bianco: '#f7fafc', grigio: '#808080', beige: '#d4b896',
    rosso: '#e53e3e', blu: '#3182ce', verde: '#38a169', giallo: '#d69e2e',
    arancione: '#dd6b20', viola: '#805ad5', rosa: '#d53f8c', marrone: '#7b341e',
    azzurro: '#4299e1', bordeaux: '#822727', navy: '#1a365d', crema: '#fefce8',
    // EN
    black: '#1a1a1a', white: '#f7fafc', grey: '#808080', gray: '#9e9e9e',
    blue: '#3182ce', red: '#e53e3e', green: '#38a169', yellow: '#ecc94b',
    orange: '#dd6b20', purple: '#805ad5', pink: '#d53f8c', brown: '#7b341e',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sorted.map(([color, count]) => {
        const hex = colorMap[color.toLowerCase()] || null
        return (
          <HBar
            key={color}
            label={
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {hex && <span style={{ width: 12, height: 12, borderRadius: '50%', background: hex, border: '1px solid var(--border)', flexShrink: 0, display: 'inline-block' }} />}
                {color}
              </span>
            }
            value={count}
            max={max}
            color={hex || 'var(--primary)'}
          />
        )
      })}
    </div>
  )
}

// ── Componente principale ─────────────────────────────────────────────────────
export default function WardrobeAnalysis({ onClose }) {
  const garments = useWardrobeStore(s => s.garments)
  const outfits  = useWardrobeStore(s => s.outfits)
  const profile  = useWardrobeStore(s => s.profile)
  const lang     = useSettingsStore(s => s.language) || 'it'
  const gender   = profile?.gender || 'maschio'

  const L = lang === 'en' ? {
    title:     'Wardrobe Analysis',
    subtitle:  (n) => `${n} item${n !== 1 ? 's' : ''} analysed`,
    empty:     'Add some items to your wardrobe to see the analysis.',
    secCat:    'Distribution by category',
    secColor:  'Colour distribution',
    secBrand:  'Top brands',
    secSeason: 'Seasonal coverage',
    secGap:    'Gap analysis — what\'s missing',
    secWear:   'Item usage',
    secBuy:    'Purchase suggestions',
    items:     'items',
  } : {
    title:     'Analisi Armadio',
    subtitle:  (n) => `${n} cap${n !== 1 ? 'i' : 'o'} analizzat${n !== 1 ? 'i' : 'o'}`,
    empty:     'Aggiungi dei capi al tuo armadio per vedere l\'analisi.',
    secCat:    'Distribuzione per categoria',
    secColor:  'Distribuzione colori',
    secBrand:  'Brand più presenti',
    secSeason: 'Copertura stagionale',
    secGap:    'Gap Analysis — cosa manca',
    secWear:   'Utilizzo dei capi',
    secBuy:    'Suggerimenti acquisto',
    items:     'capi',
  }

  const { byCat, byBrand, bySeason, catSegments } = useMemo(() => {
    const byCat      = count(garments, 'category')
    const byBrand    = count(garments, 'brand')
    const bySeason   = countTags(garments, 'season_tags')

    const palette = ['#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#6366f1','#84cc16']
    const catSegments = sortedEntries(byCat).map(([cat, val], i) => ({
      label: catLabel(cat, lang),
      value: val,
      color: palette[i % palette.length],
    }))

    return { byCat, byBrand, bySeason, catSegments }
  }, [garments, lang])

  const maxCat    = Math.max(...Object.values(byCat), 1)
  const maxBrand  = Math.max(...Object.values(byBrand), 1)
  const maxSeason = Math.max(...Object.values(bySeason), 1)

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 680,
          border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>{L.title}</h2>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{L.subtitle(garments.length)}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 18, padding: 4 }}>✕</button>
        </div>

        {garments.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-muted)', padding: 40 }}>
            <div style={{ fontSize: 40 }}>👗</div>
            <p style={{ fontSize: 14, textAlign: 'center' }}>{L.empty}</p>
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>

            {/* Panoramica: donut + categorie */}
            <Section title={L.secCat}>
              <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <DonutChart segments={catSegments} lang={lang} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', maxWidth: 140 }}>
                    {catSegments.map(s => (
                      <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  {sortedEntries(byCat).map(([cat, val], i) => (
                    <HBar
                      key={cat}
                      label={catLabel(cat, lang)}
                      value={val}
                      max={maxCat}
                      color={catSegments[i]?.color || 'var(--primary)'}
                      sublabel={L.items}
                    />
                  ))}
                </div>
              </div>
            </Section>

            {/* Colori */}
            <Section title={L.secColor}>
              <ColorPalette garments={garments} />
            </Section>

            {/* Brand */}
            {Object.keys(byBrand).length > 0 && (
              <Section title={L.secBrand}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                  {sortedEntries(byBrand).slice(0, 10).map(([brand, val]) => (
                    <HBar key={brand} label={brand} value={val} max={maxBrand} color="#8b5cf6" sublabel={L.items} />
                  ))}
                </div>
              </Section>
            )}

            {/* Stagioni */}
            {Object.keys(bySeason).length > 0 && (
              <Section title={L.secSeason}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                  {sortedEntries(bySeason).map(([season, val]) => (
                    <HBar key={season} label={season} value={val} max={maxSeason} color="#06b6d4" sublabel={L.items} />
                  ))}
                </div>
              </Section>
            )}

            {/* Gap analysis */}
            <Section title={L.secGap}>
              <GapAnalysis garments={garments} lang={lang} gender={gender} />
            </Section>

            {/* Utilizzo capi */}
            <Section title={L.secWear}>
              <WearAnalysis garments={garments} outfits={outfits} lang={lang} />
            </Section>

            {/* Suggerimenti acquisto */}
            <Section title={L.secBuy}>
              <ShoppingSuggestions garments={garments} outfits={outfits} lang={lang} />
            </Section>

          </div>
        )}
      </div>
    </div>
  )
}
