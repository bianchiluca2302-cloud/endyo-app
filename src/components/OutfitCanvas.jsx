import { imgUrl } from '../api/client'

// Posizioni base del mixer (top, altezza, zIndex per categoria)
const MIXER_LAYOUT = {
  cappello:   { top: '2%',   height: 72,  zIndex: 2 },
  giacchetto: { top: '13%',  height: 188, zIndex: 5 },
  felpa:      { top: '15%',  height: 180, zIndex: 4 },
  maglietta:  { top: '17%',  height: 168, zIndex: 3 },
  pantaloni:  { top: '46%',  height: 200, zIndex: 2 },
  scarpe:     { top: '84%',  height: 68,  zIndex: 1 },
  occhiali:   { top: '4%',   height: 38,  zIndex: 7 },
  cintura:    { top: '43%',  height: 28,  zIndex: 3 },
  borsa:      { top: '38%',  height: 110, zIndex: 1 },
  orologio:   { top: '50%',  height: 44,  zIndex: 3 },
  altro:      { top: '60%',  height: 60,  zIndex: 1 },
}

const CATS_ORDER = [
  'cappello', 'maglietta', 'felpa', 'giacchetto', 'pantaloni',
  'scarpe', 'occhiali', 'cintura', 'borsa', 'orologio', 'altro',
]

/**
 * Renderizza un outfit come canvas statico con i capi posizionati
 * secondo il layout del mixer, inclusi i transform salvati dall'utente.
 *
 * Props:
 *   garmentItems  – array di garment objects (con .id, .category, .photo_bg, .photo_front)
 *   transforms    – dict { garmentId: { dx, dy, scale, rotate } } (opzionale)
 *   bgColor       – stringa hex colore sfondo (null = trasparente)
 *   height        – altezza in px del canvas (default 420)
 */
export default function OutfitCanvas({ garmentItems, transforms = {}, bgColor, height = 420, onGarmentHover }) {
  const scale = height / 470

  // Mappa category → primo garment corrispondente
  const catMap = {}
  for (const g of (garmentItems || [])) {
    if (g?.category && !catMap[g.category]) catMap[g.category] = g
  }

  const hasGiacchetto = !!catMap['giacchetto']
  const hasFelpa      = !!catMap['felpa']

  const isVisible = (cat) => {
    if (cat === 'maglietta' && (hasGiacchetto || hasFelpa)) return false
    if (cat === 'felpa' && hasGiacchetto) return false
    return true
  }

  const visibleCats = CATS_ORDER.filter(
    cat => catMap[cat] && isVisible(cat) && (catMap[cat].photo_bg || catMap[cat].photo_front)
  )

  if (visibleCats.length === 0) {
    return (
      <div style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: bgColor || 'var(--card)',
        color: 'var(--text-dim)',
      }}>
        <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
          <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z"/>
        </svg>
      </div>
    )
  }

  return (
    <div style={{
      position: 'relative', width: '100%', height,
      background: bgColor || 'transparent',
      overflow: 'hidden',
    }}>
      {CATS_ORDER.map(cat => {
        const g = catMap[cat]
        if (!g || !isVisible(cat)) return null
        const layout = MIXER_LAYOUT[cat]
        if (!layout) return null
        const photoPath = g.photo_bg || g.photo_front
        if (!photoPath) return null

        // Applica i transform salvati dall'utente (dx, dy in px del mixer originale, scalati)
        const t   = transforms[String(g.id)] || {}
        const dx  = ((t.dx  || 0) * scale)
        const dy  = ((t.dy  || 0) * scale)
        const sc  = t.scale  || 1
        const ro  = t.rotate || 0
        const transform = `translateX(calc(-50% + ${dx}px)) translateY(${dy}px) scale(${sc}) rotate(${ro}deg)`

        return (
          <div
            key={cat}
            onMouseEnter={onGarmentHover ? (e) => onGarmentHover(g, e.currentTarget) : undefined}
            onMouseLeave={onGarmentHover ? () => onGarmentHover(null, null) : undefined}
            style={{
              position: 'absolute',
              top: layout.top,
              left: '50%',
              transform,
              height: Math.round(layout.height * scale),
              zIndex: layout.zIndex,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: onGarmentHover ? 'pointer' : 'default',
            }}
          >
            <img
              src={imgUrl(photoPath)}
              alt={cat}
              style={{
                height: '100%',
                maxWidth: Math.round(200 * scale),
                objectFit: 'contain',
                userSelect: 'none',
                pointerEvents: 'none',
                display: 'block',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
