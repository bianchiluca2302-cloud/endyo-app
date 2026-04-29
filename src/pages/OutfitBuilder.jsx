import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import GarmentCard from '../components/GarmentCard'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import PageTutorial from '../components/PageTutorial'

const getOutfitTour = (lang) => lang === 'en' ? [
  {
    title: 'Visual Mixer',
    body: 'Select items on the left — they appear in the mixer. Drag to reposition, click to resize.',
    target: '[data-pagetour="outfit-mixer"]',
    position: 'left',
  },
  {
    title: 'AI Stylist',
    body: 'Ask for pairing advice, occasion tips or weather-based suggestions. Apply the result in one click.',
    target: '[data-pagetour="outfit-stylist"]',
    position: 'top',
    cta: 'Got it →',
  },
] : [
  {
    title: 'Mixer visivo',
    body: 'Seleziona i capi a sinistra — compaiono nel mixer. Trascina per riposizionare, clicca per ridimensionare.',
    target: '[data-pagetour="outfit-mixer"]',
    position: 'left',
  },
  {
    title: 'Stylist AI',
    body: 'Chiedi consigli su abbinamenti, occasioni o meteo. Applica il risultato in un click.',
    target: '[data-pagetour="outfit-stylist"]',
    position: 'top',
    cta: 'Capito →',
  },
]
import { completeOutfit, imgUrl, trackBrandClick, chatWithStylistStream, fetchChatQuota, sendBrandFeedback, wearOutfit, fetchWearStats } from '../api/client'
import { brandImgUrl } from '../api/brandClient'
import { useT, useCategoryLabels } from '../i18n'
import useWeather from '../hooks/useWeather'
import useIsMobile from '../hooks/useIsMobile'
import {
  IconShirt, IconSparkle, IconAlertTriangle, IconWind, IconThermometer, IconDroplet,
  IconThumbsUp, IconThumbsDown, IconShoppingBag, IconSave, IconTshirt, IconCheck,
} from '../components/Icons'

const CATEGORIES_ORDER = ['cappello', 'maglietta', 'felpa', 'giacchetto', 'pantaloni', 'scarpe', 'occhiali', 'cintura', 'borsa', 'orologio', 'altro']

// Layout del mixer: posizione verticale e dimensione per ogni categoria
// zIndex: giacchetto (5) > felpa (4) > maglietta (3) — come nella realtà
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

// Category text abbreviations used as fallback icons (no emoji)
const CAT_ICONS = {
  cappello:'CP', maglietta:'TS', felpa:'SW', giacchetto:'JK',
  pantaloni:'PT', scarpe:'SH', occhiali:'GL', cintura:'BL',
  borsa:'BG', orologio:'WC', altro:'+'
}

// Stile bottone controllo mixer
const ctrlBtn = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer',
  fontSize: 14, flexShrink: 0, userSelect: 'none',
}

/**
 * Mixer visuale con gestione strati + drag / rotazione.
 * activeId / onSetActiveId sono gestiti dal parent (OutfitBuilder)
 * così la lista capi esterna può condividere la selezione attiva.
 */
function OutfitMixer({ garments, activeId, onSetActiveId, transformsRef, defaultTransformsRef, isMobileMixer }) {
  const isEmpty = garments.length === 0
  const t = useT()
  const catLabels = useCategoryLabels()

  const hasGiacchetto = garments.some(g => g.category === 'giacchetto')
  const hasFelpa      = garments.some(g => g.category === 'felpa')
  const hasMaglietta  = garments.some(g => g.category === 'maglietta')

  const [hiddenLayers, setHiddenLayers] = useState(new Set())
  const [transforms,   setTransforms]   = useState({})

  // snapshotRef: fonte di verità per i transform. Aggiornato SOLO in modo
  // esplicito (mai nel render body) per evitare sovrascritture con stato stale.
  const snapshotRef = useRef({})

  const draggingRef   = useRef(null)
  const pinchRef      = useRef(null)
  const activeIdRef   = useRef(activeId)
  const containerRef  = useRef(null)

  // Quando la selezione cambia: preserva i transform dei capi ancora presenti
  const garmentKey  = garments.map(g => g.id).sort().join(',')
  const prevKeyRef  = useRef(garmentKey)

  useLayoutEffect(() => {
    if (prevKeyRef.current === garmentKey) return
    prevKeyRef.current = garmentKey
    // Usa String() per coerenza: le chiavi degli oggetti JS sono sempre stringhe,
    // ma i garment.id dal backend sono numeri — il confronto con Set richiederebbe
    // lo stesso tipo, quindi normalizziamo tutto a stringa.
    const currentIds  = new Set(garments.map(g => String(g.id)))
    const currentCats = new Set(garments.map(g => g.category))
    setHiddenLayers(prev => new Set([...prev].filter(cat => currentCats.has(cat))))
    // Leggi da snapshotRef (mai stale, aggiornato solo da operazioni esplicite)
    const snapshot = snapshotRef.current
    const defaults  = defaultTransformsRef?.current || {}
    const next = {}
    for (const [id, t] of Object.entries(defaults)) {
      if (currentIds.has(String(id))) next[id] = t
    }
    for (const [id, t] of Object.entries(snapshot)) {
      if (currentIds.has(String(id))) next[id] = t   // snapshot sovrascrive defaults
    }
    if (defaultTransformsRef) defaultTransformsRef.current = null
    // Aggiorna esplicitamente snapshotRef e transformsRef con il nuovo valore
    snapshotRef.current = next
    if (transformsRef) transformsRef.current = next
    setTransforms(next)
    if (!currentIds.has(String(activeId))) onSetActiveId(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garmentKey])

  // Keep activeIdRef in sync
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  // Pinch-to-scale/rotate: attach directly to container (passive: false for preventDefault)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onPinchStart = (e) => {
      if (e.touches.length !== 2) return
      e.preventDefault()
      draggingRef.current = null  // cancel any ongoing single-finger drag
      const t1 = e.touches[0], t2 = e.touches[1]
      const dist  = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180 / Math.PI
      const id    = activeIdRef.current
      if (id) {
        const cur = snapshotRef.current[id] || {}
        pinchRef.current = {
          dist, angle, id,
          startScale:  cur.scale  ?? 1,
          startRotate: cur.rotate ?? 0,
        }
      }
    }

    const onPinchMove = (e) => {
      if (e.touches.length !== 2 || !pinchRef.current) return
      e.preventDefault()
      e.stopPropagation()
      const t1 = e.touches[0], t2 = e.touches[1]
      const dist  = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180 / Math.PI
      const { id, startScale, startRotate } = pinchRef.current
      const newScale  = Math.max(0.2, Math.min(3, startScale  * (dist / pinchRef.current.dist)))
      const newRotate = startRotate + (angle - pinchRef.current.angle)
      setTransforms(prev => {
        const cur  = prev[id] || { dx: 0, dy: 0, scale: 1, rotate: 0 }
        const next = { ...prev, [id]: { ...cur, scale: newScale, rotate: newRotate } }
        snapshotRef.current = next
        if (transformsRef) transformsRef.current = next
        return next
      })
    }

    const onPinchEnd = (e) => {
      if (e.touches.length < 2) pinchRef.current = null
    }

    container.addEventListener('touchstart', onPinchStart, { passive: false })
    container.addEventListener('touchmove',  onPinchMove,  { passive: false })
    container.addEventListener('touchend',   onPinchEnd)
    return () => {
      container.removeEventListener('touchstart', onPinchStart)
      container.removeEventListener('touchmove',  onPinchMove)
      container.removeEventListener('touchend',   onPinchEnd)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Listener globali per drag
  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      const { id, startX, startY, startDx, startDy } = draggingRef.current
      let dx = startDx + (clientX - startX)
      let dy = startDy + (clientY - startY)
      // Clamp so the garment centre stays inside the canvas bounds
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const halfW = rect.width  / 2 - 20
        const halfH = rect.height / 2 - 20
        dx = Math.max(-halfW, Math.min(halfW, dx))
        dy = Math.max(-halfH, Math.min(halfH, dy))
      }
      setTransforms(prev => {
        const next = { ...prev, [id]: { ...getT(id, prev), dx, dy } }
        snapshotRef.current = next
        if (transformsRef) transformsRef.current = next
        return next
      })
    }
    const onUp = () => { draggingRef.current = null }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend',  onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend',  onUp)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const getT = (id, t = transforms) => ({ dx: 0, dy: 0, scale: 1, rotate: 0, ...t[id] })
  const patchT = (id, fields) =>
    setTransforms(prev => {
      const next = { ...prev, [id]: { ...getT(id, prev), ...fields } }
      snapshotRef.current = next
      if (transformsRef) transformsRef.current = next
      return next
    })
  const resetT = (id) =>
    setTransforms(prev => {
      const n = { ...prev }; delete n[id]
      snapshotRef.current = n
      if (transformsRef) transformsRef.current = n
      return n
    })

  const startDrag = (e, g) => {
    e.preventDefault()
    e.stopPropagation()
    onSetActiveId(g.id)
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const t = getT(g.id)
    draggingRef.current = { id: g.id, startX: clientX, startY: clientY, startDx: t.dx, startDy: t.dy }
  }

  // Zoom rimosso dalla rotella — usare solo lo slider nel pannello controlli

  /**
   * Un capo è visibile nel mixer se:
   * 1. L'utente non l'ha esplicitamente nascosto
   * 2. Non è coperto da uno strato esterno ancora visibile
   */
  const isVisible = (cat) => {
    if (hiddenLayers.has(cat)) return false
    if (cat === 'maglietta') {
      if (hasFelpa      && !hiddenLayers.has('felpa'))      return false
      if (hasGiacchetto && !hiddenLayers.has('giacchetto')) return false
    }
    if (cat === 'felpa') {
      if (hasGiacchetto && !hiddenLayers.has('giacchetto')) return false
    }
    return true
  }

  const toggleLayer = (cat) =>
    setHiddenLayers(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })

  const layerControls = [
    hasGiacchetto                              && { cat: 'giacchetto', label: catLabels.giacchetto },
    hasFelpa && (hasMaglietta || hasGiacchetto) && { cat: 'felpa',      label: catLabels.felpa },
  ].filter(Boolean)

  const activeGarment = garments.find(g => g.id === activeId) || null
  const activeT       = activeGarment ? getT(activeGarment.id) : null

  if (isEmpty) {
    return (
      <div style={{
        height: '100%', minHeight: 220,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 8, color: 'var(--text-dim)',
      }}>
        <div style={{ opacity: 0.2, color: 'var(--text-dim)' }}><IconTshirt size={40} /></div>
        <div style={{ fontSize: 12, opacity: 0.45, textAlign: 'center' }}>
          {t('outfitsSelectHint')}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Controlli strati */}
      {layerControls.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginRight: 2 }}>{t('outfitsLayerLabel')}</span>
          {layerControls.map(({ cat, label }) => {
            const hidden = hiddenLayers.has(cat)
            return (
              <button
                key={cat}
                onClick={() => toggleLayer(cat)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 10px', fontSize: 11, borderRadius: 20,
                  border: `1px solid ${hidden ? 'var(--border)' : 'var(--primary)'}`,
                  background: hidden ? 'transparent' : 'var(--primary-dim)',
                  color: hidden ? 'var(--text-dim)' : 'var(--primary-light)',
                  cursor: 'pointer', fontWeight: 500,
                  transition: 'var(--transition)',
                  opacity: hidden ? 0.55 : 1,
                }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 800, opacity: 0.7 }}>{CAT_ICONS[cat]}</span>
                {hidden ? t('outfitsShowLayer', label) : t('outfitsHideLayer', label)}
              </button>
            )
          })}
        </div>
      )}

      {/* Canvas mixer */}
      <div
        ref={containerRef}
        onClick={() => onSetActiveId(null)}
        style={{
          position: 'relative',
          width: '100%',
          height: 470,
          background: 'radial-gradient(ellipse at 50% 30%, var(--card) 0%, var(--bg) 70%)',
          borderRadius: 14,
          border: `1px solid ${activeId ? 'var(--primary)' : 'var(--border)'}`,
          overflow: 'hidden',
          flexShrink: 0,
          cursor: 'default',
          transition: 'border-color 0.2s',
        }}
      >
        {/* Griglia sottile di sfondo */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, var(--mixer-dot) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          pointerEvents: 'none',
        }} />

        {/* Hint */}
        <div style={{
          position: 'absolute', top: 8, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <div style={{
            background: 'rgba(0,0,0,0.45)', borderRadius: 20,
            padding: '2px 10px', fontSize: 9, color: 'rgba(255,255,255,0.3)',
          }}>
            {isMobileMixer ? 'Tocca per selezionare · Pinch per ridimensionare/ruotare' : t('outfitsCanvasTip')}
          </div>
        </div>

        {CATEGORIES_ORDER
          .filter(cat => garments.some(g => g.category === cat) && isVisible(cat))
          .map(cat => {
            const g      = garments.find(g => g.category === cat)
            const layout = MIXER_LAYOUT[cat]
            const photo  = g.photo_front ? imgUrl(g.photo_front) : null
            const t      = getT(g.id)
            const isActive = activeId === g.id

            return (
              <div
                key={cat}
                onMouseDown={e => startDrag(e, g)}
                onTouchStart={e => startDrag(e, g)}
                onClick={e => { e.stopPropagation(); onSetActiveId(g.id) }}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: layout.top,
                  transform: `translateX(calc(-50% + ${t.dx}px)) translateY(${t.dy}px) scale(${t.scale}) rotate(${t.rotate}deg)`,
                  height: layout.height,
                  zIndex: isActive ? 20 : layout.zIndex,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'grab',
                  outline: isActive ? '2px solid var(--primary)' : 'none',
                  outlineOffset: 3,
                  borderRadius: 4,
                  transition: draggingRef.current?.id === g.id ? 'none' : 'outline 0.15s',
                  userSelect: 'none',
                  touchAction: 'none',
                }}
              >
                {photo ? (
                  <img
                    draggable={false}
                    src={photo}
                    alt={g.name}
                    style={{
                      height: '100%',
                      maxWidth: 200,
                      objectFit: 'contain',
                      opacity: g.bg_status === 'done' ? 1 : 0.82,
                      filter: g.bg_status !== 'done' ? 'drop-shadow(0 0 6px rgba(0,0,0,0.6))' : 'none',
                      pointerEvents: 'none',
                    }}
                  />
                ) : (
                  <div style={{
                    height: '100%', width: layout.height * 0.8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: layout.height * 0.35, opacity: 0.2,
                    pointerEvents: 'none',
                  }}>
                    {CAT_ICONS[cat]}
                  </div>
                )}
              </div>
            )
          })}

        {/* Badge "sfondo non rimosso" */}
        {garments.some(g => g.bg_status !== 'done' && g.photo_front) && (
          <div style={{
            position: 'absolute', bottom: 8, left: 0, right: 0,
            display: 'flex', justifyContent: 'center', pointerEvents: 'none',
          }}>
            <div style={{
              background: 'rgba(0,0,0,0.65)', borderRadius: 20,
              padding: '3px 10px', fontSize: 10, color: 'rgba(255,255,255,0.4)',
            }}>
              {t('outfitsRemoveBgHint')}
            </div>
          </div>
        )}
      </div>

      {/* Controlli capo attivo (inline — accede a patchT/resetT via closure) */}
      {activeGarment && activeT && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--primary)',
          borderRadius: 10, padding: '10px 12px',
          display: 'flex', flexDirection: 'column', gap: 8,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 15 }}>{CAT_ICONS[activeGarment.category]}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeGarment.name}
              </span>
            </div>
            <button onClick={() => resetT(activeGarment.id)}
              style={{ ...ctrlBtn, fontSize: 11, width: 'auto', padding: '3px 8px', flexShrink: 0 }}>
              {t('outfitsReset')}
            </button>
          </div>
          {/* Sliders hidden on mobile — use pinch to scale/rotate */}
          {!isMobileMixer && (<>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 42, flexShrink: 0 }}>
              {Math.round(activeT.scale * 100)}%
            </span>
            <button style={ctrlBtn} onClick={() => patchT(activeGarment.id, { scale: Math.max(0.2, activeT.scale - 0.1) })}>−</button>
            <input type="range" min={20} max={300} step={1}
              value={Math.round(activeT.scale * 100)}
              onChange={e => patchT(activeGarment.id, { scale: Number(e.target.value) / 100 })}
              style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }} />
            <button style={ctrlBtn} onClick={() => patchT(activeGarment.id, { scale: Math.min(3, activeT.scale + 0.1) })}>+</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 42, flexShrink: 0 }}>
              {activeT.rotate > 0 ? '+' : ''}{Math.round(activeT.rotate)}°
            </span>
            <button style={ctrlBtn} onClick={() => patchT(activeGarment.id, { rotate: Math.max(-45, activeT.rotate - 5) })}>↺</button>
            <input type="range" min={-45} max={45} step={1}
              value={Math.round(activeT.rotate)}
              onChange={e => patchT(activeGarment.id, { rotate: Number(e.target.value) })}
              style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }} />
            <button style={ctrlBtn} onClick={() => patchT(activeGarment.id, { rotate: Math.min(45, activeT.rotate + 5) })}>↻</button>
          </div>
          </>)}
          {isMobileMixer && (
            <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.4 }}>
              Usa due dita per ridimensionare e ruotare · Trascina per spostare
            </div>
          )}
        </div>
      )}

    </div>
  )
}

// ── Card prodotto brand con feedback like/dislike ─────────────────────────────
const DISLIKE_REASONS = {
  it: ['Prezzo troppo alto', 'Non è il mio stile', 'Colore sbagliato', 'Non mi piace il brand', 'Ho già qualcosa di simile', 'Altro'],
  en: ['Price too high', 'Not my style', 'Wrong color', "Don't like the brand", 'I already own something similar', 'Other'],
}

function BrandProductCard({ product, language }) {
  const [vote,         setVote]         = useState(null)   // null | 'like' | 'dislike'
  const [showReasons,  setShowReasons]  = useState(false)
  const [reasonSent,   setReasonSent]   = useState(false)
  const [sending,      setSending]      = useState(false)

  const submitVote = async (v, reason = null) => {
    if (sending) return
    setSending(true)
    try {
      await sendBrandFeedback(product.id, v, reason)
      setVote(v)
      if (v === 'dislike' && !reason) setShowReasons(true)
      if (reason) setReasonSent(true)
    } catch {}
    setSending(false)
  }

  const reasons = DISLIKE_REASONS[language] || DISLIKE_REASONS.it

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Card principale */}
      <a
        href={product.buy_url || '#'}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => product.buy_url && trackBrandClick(product.id).catch(() => {})}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--surface)', borderRadius: 8,
          padding: '6px 8px', border: '1px solid var(--border)',
          textDecoration: 'none', cursor: product.buy_url ? 'pointer' : 'default',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 6, flexShrink: 0,
          background: 'var(--bg)', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {product.image_url
            ? <img src={brandImgUrl(product.image_url)} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ color: 'var(--text-dim)', opacity: 0.5, display: 'flex' }}><IconShirt size={16} /></span>
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {product.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
            {product.brand_name}{product.price ? ` · €${product.price}` : ''}
          </div>
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 5px', borderRadius: 4, flexShrink: 0 }}>AD</span>
      </a>

      {/* Pulsanti like/dislike — mostrati finché non votato */}
      {vote === null && (
        <div style={{ display: 'flex', gap: 5, marginTop: 4, paddingLeft: 2 }}>
          <button
            onClick={() => submitVote('like')}
            disabled={sending}
            style={{
              padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg)', fontSize: 11, cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4,
            }}
          ><IconThumbsUp size={12} /> {language === 'en' ? 'Nice' : 'Mi piace'}</button>
          <button
            onClick={() => submitVote('dislike')}
            disabled={sending}
            style={{
              padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg)', fontSize: 11, cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4,
            }}
          ><IconThumbsDown size={12} /> {language === 'en' ? 'Not for me' : 'Non fa per me'}</button>
        </div>
      )}

      {/* Conferma like */}
      {vote === 'like' && (
        <div style={{ fontSize: 10, color: 'var(--success)', marginTop: 4, paddingLeft: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
          <IconThumbsUp size={11} /> {language === 'en' ? 'Noted! More like this.' : 'Salvato! Ti suggerirò cose simili.'}
        </div>
      )}

      {/* Picker motivo dislike */}
      {vote === 'dislike' && showReasons && !reasonSent && (
        <div style={{ marginTop: 6, paddingLeft: 2 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5 }}>
            {language === 'en' ? 'What didn\'t you like?' : 'Cosa non ti convinceva?'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {reasons.map(r => (
              <button
                key={r}
                onClick={() => submitVote('dislike', r)}
                style={{
                  padding: '3px 8px', borderRadius: 12, border: '1px solid var(--border)',
                  background: 'var(--bg)', fontSize: 10, cursor: 'pointer',
                  color: 'var(--text-muted)', transition: 'all .15s',
                }}
                onMouseEnter={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.color = 'var(--text)' }}
                onMouseLeave={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.color = 'var(--text-muted)' }}
              >{r}</button>
            ))}
          </div>
        </div>
      )}

      {/* Conferma dislike con motivo */}
      {vote === 'dislike' && reasonSent && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, paddingLeft: 2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IconThumbsDown size={11} /> {language === 'en' ? 'Got it, I\'ll keep that in mind.' : 'Capito, non lo riproporrò.'}</span>
        </div>
      )}
    </div>
  )
}

// ── Renderer Markdown leggero ─────────────────────────────────────────────────
// Supporta: **grassetto**, *corsivo*, `codice`, newline → <br>
function MarkdownText({ text }) {
  if (!text) return null
  const segments = []
  let rest = text
  // Regex che cattura bold, italic, code, oppure blocchi di testo normale
  const pattern = /(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\n)/g
  let lastIndex = 0
  let match
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ type: 'text', v: text.slice(lastIndex, match.index) })
    if (match[2] !== undefined) segments.push({ type: 'b', v: match[2] })
    else if (match[3] !== undefined) segments.push({ type: 'i', v: match[3] })
    else if (match[4] !== undefined) segments.push({ type: 'code', v: match[4] })
    else if (match[0] === '\n') segments.push({ type: 'br' })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) segments.push({ type: 'text', v: text.slice(lastIndex) })
  return (
    <>
      {segments.map((s, i) => {
        if (s.type === 'b')    return <strong key={i}>{s.v}</strong>
        if (s.type === 'i')    return <em key={i}>{s.v}</em>
        if (s.type === 'code') return <code key={i} style={{ background: 'rgba(139,92,246,0.15)', borderRadius: 3, padding: '1px 4px', fontSize: '0.9em' }}>{s.v}</code>
        if (s.type === 'br')   return <br key={i} />
        return <span key={i}>{s.v}</span>
      })}
    </>
  )
}

// ── StylistChat (integrato in OutfitBuilder) ──────────────────────────────────
const SUGGESTIONS = {
  it: ['Crea un look casual per oggi', 'Cosa indosso per una cena elegante?', 'Come abbino i capi selezionati?', 'Look per il weekend'],
  en: ['Create a casual look for today', 'What to wear for a dinner?', 'How do I style the selected items?', 'Weekend look'],
}

/**
 * @param {object}   props
 * @param {Array}    props.selectedGarments  — capi selezionati nell'editor
 * @param {boolean}  props.compact           — nasconde l'header (usato in StylistSlider)
 * @param {function} props.onApplyOutfit     — (ids, name, notes) => void
 * @param {number}   props.remainingQuota    — richieste rimanenti (da StylistSlider)
 * @param {function} props.onQuotaUpdate     — (remaining) => void
 */
function StylistChat({ selectedGarments, compact = false, onApplyOutfit, remainingQuota, onQuotaUpdate, weather = null, occasion = null }) {
  const garments = useWardrobeStore(s => s.garments)
  const language = useSettingsStore(s => s.language) || 'it'
  const t = useT()

  const makeWelcome = (selected, lang) => {
    if (selected.length > 0) {
      const names = selected.map(g => g.name).join(', ')
      return lang === 'en'
        ? `Hi! 👋 I see you have ${names} selected.\n\nTell me the occasion and I'll put together the rest of the outfit for you.`
        : `Ciao! 👋 Vedo che hai selezionato ${names}.\n\nDimmi l'occasione e creo il resto dell'outfit per te.`
    }
    const n = garments.length
    return lang === 'en'
      ? `Hi! 👋 I'm your AI stylist. Your wardrobe has ${n} item${n !== 1 ? 's' : ''}.\n\nSelect some garments or just tell me what occasion you're dressing for.`
      : `Ciao! 👋 Sono il tuo stylist AI. Il tuo armadio ha ${n} cap${n !== 1 ? 'i' : 'o'}.\n\nSeleziona dei capi o dimmi direttamente per quale occasione vuoi vestirti.`
  }

  const [messages, setMessages]           = useState([{ role: 'assistant', content: makeWelcome(selectedGarments, language) }])
  const [input,    setInput]              = useState('')
  const [loading,  setLoading]            = useState(false)
  const endRef     = useRef(null)
  const topRef     = useRef(null)
  const inputRef   = useRef(null)
  const prevSelKey = useRef(selectedGarments.map(g => g.id).join(','))

  // Aggiorna benvenuto quando cambia la selezione
  useEffect(() => {
    const key = selectedGarments.map(g => g.id).join(',')
    if (key !== prevSelKey.current) {
      prevSelKey.current = key
      setMessages([{ role: 'assistant', content: makeWelcome(selectedGarments, language) }])
    }
  }, [selectedGarments.map(g => g.id).join(',')]) // eslint-disable-line

  useEffect(() => {
    if (messages.length <= 1) {
      // Welcome/reset: mostra l'inizio del messaggio
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      // Nuovi messaggi: scorri alla fine
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // ── Estrae i blocchi <OUTFIT> e <BRAND_PRODUCTS> e li separa dal testo ───────
  const parseAssistantMsg = (fullText, brandProductsFromEvent = []) => {
    const outfitMatch = fullText.match(/<OUTFIT>([\s\S]*?)<\/OUTFIT>/)
    const text = fullText
      .replace(/<OUTFIT>[\s\S]*?<\/OUTFIT>/g, '')
      .replace(/<BRAND_PRODUCTS>[\s\S]*?<\/BRAND_PRODUCTS>/g, '')
      .trim()

    let outfit = null
    if (outfitMatch) {
      try { outfit = JSON.parse(outfitMatch[1]) } catch {}
    }
    // I prodotti brand arrivano dall'evento SSE (già risolti dal backend)
    return { text, outfit, brandProducts: brandProductsFromEvent }
  }

  // ── Invia messaggio con streaming ──────────────────────────────────────────
  const send = async (text) => {
    if (!text.trim() || loading) return
    const trimmed = text.trim()
    // History = tutti i messaggi tranne il benvenuto iniziale, senza outfit data
    const history = messages
      .slice(1)
      .map(m => ({ role: m.role, content: m.text || m.content || '' }))

    setMessages(prev => [
      ...prev,
      { role: 'user', content: trimmed },
      { role: 'assistant', content: '', text: '', streaming: true },
    ])
    setInput('')
    setLoading(true)

    let accumulated = ''

    await chatWithStylistStream({
      message: trimmed,
      history,
      language,
      weather,
      occasion,
      onToken: (tok) => {
        accumulated += tok
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', content: accumulated, text: accumulated, streaming: true }
          return next
        })
      },
      onDone: ({ remaining, remaining_day, remaining_week, brandProducts: bp = [] } = {}) => {
        const { text, outfit, brandProducts } = parseAssistantMsg(accumulated, bp)
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', content: text, text, outfit, brandProducts, streaming: false }
          return next
        })
        const rd = remaining_day ?? remaining
        if (rd != null) onQuotaUpdate?.(rd, remaining_week)
        setLoading(false)
      },
      onError: (err) => {
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', content: `⚠ ${err}`, text: `⚠ ${err}`, streaming: false }
          return next
        })
        setLoading(false)
      },
    })
  }

  const canSend = remainingQuota == null || remainingQuota !== 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Intestazione (solo in modalità non-compact) */}
      {!compact && (
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'linear-gradient(135deg, rgba(108,63,199,0.07), transparent)',
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, var(--primary), #c084fc)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
          }}><IconSparkle size={14} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)' }}>{t('assistantTitle')}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {loading ? (language === 'en' ? 'Thinking…' : 'Sto pensando…')
                : selectedGarments.length > 0
                  ? (language === 'en' ? `${selectedGarments.length} item${selectedGarments.length !== 1 ? 's' : ''} selected` : `${selectedGarments.length} capo/i selezionati`)
                  : t('assistantOnline', garments.length)}
            </div>
          </div>
          {messages.length > 1 && (
            <button
              onClick={() => setMessages([{ role: 'assistant', content: makeWelcome(selectedGarments, language) }])}
              style={{ fontSize: 11, color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, padding: '3px 8px', cursor: 'pointer' }}
            >{language === 'en' ? 'Clear' : 'Pulisci'}</button>
          )}
        </div>
      )}

      {/* Area messaggi */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div ref={topRef} />
        {messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          return (
            <div
              key={i}
              style={{
                display: 'flex', gap: 7,
                flexDirection: isUser ? 'row-reverse' : 'row',
                alignItems: 'flex-end',
                animation: 'msgFadeIn 0.2s ease',
              }}
            >
              {!isUser && (
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--primary), #c084fc)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                }}><IconSparkle size={11} /></div>
              )}
              <div style={{ maxWidth: '82%' }}>
                <div style={{
                  padding: '8px 11px', fontSize: 12, lineHeight: 1.65, wordBreak: 'break-word',
                  borderRadius: isUser ? '13px 13px 3px 13px' : '13px 13px 13px 3px',
                  background: isUser ? 'linear-gradient(135deg, var(--primary), #7c3aed)' : 'var(--card)',
                  border: isUser ? 'none' : '1px solid var(--border)',
                  color: isUser ? '#fff' : 'var(--text)',
                }}>
                  {isUser
                    ? msg.content
                    : <MarkdownText text={msg.content || msg.text || ''} />
                  }
                  {/* Cursore lampeggiante durante lo streaming */}
                  {msg.streaming && <span style={{ animation: 'blink 0.8s step-end infinite', opacity: 0.6 }}>▍</span>}
                </div>
                {/* Pulsante Applica outfit (solo quando l'AI suggerisce un outfit dall'armadio) */}
                {!isUser && msg.outfit && onApplyOutfit && (
                  <button
                    onClick={() => onApplyOutfit(msg.outfit.ids, msg.outfit.name, msg.outfit.notes)}
                    style={{
                      marginTop: 6, padding: '6px 12px', borderRadius: 8, border: 'none',
                      background: 'linear-gradient(135deg, var(--primary), #7c3aed)',
                      color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {language === 'en' ? 'Apply outfit' : 'Applica outfit'} →
                  </button>
                )}

                {/* Card prodotti brand suggeriti dall'AI — con feedback like/dislike */}
                {!isUser && msg.brandProducts?.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <IconShoppingBag size={11} /> {language === 'en' ? 'Shop the look' : 'Completa il look'}
                    </div>
                    {msg.brandProducts.map(p => (
                      <BrandProductCard key={p.id} product={p} language={language} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Indicatore di caricamento (solo se non c'è già un messaggio in streaming) */}
        {loading && !messages[messages.length - 1]?.streaming && (
          <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end' }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, var(--primary), #c084fc)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
            }}><IconSparkle size={11} /></div>
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: '13px 13px 13px 3px', padding: '10px 13px', display: 'flex', gap: 4,
            }}>
              {[0, 1, 2].map(j => (
                <div key={j} style={{
                  width: 5, height: 5, borderRadius: '50%', background: 'var(--text-dim)',
                  animation: `bounce 1s ease infinite ${j * 0.15}s`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Suggerimenti rapidi (solo prima risposta) */}
      {messages.length <= 1 && (
        <div style={{ padding: '0 12px 6px', display: 'flex', gap: 5, flexWrap: 'wrap', flexShrink: 0 }}>
          {(SUGGESTIONS[language] || SUGGESTIONS.it).map(s => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={loading}
              style={{
                padding: '4px 9px', background: 'var(--card)',
                border: '1px solid var(--border)', borderRadius: 14,
                color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
              }}
            >{s}</button>
          ))}
        </div>
      )}

      {/* Upgrade card — appare solo quando il limite è esaurito, mai prima */}
      {remainingQuota === 0 && (
        <div style={{
          margin: '0 10px 8px', borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(108,63,199,0.12), rgba(192,132,252,0.08))',
          border: '1px solid rgba(139,92,246,0.3)',
          padding: '10px 14px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-light)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconSparkle size={13} /> {language === 'en' ? 'Daily AI limit reached' : 'Limite giornaliero AI raggiunto'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 8 }}>
            {language === 'en'
              ? 'Your daily requests reset at midnight. Upgrade to Premium or Premium Plus for more requests and extra features.'
              : 'Le richieste giornaliere si ricaricano a mezzanotte. Con Premium o Premium Plus hai più richieste e funzioni extra.'}
          </div>
          <a href="#/premium" style={{
            display: 'inline-block', marginTop: 8,
            fontSize: 11, fontWeight: 700, color: 'var(--primary-light)',
            textDecoration: 'none',
          }}>
            {language === 'en' ? 'View Premium plans →' : 'Scopri i piani Premium →'}
          </a>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '6px 10px 8px', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 7, flexShrink: 0,
      }}>
        <textarea
          ref={inputRef}
          value={input}
          disabled={!canSend}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
          placeholder={
            !canSend
              ? (language === 'en' ? 'Daily limit reached…' : 'Limite giornaliero raggiunto…')
              : (language === 'en' ? 'Ask your stylist… (Enter)' : 'Chiedi allo stylist… (Invio)')
          }
          rows={1}
          style={{
            flex: 1, padding: '7px 11px', background: 'var(--card)',
            border: '1px solid var(--border)', borderRadius: 9,
            color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font)',
            resize: 'none', outline: 'none', lineHeight: 1.5,
            opacity: !canSend ? 0.5 : 1,
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-dim)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading || !canSend}
          className="btn btn-primary"
          style={{ padding: '7px 13px', alignSelf: 'flex-end', fontSize: 14 }}
        >→</button>
      </div>

      <style>{`
        @keyframes bounce   { 0%,80%,100%{transform:translateY(0);opacity:.5} 40%{transform:translateY(-5px);opacity:1} }
        @keyframes msgFadeIn{ from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  )
}

// ── WeatherBadge — badge con tooltip previsioni orarie ───────────────────────
function WeatherBadge({ weather, language, chatOpen }) {
  const [hovered, setHovered] = useState(false)
  const [tapped,  setTapped]  = useState(false)
  const isMobile = useIsMobile()

  // Chiudi il tooltip quando la chat si chiude
  useEffect(() => {
    if (!chatOpen) setTapped(false)
  }, [chatOpen])

  const showTooltip = isMobile ? tapped : hovered

  const rainLabel = language === 'en' ? 'rain' : 'pioggia'
  const feelsLabel = language === 'en' ? 'feels' : 'percepita'
  const humLabel = language === 'en' ? 'hum.' : 'umid.'
  const windLabel = language === 'en' ? 'wind' : 'vento'
  const forecastTitle = language === 'en' ? 'Today\'s forecast' : 'Previsioni di oggi'

  return (
    <div
      style={{ position: 'relative', flexShrink: 0 }}
      onMouseEnter={() => !isMobile && setHovered(true)}
      onMouseLeave={() => !isMobile && setHovered(false)}
      onClick={e => { e.stopPropagation(); if (isMobile) setTapped(t => !t) }}
    >
      {/* Badge compatto */}
      <span style={{
        fontSize: 11, fontWeight: 500,
        color: showTooltip ? 'var(--primary-light)' : 'var(--text-muted)',
        background: showTooltip ? 'rgba(108,63,199,0.1)' : 'var(--bg)',
        border: `1px solid ${showTooltip ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 10, padding: '2px 7px',
        display: 'flex', alignItems: 'center', gap: 3,
        cursor: isMobile ? 'pointer' : 'default', transition: 'all .15s',
        userSelect: 'none',
      }}>
        {weather.icon} {weather.temp}°C
      </span>

      {/* Tooltip previsioni */}
      {showTooltip && (
        <div style={{
          position: 'absolute',
          ...(isMobile
            ? { top: 'calc(100% + 8px)', right: 0 }
            : { bottom: 'calc(100% + 8px)', right: 0 }),
          width: 230, zIndex: 999,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '12px 14px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          pointerEvents: isMobile ? 'auto' : 'none',
        }}>
          {/* Condizioni attuali */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              {weather.icon} {weather.temp}°C — {weather.label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><IconThermometer size={12} /> {feelsLabel} {weather.feels}°C</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><IconDroplet size={12} /> {humLabel} {weather.humidity}%</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><IconWind size={12} /> {windLabel} {weather.wind} km/h</span>
            </div>
          </div>

          {/* Previsioni orarie */}
          {weather.hourly?.length > 0 && (
            <>
              <div style={{
                fontSize: 10, fontWeight: 600, color: 'var(--text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
              }}>
                {forecastTitle}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
                {weather.hourly.map(h => (
                  <div key={h.hour} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    flex: 1,
                  }}>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                      {String(h.hour).padStart(2, '0')}:00
                    </span>
                    <span style={{ fontSize: 16 }}>{h.icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
                      {h.temp}°
                    </span>
                    {h.precip > 0 && (
                      <span style={{ fontSize: 9, color: '#60a5fa' }}>
                        {h.precip}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Freccia — punta verso il badge (su mobile il tooltip è sotto) */}
          {isMobile ? (
            <div style={{
              position: 'absolute', top: -6, right: 14,
              width: 10, height: 10,
              background: 'var(--card)', border: '1px solid var(--border)',
              borderBottom: 'none', borderRight: 'none',
              transform: 'rotate(45deg)',
            }} />
          ) : (
            <div style={{
              position: 'absolute', bottom: -6, right: 14,
              width: 10, height: 10,
              background: 'var(--card)', border: '1px solid var(--border)',
              borderTop: 'none', borderLeft: 'none',
              transform: 'rotate(45deg)',
            }} />
          )}
        </div>
      )}
    </div>
  )
}

// ── StylistSlider — barra scorrevole nella parte inferiore del selettore capi ──
function StylistSlider({ selectedGarments, onApplyOutfit, currentTab }) {
  const language = useSettingsStore(s => s.language) || 'it'
  const isMobile = useIsMobile()
  const profile  = useWardrobeStore(s => s.profile)
  const [isOpen,        setIsOpen]        = useState(false)
  const prevTabRef = useRef(currentTab)
  useEffect(() => {
    if (prevTabRef.current !== currentTab) {
      setIsOpen(false)
      prevTabRef.current = currentTab
    }
  }, [currentTab])
  const [pulsing,       setPulsing]       = useState(false)
  const [remaining,     setRemaining]     = useState(null)
  const [remainingWeek, setRemainingWeek] = useState(null)
  const [limitDay,      setLimitDay]      = useState(10)
  const [limitWeek,     setLimitWeek]     = useState(50)
  const prevCountRef = useRef(0)
  const { weather, loading: weatherLoading } = useWeather(language)

  // Stili preferiti dal profilo — passati come contesto allo stylist
  const stylePrefs = (profile?.style_preferences || []).join(', ') || null

  // Altezza chat adattiva: più compatta su mobile per non sforare
  const chatHeight = isMobile ? 240 : 375

  // Carica quota al mount
  useEffect(() => {
    fetchChatQuota().then(q => {
      if (q.plan === 'premium') {
        setRemaining(-1); setRemainingWeek(-1)
      } else {
        setRemaining(q.remaining_day ?? q.remaining ?? null)
        setRemainingWeek(q.remaining_week ?? null)
        if (q.limit_day)  setLimitDay(q.limit_day)
        if (q.limit_week) setLimitWeek(q.limit_week)
      }
    }).catch(() => {})
  }, [])

  // Apre automaticamente e pulsa quando viene selezionato il primo capo
  useEffect(() => {
    const count = selectedGarments.length
    if (prevCountRef.current === 0 && count > 0) {
      setIsOpen(true)
      setPulsing(true)
      setTimeout(() => setPulsing(false), 1800)
    }
    prevCountRef.current = count
  }, [selectedGarments.length]) // eslint-disable-line

  const quotaLabel = remaining === null ? null
    : remaining === -1 ? null          // premium: non mostrare nulla
    : remaining === 0 ? (language === 'en' ? '0 left today' : '0 rimaste oggi')
    : (language === 'en' ? `${remaining} left today` : `${remaining} rimaste oggi`)

  const hint = selectedGarments.length > 0
    ? (language === 'en'
        ? `${selectedGarments.length} item${selectedGarments.length !== 1 ? 's' : ''} selected — tap for advice`
        : `${selectedGarments.length} capo/i selezionati — tocca per consigli`)
    : (language === 'en' ? 'Ask your AI stylist…' : 'Chiedi allo Stylist AI…')

  return (
    <div style={{ flexShrink: 0, background: 'var(--surface)' }}>

      {/* Barra handle cliccabile */}
      <div
        onClick={() => setIsOpen(o => !o)}
        style={{
          height: 52, display: 'flex', alignItems: 'center', gap: 10,
          padding: '0 14px', cursor: 'pointer', userSelect: 'none',
          background: isOpen
            ? 'linear-gradient(135deg, rgba(108,63,199,0.1), rgba(192,132,252,0.05))'
            : 'var(--surface)',
          transition: 'background 0.25s',
          animation: pulsing ? 'stylistPulse 0.9s ease 2' : 'none',
        }}
      >
        {/* Avatar IA */}
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, var(--primary), #c084fc)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
        }}><IconSparkle size={14} /></div>

        {/* Testo */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)' }}>
            {language === 'en' ? 'AI Stylist' : 'Stylist AI'}
          </div>
          <div style={{
            fontSize: 11, marginTop: 1,
            color: selectedGarments.length > 0 ? 'var(--primary-light)' : 'var(--text-dim)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {hint}
          </div>
        </div>

        {/* Badge meteo con tooltip previsioni */}
        {weather
          ? <WeatherBadge weather={weather} language={language} chatOpen={isOpen} />
          : weatherLoading && (
            <span style={{
              fontSize: 11, flexShrink: 0,
              color: 'var(--text-dim)', background: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: 10, padding: '2px 10px',
              animation: 'weatherPulse 1.2s ease-in-out infinite',
            }}><IconThermometer size={11} /> …</span>
          )
        }

        {/* Badge quota rimasta */}
        {quotaLabel && (
          <span style={{
            fontSize: 10, fontWeight: 600, flexShrink: 0,
            color: remaining === 0 ? '#f59e0b' : 'var(--text-dim)',
            background: remaining === 0 ? 'rgba(245,158,11,0.1)' : 'var(--bg)',
            border: `1px solid ${remaining === 0 ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
            borderRadius: 10, padding: '2px 7px',
          }}>{quotaLabel}</span>
        )}

        {/* Freccia animata */}
        <span style={{
          fontSize: 11, color: 'var(--text-muted)', flexShrink: 0,
          transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          display: 'inline-block',
        }}>▼</span>
      </div>

      {/* Area chat espandibile */}
      <div style={{
        maxHeight: isOpen ? `${chatHeight}px` : '0px',
        overflow: 'hidden',
        transition: 'max-height 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <div style={{ height: chatHeight, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <StylistChat
            selectedGarments={selectedGarments}
            compact
            onApplyOutfit={onApplyOutfit}
            remainingQuota={remaining}
            onQuotaUpdate={(r, rw) => { setRemaining(r); if (rw != null) setRemainingWeek(rw) }}
            weather={weather?.summary ?? null}
            occasion={stylePrefs}
          />
        </div>
      </div>

      <style>{`
        @keyframes stylistPulse {
          0%   { background: var(--surface); }
          40%  { background: rgba(139, 92, 246, 0.12); }
          100% { background: var(--surface); }
        }
        @keyframes weatherPulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
      `}</style>
    </div>
  )
}

/* ── MobileSelectionStrip ────────────────────────────────────────────────────
 * Striscia collassabile che mostra i capi selezionati sul mobile.
 * Tap → espande/collassa un'anteprima griglia.
 * ──────────────────────────────────────────────────────────────────────────── */
function MobileSelectionStrip({ garments: selectedList, onRemove }) {
  const [expanded,  setExpanded]  = useState(false)
  const [animKey,   setAnimKey]   = useState(0)
  const prevCount = useRef(selectedList.length)

  useEffect(() => {
    if (selectedList.length !== prevCount.current) {
      prevCount.current = selectedList.length
      setAnimKey(k => k + 1)
    }
  }, [selectedList.length])

  return (
    <div style={{
      background: 'var(--primary-dim)',
      borderBottom: '1px solid var(--primary-border)',
      flexShrink: 0,
      transition: 'all 0.25s ease',
    }}>
      {/* ── Header row ── */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {/* Thumbnail pills */}
        <div style={{ display: 'flex', gap: -6, flexShrink: 0 }}>
          {selectedList.slice(0, 5).map((g, i) => (
            <div key={g.id} style={{
              width: 34, height: 34, borderRadius: '50%',
              border: '2px solid var(--primary)',
              background: 'var(--card)',
              overflow: 'hidden',
              marginLeft: i > 0 ? -10 : 0,
              zIndex: 5 - i,
              position: 'relative',
              flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {g.photo_front ? (
                <img src={imgUrl(g.photo_front)} alt={g.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <span style={{ fontSize: 14 }}>👕</span>
              )}
            </div>
          ))}
          {selectedList.length > 5 && (
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              border: '2px solid var(--primary)',
              background: 'var(--primary-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginLeft: -10, zIndex: 0, position: 'relative',
              fontSize: 11, fontWeight: 700, color: 'var(--primary-light)',
            }}>
              +{selectedList.length - 5}
            </div>
          )}
        </div>

        {/* Label */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span
              key={animKey}
              style={{
                display: 'inline-block',
                animation: animKey > 0 ? 'badgePop 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards' : 'none',
              }}
            >
              {selectedList.length}
            </span>
            {' '}{selectedList.length === 1 ? 'capo selezionato' : 'capi selezionati'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--primary-light)', opacity: 0.7, marginTop: 1 }}>
            {expanded ? 'Tocca per chiudere' : 'Tocca per vedere'}
          </div>
        </div>

        {/* Chevron */}
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
          stroke="var(--primary-light)" strokeWidth={2} strokeLinecap="round"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>

      {/* ── Expanded grid ── */}
      {expanded && (
        <div style={{
          padding: '4px 14px 14px',
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(selectedList.length, 4)}, 1fr)`,
          gap: 8,
        }}>
          {selectedList.map(g => (
            <div key={g.id} style={{ position: 'relative' }}>
              {/* NON usare overflow:hidden sul div esterno: iOS Safari bug con border */}
              <div style={{
                borderRadius: 12, aspectRatio: '3/4',
                background: 'var(--card)', border: '1px solid var(--primary-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
              }}>
                {/* overflow:hidden solo qui per clippare l'immagine */}
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: 11,
                  overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {g.photo_front ? (
                    <img src={imgUrl(g.photo_front)} alt={g.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontSize: 22 }}>👕</span>
                  )}
                </div>
              </div>
              {/* Remove button */}
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(g) }}
                style={{
                  position: 'absolute', top: -4, right: -4,
                  width: 20, height: 20, borderRadius: '50%',
                  background: '#ef4444', border: '2px solid var(--primary-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#fff',
                  WebkitTapHighlightColor: 'transparent',
                  padding: 0,
                }}
              >
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
              <div style={{
                fontSize: 10, color: 'var(--primary-light)', marginTop: 3,
                textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {g.name}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function OutfitBuilder() {
  const garments    = useWardrobeStore(s => s.garments)
  const outfits     = useWardrobeStore(s => s.outfits)
  const saveOutfit  = useWardrobeStore(s => s.saveOutfit)
  const removeOutfit = useWardrobeStore(s => s.removeOutfit)
  const getById     = useWardrobeStore(s => s.getGarmentById)
  const t = useT()
  const CATEGORY_LABELS = useCategoryLabels()

  const language = useSettingsStore(s => s.language) || 'it'
  const isMobile = useIsMobile()
  const [tab,           setTab]           = useState('builder')
  const [selected,      setSelected]      = useState({})           // { category: garmentId }
  const [mixerActiveId, setMixerActiveId] = useState(null)
  const mixerTransformsRef    = useRef({})   // transforms correnti del mixer
  const defaultTransformsRef  = useRef(null) // transforms da applicare al prossimo load
  const [outfitName, setOutfitName] = useState('')
  const [saveMsg,   setSaveMsg]   = useState(null)
  const [completing, setCompleting] = useState(false)
  const [completeNotes, setCompleteNotes] = useState(null)
  const [brandSuggestions, setBrandSuggestions] = useState([])
  const [detailOutfit, setDetailOutfit] = useState(null)
  const [wearCounts,     setWearCounts]     = useState({})  // { outfitId: count }
  const [builderSearch,  setBuilderSearch]  = useState('')

  // Carica contatori wear al mount e quando cambia tab
  useEffect(() => {
    if (tab === 'saved') {
      fetchWearStats().then(d => setWearCounts(d.counts || {})).catch(() => {})
    }
  }, [tab])

  // Try-on outfit: mantenuto per futura implementazione con sponsorizzazione
  // const [tryonLoading, setTryonLoading] = useState(false)
  // const [tryonResult,  setTryonResult]  = useState(null)
  // const [tryonError,   setTryonError]   = useState(null)
  // const handleTryon = async () => { ... outfitTryon(selectedGarments.map(g => g.id)) ... }

  const selectedGarments = Object.values(selected)
    .map(id => getById(id))
    .filter(Boolean)

  const toggleGarment = (garment) => {
    const cat = garment.category
    setSelected(prev => {
      if (prev[cat] === garment.id) {
        const next = { ...prev }
        delete next[cat]
        return next
      }
      return { ...prev, [cat]: garment.id }
    })
  }

  const handleSave = async () => {
    if (selectedGarments.length === 0 || !outfitName.trim()) return
    await saveOutfit({
      name: outfitName.trim(),
      garment_ids: selectedGarments.map(g => g.id),
      transforms: mixerTransformsRef.current || {},
      ai_generated: 0,
    })
    setSaveMsg(t('outfitsSaveMsg'))
    setOutfitName('')
    setSelected({})
    setMixerActiveId(null)
    setTimeout(() => setSaveMsg(null), 2500)
  }

  const handleComplete = async () => {
    if (selectedGarments.length === 0) return
    setCompleting(true)
    setCompleteNotes(null)
    setBrandSuggestions([])
    try {
      const { additional_ids, notes, brand_suggestions } = await completeOutfit(selectedGarments.map(g => g.id))
      if (additional_ids?.length > 0) {
        const newSel = { ...selected }
        for (const id of additional_ids) {
          const g = getById(id)
          if (g && !newSel[g.category]) newSel[g.category] = g.id
        }
        setSelected(newSel)
      }
      setCompleteNotes(notes || null)
      if (notes) setTimeout(() => setCompleteNotes(null), 8000)
      if (brand_suggestions?.length > 0) setBrandSuggestions(brand_suggestions)
    } catch (e) { console.error(e) }
    setCompleting(false)
  }

  const searchQ = builderSearch.trim().toLowerCase()
  const byCategory = CATEGORIES_ORDER.reduce((acc, cat) => {
    let list = garments.filter(g => g.category === cat)
    if (searchQ) {
      list = list.filter(g =>
        (g.name  || '').toLowerCase().includes(searchQ) ||
        (g.brand || '').toLowerCase().includes(searchQ)
      )
    }
    acc[cat] = list
    return acc
  }, {})

  const OUTFIT_TOUR = getOutfitTour(language)

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden', position: 'relative' }}>
      {!isMobile && <PageTutorial pageId="outfits" steps={OUTFIT_TOUR} />}

      {/* ── Left: selettore capi ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: isMobile ? 'none' : '1px solid var(--border)', overflow: 'hidden', paddingBottom: isMobile ? 'calc(108px + env(safe-area-inset-bottom, 0px))' : 0 }}>

        {/* Titolo pagina — sopra i tab */}
        <div style={{
          padding: '14px 16px 0',
          background: 'var(--surface)', flexShrink: 0,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
            {t('outfitMixerTitle')}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 10px' }}>
            {outfits.length === 0
              ? (language === 'en' ? 'No saved outfits yet' : 'Nessun outfit salvato')
              : `${outfits.length} ${outfits.length === 1
                  ? (language === 'en' ? 'saved outfit' : 'outfit salvato')
                  : (language === 'en' ? 'saved outfits' : 'outfit salvati')}`
            }
          </p>
        </div>

        {/* Tabs — pill style coerente con Friends */}
        <div style={{
          display: 'flex', alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)', padding: '0 16px 10px', gap: 6, flexShrink: 0,
        }}>
          {[
          ['builder', t('wardrobeStep2Cta')],
          ['saved', t('outfitsTitle')],
          ...(isMobile ? [['mixer', 'Mixer']] : []),
        ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 600, borderRadius: 99,
                cursor: 'pointer', transition: 'all 0.18s',
                color: tab === id ? 'var(--primary-light)' : 'var(--text-muted)',
                background: tab === id ? 'var(--primary-dim)' : 'transparent',
                border: `1px solid ${tab === id ? 'var(--primary-border)' : 'transparent'}`,
              }}
              onMouseEnter={e => { if (tab !== id) { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.borderColor = 'var(--border)' } }}
              onMouseLeave={e => { if (tab !== id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' } }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Mobile: mini strip capi selezionati ────────────────────────────── */}
        {isMobile && tab === 'builder' && selectedGarments.length > 0 && (
          <MobileSelectionStrip
            garments={selectedGarments}
            onRemove={(g) => toggleGarment(g)}
          />
        )}

        {/* Tab: builder */}
        {tab === 'builder' && (
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
            {/* Barra di ricerca — desktop e mobile */}
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none"
                stroke="var(--text-dim)" strokeWidth={2} strokeLinecap="round"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              >
                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                value={builderSearch}
                onChange={e => setBuilderSearch(e.target.value)}
                placeholder={language === 'en' ? 'Search garments…' : 'Cerca capi…'}
                style={{
                  width: '100%', padding: '10px 34px 10px 36px',
                  borderRadius: 12, border: '1px solid var(--border)',
                  background: 'var(--card)', color: 'var(--text)',
                  fontSize: 13, outline: 'none', boxSizing: 'border-box',
                  WebkitAppearance: 'none',
                }}
              />
              {builderSearch && (
                <button
                  onClick={() => setBuilderSearch('')}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'var(--border)', border: 'none', borderRadius: '50%',
                    width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', padding: 0, color: 'var(--text-muted)',
                  }}
                >
                  <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12"/>
                  </svg>
                </button>
              )}
            </div>
            {CATEGORIES_ORDER.map(cat => (
              byCategory[cat].length > 0 && (
                <div key={cat} style={{ marginBottom: 20 }}>
                  <div className="section-title">
                    {CATEGORY_LABELS[cat]}
                    {selected[cat] && <span style={{ color: 'var(--success)', marginLeft: 8 }}>✓</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                    {byCategory[cat].map(g => (
                      <GarmentCard
                        key={g.id}
                        garment={g}
                        selectable
                        selected={selected[cat] === g.id}
                        onClick={() => toggleGarment(g)}
                      />
                    ))}
                  </div>
                </div>
              )
            ))}
            {garments.length === 0 && (
              <div className="empty-state">
                <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><IconTshirt size={40} /></div>
                <h3>{t('wardrobeEmpty')}</h3>
                <p>{t('wardrobeEmptyHint')}</p>
              </div>
            )}
            {garments.length > 0 && searchQ && CATEGORIES_ORDER.every(cat => byCategory[cat].length === 0) && (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
                {language === 'en' ? `No garments found for "${builderSearch}"` : `Nessun capo trovato per "${builderSearch}"`}
                <div style={{ marginTop: 10 }}>
                  <button
                    onClick={() => setBuilderSearch('')}
                    style={{
                      background: 'var(--card)', border: '1px solid var(--border)',
                      borderRadius: 8, color: 'var(--text-muted)', fontSize: 12,
                      padding: '6px 14px', cursor: 'pointer',
                    }}
                  >
                    {language === 'en' ? 'Clear search' : 'Cancella ricerca'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: saved outfits */}
        {tab === 'saved' && (
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
            {outfits.length === 0 ? (
              <div className="empty-state">
                <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><IconSparkle size={40} /></div>
                <h3>{t('outfitsEmpty')}</h3>
                <p>{t('outfitsEmptyHint')}</p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 16,
              }}>
                {outfits.map(outfit => (
                  <SavedOutfitCard
                    key={outfit.id}
                    outfit={outfit}
                    getById={getById}
                    onClick={() => setDetailOutfit(outfit)}
                    wearCount={wearCounts[outfit.id] || 0}
                    onWear={async (e) => {
                      e.stopPropagation()
                      try {
                        const res = await wearOutfit(outfit.id)
                        setWearCounts(prev => ({ ...prev, [outfit.id]: res.wear_count }))
                      } catch {}
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: mixer — mobile only, full-width interactive mixer */}
        {isMobile && tab === 'mixer' && (
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 0' }}>
            {selectedGarments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                <div style={{ opacity: 0.2, marginBottom: 12 }}><IconTshirt size={40} /></div>
                <div style={{ fontSize: 13 }}>
                  Seleziona dei capi nella scheda Crea per visualizzarli qui
                </div>
              </div>
            ) : (
              <OutfitMixer
                garments={selectedGarments}
                activeId={mixerActiveId}
                onSetActiveId={setMixerActiveId}
                transformsRef={mixerTransformsRef}
                defaultTransformsRef={defaultTransformsRef}
                isMobileMixer
              />
            )}
          </div>
        )}

        {/* Modale dettaglio outfit */}
        {detailOutfit && (
          <OutfitDetailModal
            outfit={detailOutfit}
            getById={getById}
            onClose={() => setDetailOutfit(null)}
            onLoad={() => {
              const newSel = {}
              for (const id of detailOutfit.garment_ids) {
                const g = getById(id)
                if (g) newSel[g.category] = g.id
              }
              // Ripristina i transform salvati prima di cambiare selezione
              defaultTransformsRef.current = detailOutfit.transforms || {}
              mixerTransformsRef.current = {}
              setSelected(newSel)
              setOutfitName(detailOutfit.name)
              setMixerActiveId(null)
              setDetailOutfit(null)
              setTab('builder')
            }}
            onDelete={() => {
              removeOutfit(detailOutfit.id)
              setDetailOutfit(null)
            }}
          />
        )}

        {/* Stylist AI — barra scorrevole sempre visibile (nascosta sul mixer mobile) */}
        {!(isMobile && tab === 'mixer') && <div data-pagetour="outfit-stylist" style={{ flexShrink: 0 }}>
        <StylistSlider
          currentTab={tab}
          selectedGarments={selectedGarments}
          onApplyOutfit={(ids, name, notes) => {
            // Seleziona i capi nell'editor
            const newSel = {}
            for (const id of (ids || [])) {
              const g = getById(id)
              if (g) newSel[g.category] = g.id
            }
            setSelected(newSel)
            if (name) setOutfitName(name)
            if (notes) setCompleteNotes(notes)
            setTab('builder')
          }}
        />
        </div>}
      </div>

      {/* ── Right: Outfit mixer + controlli (hidden on mobile) ── */}
      {!isMobile && <div data-pagetour="outfit-mixer" style={{
        width: 300, display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', flexShrink: 0, overflow: 'hidden',
      }}>

        {/* Header (fixed) */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            {selectedGarments.length === 0
              ? (language === 'en' ? 'Select garments from the list' : 'Seleziona dei capi dalla lista')
              : t('outfitsGarments', selectedGarments.length)}
          </p>
        </div>

        {/* Mixer visuale (fixed) */}
        <div style={{ flexShrink: 0, padding: '12px 12px 0', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <OutfitMixer
            garments={selectedGarments}
            activeId={mixerActiveId}
            onSetActiveId={setMixerActiveId}
            transformsRef={mixerTransformsRef}
            defaultTransformsRef={defaultTransformsRef}
          />
        </div>

        {/* Lista capi selezionati (scrollable) */}
        {selectedGarments.length > 0 ? (
          <>
          <div style={{ padding: '6px 12px 4px', flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('outfitsSelectedItems')}
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 8px' }}>
            {selectedGarments.map(g => {
              const isActive = mixerActiveId === g.id
              const photo = g.photo_front ? imgUrl(g.photo_front) : null
              return (
                <div
                  key={g.id}
                  onClick={() => setMixerActiveId(isActive ? null : g.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 8, marginBottom: 4,
                    background: isActive ? 'var(--primary-dim)' : 'var(--card)',
                    border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                    cursor: 'pointer', transition: 'var(--transition)',
                  }}
                >
                  {/* Foto miniatura */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 6, flexShrink: 0,
                    background: 'var(--surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                  }}>
                    {photo
                      ? <img src={photo} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 18 }}>{CAT_ICONS[g.category]}</span>
                    }
                  </div>
                  {/* Testo */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 600,
                      color: isActive ? 'var(--primary-light)' : 'var(--text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {g.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
                      {CATEGORY_LABELS[g.category]}{g.brand ? ` · ${g.brand}` : ''}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          </>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        {/* Controlli salvataggio (fixed) */}
        <div style={{ padding: '12px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <input
            className="input"
            placeholder={t('outfitsNamePlaceholder')}
            value={outfitName}
            onChange={e => setOutfitName(e.target.value)}
            style={{ borderColor: !outfitName.trim() && selectedGarments.length > 0 ? 'rgba(168,85,247,0.5)' : undefined }}
            onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-dim)' }}
            onBlur={e => { e.target.style.borderColor = !outfitName.trim() && selectedGarments.length > 0 ? 'rgba(168,85,247,0.5)' : ''; e.target.style.boxShadow = '' }}
          />
          {selectedGarments.length > 0 && !outfitName.trim() && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {t('outfitsNameHint')}
            </div>
          )}
          {completeNotes && (
            <div style={{
              fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
              background: 'rgba(108,63,199,0.08)', border: '1px solid rgba(108,63,199,0.2)',
              borderRadius: 8, padding: '6px 10px',
            }}>
              {completeNotes}
            </div>
          )}

          {/* ── Suggerimenti brand ── */}
          {brandSuggestions.length > 0 && (
            <div style={{
              background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 10, padding: '8px 10px',
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: '#f59e0b',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <IconShoppingBag size={11} /> Completa il look
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {brandSuggestions.map(p => (
                  <a
                    key={p.id}
                    href={p.buy_url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => p.buy_url && trackBrandClick(p.id).catch(() => {})}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      textDecoration: 'none',
                      background: 'var(--card)',
                      borderRadius: 8, padding: '6px 8px',
                      border: '1px solid var(--border)',
                      cursor: p.buy_url ? 'pointer' : 'default',
                      transition: 'background .15s',
                    }}
                  >
                    {/* Immagine prodotto */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 6, flexShrink: 0,
                      background: 'var(--bg)', overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {p.image_url
                        ? <img src={brandImgUrl(p.image_url)} alt={p.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ color: 'var(--text-dim)', opacity: 0.4, display: 'flex' }}><IconShirt size={18} /></span>
                      }
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 600, color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                        {p.brand_name}
                        {p.price ? ` · €${p.price}` : ''}
                      </div>
                    </div>
                    {/* Badge sponsorizzato */}
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: '#f59e0b',
                      background: 'rgba(245,158,11,0.12)',
                      padding: '2px 5px', borderRadius: 4, flexShrink: 0,
                    }}>AD</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {saveMsg && (
            <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 500 }}>{saveMsg}</div>
          )}

          {/* Deseleziona tutto + Salva — affiancati */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { setSelected({}); setMixerActiveId(null) }}
              disabled={selectedGarments.length === 0}
              className="btn btn-ghost"
              style={{ flex: 1, justifyContent: 'center', fontSize: 12, padding: '8px 6px' }}
              onFocus={e => { e.currentTarget.style.outline = '2px solid var(--primary)'; e.currentTarget.style.outlineOffset = '2px'; e.currentTarget.style.boxShadow = '0 0 0 4px var(--primary-dim)' }}
              onBlur={e => { e.currentTarget.style.outline = ''; e.currentTarget.style.outlineOffset = ''; e.currentTarget.style.boxShadow = '' }}
            >
              {t('outfitsResetCta')}
            </button>
            <button
              onClick={handleSave}
              disabled={selectedGarments.length === 0 || !outfitName.trim()}
              className="btn btn-primary"
              style={{ flex: 1, justifyContent: 'center', fontSize: 12, opacity: !outfitName.trim() ? 0.4 : 1, padding: '8px 6px' }}
            >
              {t('outfitsSaveCta')}
            </button>
          </div>
        </div>
      </div>}

      {/* ── Mobile: compact save bar at bottom ───────────────────────────── */}
      {isMobile && (
        <div style={{
          position: 'fixed', bottom: 'calc(58px + env(safe-area-inset-bottom, 0px))', left: 0, right: 0,
          borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
          padding: '10px 14px',
          display: 'flex', gap: 8, alignItems: 'center',
          zIndex: 10,
        }}>
          <input
            className="input"
            placeholder={t('outfitsNamePlaceholder')}
            value={outfitName}
            onChange={e => setOutfitName(e.target.value)}
            style={{ flex: 1, fontSize: 13 }}
          />
          <button
            onClick={() => { setSelected({}); setMixerActiveId(null) }}
            disabled={selectedGarments.length === 0}
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '8px 10px', flexShrink: 0 }}
          >
            {t('outfitsResetCta')}
          </button>
          <button
            onClick={handleSave}
            disabled={selectedGarments.length === 0 || !outfitName.trim()}
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '8px 14px', flexShrink: 0 }}
          >
            {t('outfitsSaveCta')}
          </button>
        </div>
      )}
    </div>
  )
}

// ── MiniMixer ─────────────────────────────────────────────────────────────────
/** Versione statica (senza drag/zoom) del mixer, usata nelle card outfit salvati */
function MiniMixer({ garments, transforms = {} }) {
  const t = useT()
  const catLabels = useCategoryLabels()
  const hasGiacchetto = garments.some(g => g.category === 'giacchetto')
  const hasFelpa      = garments.some(g => g.category === 'felpa')
  const hasMaglietta  = garments.some(g => g.category === 'maglietta')

  const [hiddenLayers, setHiddenLayers] = useState(new Set())

  const isVisible = (cat) => {
    if (hiddenLayers.has(cat)) return false
    if (cat === 'maglietta') {
      if (hasFelpa      && !hiddenLayers.has('felpa'))      return false
      if (hasGiacchetto && !hiddenLayers.has('giacchetto')) return false
    }
    if (cat === 'felpa') {
      if (hasGiacchetto && !hiddenLayers.has('giacchetto')) return false
    }
    return true
  }

  const toggleLayer = (cat) =>
    setHiddenLayers(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })

  const layerControls = [
    hasGiacchetto                               && { cat: 'giacchetto', label: catLabels.giacchetto },
    hasFelpa && (hasMaglietta || hasGiacchetto) && { cat: 'felpa',      label: catLabels.felpa },
  ].filter(Boolean)

  const SCALE = 0.53  // canvas mini rispetto al full mixer (380 → ~200px)

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        position: 'relative', width: '100%', height: 200,
        background: 'radial-gradient(ellipse at 50% 30%, var(--card) 0%, var(--bg) 70%)',
        borderRadius: 10, border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, var(--mixer-dot) 1px, transparent 1px)',
          backgroundSize: '20px 20px', pointerEvents: 'none',
        }} />

        {CATEGORIES_ORDER
          .filter(cat => garments.some(g => g.category === cat) && isVisible(cat))
          .map(cat => {
            const g      = garments.find(g => g.category === cat)
            const layout = MIXER_LAYOUT[cat]
            const photo  = g.photo_front ? imgUrl(g.photo_front) : null
            return (
              <div key={cat} style={{
                position: 'absolute', left: '50%', top: layout.top,
                transform: (() => {
                  const t = transforms[g.id] || {}
                  const dx = (t.dx || 0) * SCALE
                  const dy = (t.dy || 0) * SCALE
                  const sc = t.scale || 1
                  const ro = t.rotate || 0
                  return `translateX(calc(-50% + ${dx}px)) translateY(${dy}px) scale(${sc}) rotate(${ro}deg)`
                })(),
                height: layout.height * SCALE,
                zIndex: layout.zIndex,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {photo ? (
                  <img
                    src={photo} alt={g.name} draggable={false}
                    style={{
                      height: '100%', maxWidth: 120, objectFit: 'contain',
                      opacity: g.bg_status === 'done' ? 1 : 0.82,
                      filter: g.bg_status !== 'done' ? 'drop-shadow(0 0 4px rgba(0,0,0,0.5))' : 'none',
                    }}
                  />
                ) : (
                  <div style={{ fontSize: layout.height * SCALE * 0.35, opacity: 0.2 }}>
                    {CAT_ICONS[cat]}
                  </div>
                )}
              </div>
            )
          })}
      </div>

      {layerControls.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
          {layerControls.map(({ cat, label }) => {
            const hidden = hiddenLayers.has(cat)
            return (
              <button
                key={cat}
                onClick={() => toggleLayer(cat)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  padding: '2px 8px', fontSize: 10, borderRadius: 20,
                  border: `1px solid ${hidden ? 'var(--border)' : 'var(--primary)'}`,
                  background: hidden ? 'transparent' : 'var(--primary-dim)',
                  color: hidden ? 'var(--text-dim)' : 'var(--primary-light)',
                  cursor: 'pointer', fontWeight: 500,
                  opacity: hidden ? 0.55 : 1,
                }}
              >
                {CAT_ICONS[cat]}
                {hidden ? t('outfitsShowLayer', label) : t('outfitsHideLayer', label)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── SavedOutfitCard ───────────────────────────────────────────────────────────
function SavedOutfitCard({ outfit, getById, onClick, wearCount = 0, onWear }) {
  const [hovered, setHovered] = useState(false)
  const [wornAnim, setWornAnim] = useState(false)
  const garments = (outfit.garment_ids || []).map(id => getById(id)).filter(Boolean)
  const t = useT()
  const language = useSettingsStore(s => s.language) || 'it'
  const preview  = garments.slice(0, 4)
  const cols     = preview.length <= 1 ? 1 : 2
  const rows     = preview.length <= 2 ? 1 : 2

  const handleWear = async (e) => {
    await onWear?.(e)
    setWornAnim(true)
    setTimeout(() => setWornAnim(false), 1500)
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="fade-in"
      style={{
        background: hovered ? 'var(--card-hover)' : 'var(--card)',
        border: `1px solid ${hovered ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease, background 0.18s ease',
        boxShadow: hovered ? '0 0 0 3px var(--primary-dim), var(--shadow)' : 'none',
      }}
    >
      {/* Griglia anteprima foto */}
      <div style={{
        height: 180,
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        background: 'var(--photo-bg)',
        gap: 1, overflow: 'hidden',
      }}>
        {preview.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.2, color: 'var(--text-dim)' }}>
            <IconTshirt size={48} />
          </div>
        ) : preview.map(g => {
          const photo = g.photo_front ? imgUrl(g.photo_front) : null
          return (
            <div key={g.id} style={{
              background: 'var(--photo-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {photo
                ? <img src={photo} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 800, opacity: 0.35 }}>{CAT_ICONS[g.category]}</span>
              }
            </div>
          )
        })}
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text)',
          marginBottom: 6,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {outfit.name}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {outfit.ai_generated ? <span className="tag tag-purple">{t('outfitsAiLabel')}</span> : null}
          {outfit.occasion && <span className="tag tag-purple">{outfit.occasion}</span>}
          {outfit.season   && <span className="tag tag-green">{outfit.season}</span>}
          <span className="tag tag-amber" style={{ marginLeft: 'auto' }}>{t('outfitsGarments', garments.length)}</span>
        </div>

        {/* Bottone Indossa oggi + contatore */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <button
            onClick={handleWear}
            style={{
              flex: 1, fontSize: 11, fontWeight: 600, padding: '5px 0',
              borderRadius: 8, cursor: 'pointer', border: 'none',
              background: wornAnim ? 'rgba(16,185,129,0.2)' : 'rgba(108,63,199,0.15)',
              color: wornAnim ? '#10b981' : 'var(--primary-light)',
              transition: 'all .25s',
            }}
          >
            {wornAnim ? <IconCheck size={12} /> : <IconTshirt size={12} />}
            {' '}{wornAnim
              ? (language === 'en' ? 'Logged!' : 'Registrato!')
              : (language === 'en' ? 'Wore today' : 'Indossato oggi')}
          </button>
          {wearCount > 0 && (
            <span style={{
              fontSize: 10, color: 'var(--text-dim)', flexShrink: 0,
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '3px 7px',
            }}>
              {wearCount}×
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── OutfitDetailModal ─────────────────────────────────────────────────────────
function OutfitDetailModal({ outfit, getById, onClose, onLoad, onDelete }) {
  const garments = (outfit.garment_ids || []).map(id => getById(id)).filter(Boolean)
  const t = useT()
  const CATEGORY_LABELS = useCategoryLabels()

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="fade-in"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          width: '100%', maxWidth: 460,
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{outfit.name}</h2>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {outfit.ai_generated ? <span className="tag tag-purple">{t('outfitsAiLabel')}</span> : null}
              {outfit.occasion && <span className="tag tag-purple">{outfit.occasion}</span>}
              {outfit.season   && <span className="tag tag-green">{outfit.season}</span>}
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 14, flexShrink: 0 }}>✕</button>
        </div>

        {/* Body scrollabile */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {/* MiniMixer */}
          {garments.length > 0 && <MiniMixer garments={garments} transforms={outfit.transforms || {}} />}

          {/* Note AI */}
          {outfit.notes && (
            <div style={{
              fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6,
              background: 'rgba(108,63,199,0.07)', border: '1px solid rgba(108,63,199,0.18)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 16,
            }}>
              {outfit.notes}
            </div>
          )}

          {/* Lista capi */}
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            {t('outfitsGarments', garments.length)}
          </div>
          {garments.map(g => {
            const photo = g.photo_front ? imgUrl(g.photo_front) : null
            return (
              <div key={g.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 0', borderBottom: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 8, flexShrink: 0,
                  background: 'var(--card)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  {photo
                    ? <img src={photo} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 800, opacity: 0.5 }}>{CAT_ICONS[g.category]}</span>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {g.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
                    {CATEGORY_LABELS[g.category]}{g.brand ? ` · ${g.brand}` : ''}{g.size ? ` · ${g.size}` : ''}
                  </div>
                </div>
                {g.color_hex && (
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: g.color_hex, flexShrink: 0, border: '1px solid rgba(255,255,255,0.15)' }} />
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, flexShrink: 0,
        }}>
          <button onClick={onDelete} className="btn btn-danger" style={{ fontSize: 13, padding: '8px 14px' }}>
            {t('outfitsDeleteBtn')}
          </button>
          <button onClick={onLoad} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}>
            {t('outfitsOpenEditor')}
          </button>
        </div>
      </div>
    </div>
  )
}
