import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import GarmentCard from '../components/GarmentCard'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import PageTutorial from '../components/PageTutorial'
import { useToast } from '../components/Toast'

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
const OUTFIT_DISPLAY_ORDER = ['cappello', 'giacchetto', 'felpa', 'maglietta', 'pantaloni', 'scarpe', 'occhiali', 'cintura', 'borsa', 'orologio', 'altro']
const sortByOutfitOrder = (arr) => [...arr].sort((a, b) => {
  const ai = OUTFIT_DISPLAY_ORDER.indexOf(a.category)
  const bi = OUTFIT_DISPLAY_ORDER.indexOf(b.category)
  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
})

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
            {isMobileMixer ? t('outfitsMixerMobileTip') : t('outfitsCanvasTip')}
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

// ── StylistWizard — mobile questionnaire flow (replace chat with structured Q&A) ──
function StylistWizard({ selectedGarments, weather, onApplyOutfit }) {
  // weather is the full object from useWeather (temp, feels, humidity, wind, code, label, hourly)
  const garments = useWardrobeStore(s => s.garments)
  const outfits  = useWardrobeStore(s => s.outfits)
  const language = useSettingsStore(s => s.language) || 'it'
  const shownIdsRef = useRef([])
  const [quota, setQuota] = useState(null) // null=loading, -1=unlimited, number=remaining

  useEffect(() => {
    fetchChatQuota().then(q => {
      setQuota(q.plan === 'premium' ? -1 : (q.remaining_day ?? q.remaining ?? null))
    }).catch(() => {})
  }, [])

  const MIN_GARMENTS = 12
  const MIN_OUTFITS  = 3

  const Q = language === 'en' ? [
    { id: 'work',    label: 'Work',    emoji: '🏢',
      sub: 'What environment?',     subs: ['Formal (meetings/clients)', 'Smart casual (creative office)', 'Business casual', 'Working from home'],
      style: 'What style?',         styles: ['Classic and polished', 'Modern and refined', 'Creative and personal'] },
    { id: 'casual',  label: 'Casual',  emoji: '👟',
      sub: 'Where are you going?',  subs: ['City (shopping, café)', 'At a friend\'s', 'Weekend getaway', 'Relaxed day in'],
      style: 'What\'s your vibe?',  styles: ['Minimal / clean', 'Streetwear / urban', 'Preppy / classic'] },
    { id: 'evening', label: 'Evening', emoji: '🌙',
      sub: 'What kind of evening?', subs: ['Romantic dinner', 'Night out with friends', 'Event / cocktail party', 'Concert / theatre'],
      style: 'How dressed up?',     styles: ['Elegant (formal)', 'Smart casual chic', 'Cool but relaxed'] },
    { id: 'sport',   label: 'Sport',   emoji: '🏃',
      sub: 'What activity?',        subs: ['Gym / CrossFit', 'Running / outdoor', 'Yoga / pilates', 'Team sport'],
      style: 'Your priority?',      styles: ['Performance (technical)', 'Athleisure (street-sport)', 'Comfort above all'] },
    { id: 'travel',  label: 'Travel',  emoji: '✈️',
      sub: 'What climate?',         subs: ['Hot (beach / tropical)', 'Mild / spring', 'Cold / autumn', 'Freezing / mountain'],
      style: 'Travel style?',       styles: ['Comfortable and practical', 'Smart and versatile', 'Adventurous / outdoor'] },
  ] : [
    { id: 'lavoro',  label: 'Lavoro',  emoji: '🏢',
      sub: 'Che ambiente?',         subs: ['Formale (riunioni/clienti)', 'Smart casual (ufficio creativo)', 'Business casual', 'Da casa / smart working'],
      style: 'Che impronta stilistica?', styles: ['Classico e sobrio', 'Moderno e curato', 'Creativo e personale'] },
    { id: 'casual',  label: 'Casual',  emoji: '👟',
      sub: 'Dove andrai?',          subs: ['In città (shopping, caffè)', 'A casa di amici', 'Weekend fuori porta', 'Giornata relax a casa'],
      style: 'Che stile ti piace?', styles: ['Minimal / clean', 'Streetwear / urban', 'Preppy / classico'] },
    { id: 'serata',  label: 'Serata',  emoji: '🌙',
      sub: 'Che tipo di serata?',   subs: ['Cena romantica', 'Uscita con amici (locale/aperitivo)', 'Evento / cocktail party', 'Teatro / concerto'],
      style: 'Quanto vuoi essere curato?', styles: ['Elegante (formale)', 'Smart casual chic', 'Cool ma rilassato'] },
    { id: 'sport',   label: 'Sport',   emoji: '🏃',
      sub: 'Che attività?',         subs: ['Palestra / CrossFit', 'Running / outdoor', 'Yoga / pilates', 'Sport di squadra'],
      style: 'Che priorità hai?',   styles: ['Performance (tecnico)', 'Athleisure (street-sport)', 'Comodo sopra tutto'] },
    { id: 'viaggio', label: 'Viaggio', emoji: '✈️',
      sub: 'Che clima prevedi?',    subs: ['Caldo (spiaggia / tropicale)', 'Mite / primaverile', 'Freddo / autunnale', 'Freddo intenso / montagna'],
      style: 'Stile di viaggio?',   styles: ['Comodo e pratico', 'Smart e versatile', 'Avventuroso / outdoor'] },
  ]

  const [step,          setStep]          = useState(0) // 0=occasion 1=sub 2=style 3=loading 4=results
  const [occasion,      setOccasion]      = useState(null)
  const [selectedSub,   setSelectedSub]   = useState(null)
  const [streamText,    setStreamText]    = useState('')
  const [resultText,    setResultText]    = useState('')
  const [resultOutfits, setResultOutfits] = useState([])
  const [resultError,   setResultError]   = useState(null)

  const hasSelection = selectedGarments.length > 0
  const occ = Q.find(o => o.id === occasion)
  const getById = id => garments.find(g => g.id === id)

  // Build rich weather context from full weather object
  const buildWeatherNote = (occ_id) => {
    if (!weather) return ''
    // For travel, the local weather is irrelevant — user is going somewhere else
    if (occ_id === 'travel' || occ_id === 'viaggio') return ''
    const hourlyStr = weather.hourly?.length
      ? weather.hourly.map(h => `${h.hour}h${h.icon}${h.temp}°C(${h.precip}%)`).join(' ')
      : ''
    if (language === 'en') {
      return ` Current weather: ${weather.temp}°C, feels like ${weather.feels}°C, ${weather.label}, humidity ${weather.humidity}%, wind ${weather.wind} km/h.${hourlyStr ? ` Next 5 hours: ${hourlyStr}.` : ''} Choose garments that work perfectly for these real conditions.`
    }
    return ` Meteo attuale: ${weather.temp}°C, percepita ${weather.feels}°C, ${weather.label}, umidità ${weather.humidity}%, vento ${weather.wind} km/h.${hourlyStr ? ` Prossime 5 ore: ${hourlyStr}.` : ''} Scegli capi adatti a queste condizioni reali.`
  }

  const generate = async (occLabel, subLabel, styleLabel) => {
    setStep(3); setStreamText(''); setResultText(''); setResultOutfits([]); setResultError(null)

    const gDesc = hasSelection ? selectedGarments.map(g => g.name).join(', ') : null
    const shownNote = shownIdsRef.current.length
      ? (language === 'en'
          ? ` Exclude garment-IDs already shown: [${shownIdsRef.current.join(', ')}].`
          : ` Escludi le combinazioni con ID già proposti: [${shownIdsRef.current.join(', ')}].`)
      : ''
    const weatherNote = buildWeatherNote(occasion)

    const prompt = language === 'en'
      ? gDesc
        ? `Selected garments: ${gDesc}. Occasion: ${occLabel} – ${subLabel}. Style: ${styleLabel}.${weatherNote}${shownNote} Give EXACTLY 3 outfit options using my selected garments plus complementary items from my wardrobe, then 1 "substitute" variant replacing one garment with a better alternative from my wardrobe. Each needs an <OUTFIT>{"ids":[...],"name":"...","notes":"..."}</OUTFIT> block.`
        : `Occasion: ${occLabel} – ${subLabel}. Style: ${styleLabel}.${weatherNote}${shownNote} Browse my entire wardrobe and give EXACTLY 3 complete outfits that match perfectly, then 1 "substitute" variant. Each needs an <OUTFIT>{"ids":[...],"name":"...","notes":"..."}</OUTFIT> block.`
      : gDesc
        ? `Capi selezionati: ${gDesc}. Occasione: ${occLabel} – ${subLabel}. Stile: ${styleLabel}.${weatherNote}${shownNote} Proponi ESATTAMENTE 3 outfit con i capi selezionati più elementi complementari dal mio armadio, poi 1 variante "sostitutiva" scambiando un capo con un'alternativa migliore dal mio armadio. Ognuno deve avere <OUTFIT>{"ids":[...],"name":"...","notes":"..."}</OUTFIT>.`
        : `Occasione: ${occLabel} – ${subLabel}. Stile: ${styleLabel}.${weatherNote}${shownNote} Sfoglia l'intero armadio e proponi ESATTAMENTE 3 outfit completi e perfetti, poi 1 variante "sostitutiva". Ognuno deve avere <OUTFIT>{"ids":[...],"name":"...","notes":"..."}</OUTFIT>.`

    let acc = ''
    await chatWithStylistStream({
      message: prompt, history: [], language, weather: weather?.summary ?? null, occasion: occLabel,
      onToken: tok => { acc += tok; setStreamText(acc) },
      onDone: () => {
        const matches = [...acc.matchAll(/<OUTFIT>([\s\S]*?)<\/OUTFIT>/g)]
        const outfits = matches.flatMap(m => { try { return [JSON.parse(m[1])] } catch { return [] } })
        outfits.forEach(o => { if (o.ids) shownIdsRef.current = [...new Set([...shownIdsRef.current, ...o.ids])] })
        setResultText(acc.replace(/<OUTFIT>[\s\S]*?<\/OUTFIT>/g, '').replace(/<BRAND_PRODUCTS>[\s\S]*?<\/BRAND_PRODUCTS>/g, '').trim())
        setResultOutfits(outfits)
        setStep(4)
        fetchChatQuota().then(q => {
          setQuota(q.plan === 'premium' ? -1 : (q.remaining_day ?? q.remaining ?? null))
        }).catch(() => {})
      },
      onError: err => { setResultError(err); setStep(4) },
    })
  }

  const reset = () => { setStep(0); setOccasion(null); setSelectedSub(null) }

  const cardBtn = {
    border: 'none', background: 'transparent', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  }

  /* ── Blocker: not enough data yet ── */
  if (garments.length < MIN_GARMENTS || outfits.length < MIN_OUTFITS) {
    const needGarments = Math.max(0, MIN_GARMENTS - garments.length)
    const needOutfits  = Math.max(0, MIN_OUTFITS  - outfits.length)
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', lineHeight: 1.3 }}>
          {language === 'en' ? 'Almost there!' : 'Ci siamo quasi!'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.65, maxWidth: 280 }}>
          {language === 'en'
            ? 'To get accurate stylist recommendations, add a bit more to your wardrobe first.'
            : 'Per ricevere consigli precisi dalla stylist, aggiungi ancora qualcosa al tuo armadio.'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280 }}>
          {needGarments > 0 && (
            <div style={{ padding: '12px 16px', borderRadius: 14, border: '1.5px solid var(--border)', background: 'var(--card)', textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                {language === 'en' ? `${garments.length} / ${MIN_GARMENTS} garments` : `${garments.length} / ${MIN_GARMENTS} capi`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                {language === 'en'
                  ? `Upload ${needGarments} more to unlock`
                  : `Carica ancora ${needGarments} capo/i per sbloccare`}
              </div>
            </div>
          )}
          {needOutfits > 0 && (
            <div style={{ padding: '12px 16px', borderRadius: 14, border: '1.5px solid var(--border)', background: 'var(--card)', textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                {language === 'en' ? `${outfits.length} / ${MIN_OUTFITS} saved outfits` : `${outfits.length} / ${MIN_OUTFITS} outfit salvati`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                {language === 'en'
                  ? `Save ${needOutfits} more outfit${needOutfits !== 1 ? 's' : ''} in the Create tab`
                  : `Salva ancora ${needOutfits} outfit nella scheda Crea`}
              </div>
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
          {language === 'en'
            ? 'The stylist needs enough data to know your style.'
            : 'La stylist ha bisogno di dati sufficienti per conoscerti.'}
        </div>
      </div>
    )
  }

  /* ── Step 0: Occasion ── */
  if (step === 0) return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
      {hasSelection && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, background: 'var(--primary-dim)', border: '1px solid var(--primary-border)', fontSize: 13, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconSparkle size={14} />
          {language === 'en' ? `${selectedGarments.length} garment${selectedGarments.length !== 1 ? 's' : ''} selected` : `${selectedGarments.length} capo/i selezionati`}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
          {language === 'en' ? 'What\'s the occasion?' : 'Per quale occasione?'}
        </div>
        {quota !== null && quota !== -1 && quota < 999 && (
          <span style={{ fontSize: 11, fontWeight: 600, color: quota === 0 ? 'var(--danger)' : 'var(--text-dim)', background: quota === 0 ? 'rgba(239,68,68,0.1)' : 'var(--card)', border: `1px solid ${quota === 0 ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`, borderRadius: 10, padding: '2px 8px', flexShrink: 0 }}>
            {language === 'en' ? `${quota} left today` : `${quota} rimaste oggi`}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
        {language === 'en' ? 'I\'ll find the perfect outfit for you.' : 'Troverò l\'outfit perfetto per te.'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {Q.map(o => (
          <button key={o.id} onClick={() => { setOccasion(o.id); setStep(1) }}
            style={{ ...cardBtn, padding: '20px 12px', borderRadius: 16, border: '1.5px solid var(--border)', background: 'var(--card)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 28 }}>{o.emoji}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  )

  /* ── Step 1: Sub-question ── */
  if (step === 1 && occ) return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
      <button onClick={() => setStep(0)}
        style={{ ...cardBtn, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dim)', fontSize: 13, marginBottom: 16 }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        {occ.emoji} {occ.label}
      </button>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>{occ.sub}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {occ.subs.map(s => (
          <button key={s} onClick={() => { setSelectedSub(s); setStep(2) }}
            style={{ ...cardBtn, padding: '14px 18px', borderRadius: 14, border: '1.5px solid var(--border)', background: 'var(--card)', textAlign: 'left', fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
            {s}
          </button>
        ))}
      </div>
    </div>
  )

  /* ── Step 2: Style / vibe ── */
  if (step === 2 && occ) return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
      <button onClick={() => setStep(1)}
        style={{ ...cardBtn, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dim)', fontSize: 13, marginBottom: 16 }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        {selectedSub}
      </button>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>{occ.style}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {occ.styles.map(s => (
          <button key={s} onClick={() => generate(occ.label, selectedSub, s)}
            style={{ ...cardBtn, padding: '14px 18px', borderRadius: 14, border: '1.5px solid var(--border)', background: 'var(--card)', textAlign: 'left', fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
            {s}
          </button>
        ))}
      </div>
    </div>
  )

  /* ── Step 3: Loading ── */
  if (step === 3) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 20 }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), #c084fc)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px var(--primary-shadow)' }}>
        <div className="spinner" style={{ width: 30, height: 30, borderWidth: 3, borderColor: 'rgba(255,255,255,0.25)', borderTopColor: '#fff' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
          {language === 'en' ? 'Crafting your outfits…' : 'Creo i tuoi outfit…'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
          {language === 'en' ? 'AI is browsing your wardrobe' : 'L\'AI sta sfogliando il tuo armadio'}
        </div>
      </div>
    </div>
  )

  /* ── Step 4: Results ── */
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          {language === 'en' ? 'Your outfits' : 'I tuoi outfit'}
        </div>
        <button onClick={reset}
          style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-light)', background: 'var(--primary-dim)', border: '1px solid var(--primary-border)', borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}>
          {language === 'en' ? 'New search' : 'Nuova ricerca'}
        </button>
      </div>
      {resultError && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 13, marginBottom: 12 }}>
          ⚠ {resultError}
        </div>
      )}
      {resultText && !resultOutfits.length && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65, padding: '12px 14px', background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <MarkdownText text={resultText} />
        </div>
      )}
      {resultOutfits.map((outfit, i) => {
        const isSubstitute = i === resultOutfits.length - 1 && resultOutfits.length > 1
        const og = (outfit.ids || []).map(id => getById(id)).filter(Boolean)
        return (
          <div key={i} style={{ marginBottom: 14, borderRadius: 16, border: `1.5px solid ${isSubstitute ? 'var(--primary-border)' : 'var(--border)'}`, background: isSubstitute ? 'var(--primary-dim)' : 'var(--card)', overflow: 'hidden' }}>
            {isSubstitute && (
              <div style={{ padding: '7px 14px', borderBottom: '1px solid var(--primary-border)', fontSize: 11, fontWeight: 700, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <IconSparkle size={12} /> {language === 'en' ? 'Substitute suggestion' : 'Variante sostitutiva'}
              </div>
            )}
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>{outfit.name || `Outfit ${i + 1}`}</div>
              {og.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {og.map(g => (
                    <div key={g.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                        {g.photo_front
                          ? <img src={imgUrl(g.photo_front)} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}><IconTshirt size={20} /></div>
                        }
                      </div>
                      <span style={{ fontSize: 9, color: 'var(--text-dim)', maxWidth: 52, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {outfit.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>{outfit.notes}</div>}
              {onApplyOutfit && outfit.ids?.length > 0 && (
                <button onClick={() => onApplyOutfit(outfit.ids, outfit.name, outfit.notes)}
                  style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--primary), #7c3aed)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {language === 'en' ? 'Apply outfit' : 'Applica outfit'} →
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * @param {object}   props
 * @param {Array}    props.selectedGarments  — capi selezionati nell'editor
 * @param {boolean}  props.compact           — nasconde l'header (usato in StylistSlider)
 * @param {function} props.onApplyOutfit     — (ids, name, notes) => void
 * @param {number}   props.remainingQuota    — richieste rimanenti (da StylistSlider)
 * @param {function} props.onQuotaUpdate     — (remaining) => void
 */
function StylistChat({ selectedGarments, compact = false, onApplyOutfit, remainingQuota, onQuotaUpdate, weather = null, occasion = null, onInputFocus, onInputBlur }) {
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
  // Quota standalone: caricata qui quando StylistChat è usato come pagina intera
  const [standaloneQuota, setStandaloneQuota] = useState(remainingQuota)
  useEffect(() => {
    if (remainingQuota == null) {
      fetchChatQuota().then(q => {
        const r = q.plan === 'premium' ? -1 : (q.remaining_day ?? q.remaining ?? null)
        setStandaloneQuota(r)
      }).catch(() => {})
    }
  }, []) // eslint-disable-line
  const effectiveQuota = remainingQuota ?? standaloneQuota
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

  const canSend = effectiveQuota == null || effectiveQuota !== 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

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

      {/* Suggerimenti rapidi (solo prima risposta, nascosti quando si digita) */}
      {messages.length <= 1 && !input && (
        <div style={{ padding: '0 12px 6px', display: 'flex', gap: 5, flexWrap: 'wrap', flexShrink: 0 }}>
          {(SUGGESTIONS[language] || SUGGESTIONS.it).filter(s => selectedGarments.length > 0 || (!s.includes('selezionati') && !s.includes('selected items'))).map(s => (
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
      {effectiveQuota === 0 && (
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
        display: 'flex', gap: 7, flexShrink: 0, alignItems: 'flex-end',
      }}>
        {/* Quota counter */}
        {effectiveQuota != null && effectiveQuota !== -1 && effectiveQuota < 999 && (
          <span style={{
            fontSize: 10, fontWeight: 600, flexShrink: 0, paddingBottom: 9,
            color: effectiveQuota === 0 ? '#f59e0b' : 'var(--text-dim)',
          }}>
            {language === 'en' ? `${effectiveQuota} left` : `${effectiveQuota} rimaste`}
          </span>
        )}
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
          onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-dim)'; onInputFocus?.() }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; onInputBlur?.() }}
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
function WeatherBadge({ weather, language, chatOpen, onOpenChat }) {
  const [hovered,  setHovered]  = useState(false)
  const [tapped,   setTapped]   = useState(false)
  const [badgePos, setBadgePos] = useState(null)
  const badgeDivRef = useRef(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!chatOpen) setTapped(false)
  }, [chatOpen])

  const showTooltip = isMobile ? tapped : hovered

  // Su mobile calcola la posizione del badge per il tooltip portato al body
  useEffect(() => {
    if (isMobile && tapped && badgeDivRef.current) {
      const r = badgeDivRef.current.getBoundingClientRect()
      setBadgePos({ top: r.bottom + 8, right: window.innerWidth - r.right })
    } else if (!tapped) {
      setBadgePos(null)
    }
  }, [isMobile, tapped])

  const feelsLabel = language === 'en' ? 'feels' : 'percepita'
  const humLabel   = language === 'en' ? 'hum.'  : 'umid.'
  const windLabel  = language === 'en' ? 'wind'  : 'vento'
  const forecastTitle = language === 'en' ? 'Today\'s forecast' : 'Previsioni di oggi'

  const tooltipBody = (pos, isFixed) => (
    <div style={{
      position: isFixed ? 'fixed' : 'absolute',
      ...(isFixed && pos
        ? { top: pos.top, right: pos.right }
        : { bottom: 'calc(100% + 8px)', right: 0 }),
      width: 230,
      zIndex: isFixed ? 1500 : 999,
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '12px 14px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
      pointerEvents: isFixed ? 'auto' : 'none',
    }}>
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
      {weather.hourly?.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            {forecastTitle}
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
            {weather.hourly.map(h => (
              <div key={h.hour} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{String(h.hour).padStart(2, '0')}:00</span>
                <span style={{ fontSize: 16 }}>{h.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{h.temp}°</span>
                {h.precip > 0 && <span style={{ fontSize: 9, color: '#60a5fa' }}>{h.precip}%</span>}
              </div>
            ))}
          </div>
        </>
      )}
      {/* Freccia verso il badge */}
      {isFixed ? (
        <div style={{ position: 'absolute', top: -6, right: 14, width: 10, height: 10, background: 'var(--card)', border: '1px solid var(--border)', borderBottom: 'none', borderRight: 'none', transform: 'rotate(45deg)' }} />
      ) : (
        <div style={{ position: 'absolute', bottom: -6, right: 14, width: 10, height: 10, background: 'var(--card)', border: '1px solid var(--border)', borderTop: 'none', borderLeft: 'none', transform: 'rotate(45deg)' }} />
      )}
    </div>
  )

  return (
    <>
    {/* Backdrop mobile portato al body per superare la gerarchia di stacking context */}
    {isMobile && tapped && createPortal(
      <div onClick={() => setTapped(false)} style={{ position: 'fixed', inset: 0, zIndex: 1498 }} />,
      document.body
    )}
    <div
      ref={badgeDivRef}
      style={{ position: 'relative', flexShrink: 0 }}
      onMouseEnter={() => !isMobile && setHovered(true)}
      onMouseLeave={() => !isMobile && setHovered(false)}
      onClick={e => {
        e.stopPropagation()
        if (isMobile) {
          if (!chatOpen && onOpenChat) onOpenChat()
          setTapped(t => !t)
        }
      }}
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

      {/* Tooltip desktop (position absolute, rimane nel normal flow) */}
      {!isMobile && showTooltip && tooltipBody(null, false)}
    </div>

    {/* Tooltip mobile portato al body con position fixed — supera z-index del chat overlay */}
    {isMobile && showTooltip && badgePos && createPortal(tooltipBody(badgePos, true), document.body)}
    </>
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
  const [inputFocused,  setInputFocused]  = useState(false)
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

  // Apre automaticamente quando viene selezionato il primo capo
  useEffect(() => {
    const count = selectedGarments.length
    if (prevCountRef.current === 0 && count > 0) {
      setIsOpen(true)
    }
    prevCountRef.current = count
  }, [selectedGarments.length]) // eslint-disable-line

  // Pulsa finché ci sono capi selezionati e il pannello è chiuso
  const pulsing = selectedGarments.length > 0 && !isOpen

  const quotaLabel = remaining === null ? null
    : remaining === -1 || remaining >= 999 ? null  // illimitato: non mostrare
    : remaining === 0 ? (language === 'en' ? '0 left today' : '0 rimaste oggi')
    : (language === 'en' ? `${remaining} left today` : `${remaining} rimaste oggi`)

  const hint = selectedGarments.length > 0
    ? (language === 'en'
        ? `${selectedGarments.length} item${selectedGarments.length !== 1 ? 's' : ''} selected — tap for advice`
        : `${selectedGarments.length} capo/i selezionati — tocca per consigli`)
    : (language === 'en' ? 'Ask your AI stylist…' : 'Chiedi allo Stylist AI…')

  // Su mobile: quando l'input è focused (tastiera aperta) convertiamo il pannello
  // in position:fixed. Gli elementi fixed su iOS tracciano il visual viewport, quindi
  // salgono sopra la tastiera — l'input rimane sempre visibile.
  const fixedMode = isMobile && isOpen && inputFocused

  return (
    <div style={{
      ...(fixedMode ? {
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 600,
        borderTop: '1px solid var(--border)',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
      } : { flexShrink: 0 }),
      background: 'var(--surface)',
    }}>

      {/* Barra handle cliccabile */}
      <div
        onClick={() => { setIsOpen(o => !o); if (inputFocused) setInputFocused(false) }}
        style={{
          height: 52, display: 'flex', alignItems: 'center', gap: 10,
          padding: '0 14px', cursor: 'pointer', userSelect: 'none',
          background: isOpen
            ? 'linear-gradient(135deg, rgba(108,63,199,0.1), rgba(192,132,252,0.05))'
            : 'var(--surface)',
          transition: 'background 0.25s',
          animation: pulsing ? 'stylistPulse 1.2s ease-in-out infinite' : 'none',
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
          ? <WeatherBadge weather={weather} language={language} chatOpen={isOpen} onOpenChat={() => setIsOpen(true)} />
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
        maxHeight: isOpen ? (fixedMode ? '65dvh' : `${chatHeight}px`) : '0px',
        overflow: 'hidden',
        transition: fixedMode ? 'none' : 'max-height 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <div style={{ height: fixedMode ? '65dvh' : chatHeight, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <StylistChat
            selectedGarments={selectedGarments}
            compact
            onApplyOutfit={onApplyOutfit}
            remainingQuota={remaining}
            onQuotaUpdate={(r, rw) => { setRemaining(r); if (rw != null) setRemainingWeek(rw) }}
            weather={weather?.summary ?? null}
            occasion={stylePrefs}
            onInputFocus={() => setInputFocused(true)}
            onInputBlur={() => setTimeout(() => setInputFocused(false), 100)}
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
  const t = useT()
  const language = useSettingsStore(s => s.language) || 'it'

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
                  onError={e => { e.target.style.display = 'none' }}
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
            {' '}{language === 'en'
              ? (selectedList.length === 1 ? 'item selected' : 'items selected')
              : (selectedList.length === 1 ? 'capo selezionato' : 'capi selezionati')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--primary-light)', opacity: 0.7, marginTop: 1 }}>
            {expanded ? t('outfitsTapToClose') : t('outfitsTapToView')}
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
                      onError={e => { e.target.style.display = 'none' }}
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
  const toast = useToast()

  const language     = useSettingsStore(s => s.language) || 'it'
  const compactCards = useSettingsStore(s => s.compactCards)
  const isMobile = useIsMobile()
  const location = useLocation()
  const [tab,           setTab]           = useState(() => { try { return sessionStorage.getItem('ob_tab') || 'builder' } catch { return 'builder' } })
  const [selected,      setSelected]      = useState(() => { try { return JSON.parse(sessionStorage.getItem('ob_selected') || '{}') } catch { return {} } })
  const [mixerActiveId, setMixerActiveId] = useState(null)
  const mixerTransformsRef    = useRef({})   // transforms correnti del mixer
  const defaultTransformsRef  = useRef(null) // transforms da applicare al prossimo load
  const [outfitName, setOutfitName] = useState(() => { try { return sessionStorage.getItem('ob_outfitName') || '' } catch { return '' } })
  const [saveMsg,   setSaveMsg]   = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [completing, setCompleting] = useState(false)
  const [completeNotes, setCompleteNotes] = useState(null)
  // Meteo — condiviso tra StylistSlider (desktop) e tab Stylist (mobile)
  const { weather } = useWeather(language)

  const tabsRef = useRef(null)
  const [tabsBottom, setTabsBottom] = useState(0)
  useLayoutEffect(() => {
    if (!isMobile) return
    const el = tabsRef.current
    if (!el) return
    const update = () => setTabsBottom(el.getBoundingClientRect().bottom)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isMobile])
  const prevSelCountRef = useRef(0)
  const [brandSuggestions, setBrandSuggestions] = useState([])
  const [detailOutfit, setDetailOutfit] = useState(null)
  const [wearCounts,     setWearCounts]     = useState({})  // { outfitId: count }
  const [builderSearch,  setBuilderSearch]  = useState('')
  const [savedSearch,    setSavedSearch]    = useState('')
  const [saveOpen,       setSaveOpen]       = useState(false)

  // Persist tab + selection across navigation (sessionStorage, same session only)
  useEffect(() => { try { sessionStorage.setItem('ob_tab', tab) } catch {} }, [tab])
  useEffect(() => { try { sessionStorage.setItem('ob_selected', JSON.stringify(selected)) } catch {} }, [selected])
  useEffect(() => { try { sessionStorage.setItem('ob_outfitName', outfitName) } catch {} }, [outfitName])

  // Reset to builder tab when tab bar icon is tapped while already on this page
  useEffect(() => {
    if (!location.state?.resetAt) return
    setTab('builder')
    setSelected({})
    setOutfitName('')
    setMixerActiveId(null)
  }, [location.state?.resetAt]) // eslint-disable-line

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

  // Lampeggio tab Stylist: attivo finché ci sono capi selezionati e non si è sul tab stylist
  const stylistPulse = selectedGarments.length > 0 && tab !== 'stylist'

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
    if (saving || selectedGarments.length === 0 || !outfitName.trim()) return
    setSaving(true)
    try {
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
    } catch {
      toast.show(language === 'en' ? 'Failed to save outfit' : 'Salvataggio fallito', 'error')
    } finally {
      setSaving(false)
    }
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: isMobile ? 'none' : '1px solid var(--border)', overflow: 'hidden', paddingBottom: isMobile ? 'calc(64px + env(safe-area-inset-bottom, 12px))' : 0 }}>

        {/* ── Mobile: unified header (title + meteo + tabs) come MobileWardrobe ── */}
        {isMobile && (
          <div ref={tabsRef} style={{
            flexShrink: 0, background: 'var(--bg)',
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            paddingTop: 16,
            paddingLeft: 20, paddingRight: 20, paddingBottom: 0,
            borderBottom: '1px solid var(--border)',
            position: 'relative', zIndex: 500,
          }}>
            {/* Riga titolo + meteo */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1, margin: 0 }}>
                  {t('outfitMixerTitle')}
                </h1>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>
                  {outfits.length === 0
                    ? (language === 'en' ? 'No saved outfits yet' : 'Nessun outfit salvato')
                    : `${outfits.length} ${outfits.length === 1
                        ? (language === 'en' ? 'saved outfit' : 'outfit salvato')
                        : (language === 'en' ? 'saved outfits' : 'outfit salvati')}`
                  }
                </div>
              </div>
              {/* Badge meteo — stesso pattern di StylistSlider */}
              {weather && (
                <WeatherBadge weather={weather} language={language} chatOpen={false} onOpenChat={() => {}} />
              )}
            </div>
            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 0 }}>
              {[
                ['builder', t('wardrobeStep2Cta')],
                ['stylist', 'Stylist'],
                ['mixer', 'Mixer'],
                ['saved', t('outfitsTitle')],
              ].map(([id, label]) => {
                const isStylist = id === 'stylist'
                const isActive  = tab === id
                return (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    style={{
                      flex: 1, padding: '8px 4px', cursor: 'pointer',
                      fontSize: 13, fontWeight: isActive ? 700 : 500,
                      color: isActive ? 'var(--primary-light)' : (isStylist && stylistPulse) ? 'var(--primary-light)' : 'var(--text-dim)',
                      background: 'none', border: 'none',
                      borderBottom: `2px solid ${isActive ? 'var(--primary)' : (isStylist && stylistPulse) ? 'rgba(139,92,246,0.4)' : 'transparent'}`,
                      transition: 'color 0.15s, border-color 0.15s',
                      WebkitTapHighlightColor: 'transparent',
                      animation: (!isActive && isStylist && stylistPulse) ? 'stylistTabPulse 0.55s ease-in-out infinite alternate' : 'none',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Desktop: titolo + tab separati ─────────────────────────────────── */}
        {!isMobile && (
          <div style={{ padding: '14px 16px 0', background: 'var(--surface)', flexShrink: 0 }}>
            <h1 style={{ margin: 0 }} className="page-title">{t('outfitMixerTitle')}</h1>
            <p className="page-subtitle" style={{ margin: '3px 0 10px' }}>
              {outfits.length === 0
                ? (language === 'en' ? 'No saved outfits yet' : 'Nessun outfit salvato')
                : `${outfits.length} ${outfits.length === 1
                    ? (language === 'en' ? 'saved outfit' : 'outfit salvato')
                    : (language === 'en' ? 'saved outfits' : 'outfit salvati')}`
              }
            </p>
          </div>
        )}

        {/* Tabs — desktop only (mobile tabs are in the unified header above) */}
        {!isMobile && <div ref={tabsRef} style={{
          display: 'flex', alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          padding: '0 16px 10px',
          gap: 6, flexShrink: 0,
        }}>
          {[
            ['builder', t('wardrobeStep2Cta')],
            ['saved',   t('outfitsTitle')],
          ].map(([id, label]) => {
            const isActive = tab === id
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  padding: '8px 18px', fontSize: 13, fontWeight: 600, borderRadius: 99,
                  cursor: 'pointer', transition: 'all 0.18s',
                  color: isActive ? 'var(--primary-light)' : 'var(--text-muted)',
                  background: isActive ? 'var(--primary-dim)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--primary-border)' : 'transparent'}`,
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.borderColor = 'var(--border)' } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' } }}
              >
                {label}
              </button>
            )
          })}
          <style>{`
            @keyframes stylistTabPulse {
              from { background: transparent; border-color: transparent; color: var(--text-muted); }
              to   { background: var(--primary-dim); border-color: var(--primary-border); color: var(--primary-light); }
            }
            @keyframes stylistDotPulse {
              from { transform: scale(1); opacity: 0.7; }
              to   { transform: scale(1.3); opacity: 1; }
            }
          `}</style>
        </div>}

        {/* Tab: builder */}
        {tab === 'builder' && (
          <div style={{ flex: 1, overflow: 'auto', overscrollBehavior: 'contain', padding: '16px 20px' }}>

            {/* ── Collapsible save section (mobile only) ── */}
            {isMobile && (
              <div style={{ marginBottom: 14, borderRadius: 14, border: '1.5px solid var(--border)', background: 'var(--card)', overflow: 'hidden' }}>
                <button
                  onClick={() => setSaveOpen(v => !v)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: selectedGarments.length > 0 ? 'var(--primary-light)' : 'var(--text)' }}>
                      {language === 'en' ? 'Selected garments' : 'Vestiti selezionati'}
                    </span>
                    {selectedGarments.length > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--primary)', color: '#fff', borderRadius: 99, padding: '1px 7px' }}>
                        {selectedGarments.length}
                      </span>
                    )}
                  </div>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={2} strokeLinecap="round"
                    style={{ transform: saveOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>
                {saveOpen && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {selectedGarments.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: '8px 0' }}>
                        {language === 'en' ? 'Tap garments below to select them' : 'Tocca i capi qui sotto per selezionarli'}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        {selectedGarments.map(g => (
                          <div key={g.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <div style={{ position: 'relative', width: 46, height: 46 }}>
                              <div style={{ width: 46, height: 46, borderRadius: 10, overflow: 'hidden', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                                {g.photo_front
                                  ? <img src={imgUrl(g.photo_front)} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 10 }}>{CAT_ICONS[g.category]}</div>
                                }
                              </div>
                              <button
                                onClick={() => toggleGarment(g)}
                                style={{
                                  position: 'absolute', top: -5, right: -5,
                                  width: 18, height: 18, borderRadius: '50%',
                                  background: 'var(--text)', color: 'var(--bg)',
                                  border: 'none', cursor: 'pointer', padding: 0,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  WebkitTapHighlightColor: 'transparent', zIndex: 1,
                                }}
                              >
                                <svg width={8} height={8} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                                  <path d="M18 6 6 18M6 6l12 12"/>
                                </svg>
                              </button>
                            </div>
                            <span style={{ fontSize: 9, color: 'var(--text-dim)', maxWidth: 46, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <input
                      className="input"
                      placeholder={t('outfitsNamePlaceholder')}
                      value={outfitName}
                      onChange={e => setOutfitName(e.target.value)}
                      style={{ fontSize: 13 }}
                    />
                    {saveMsg && <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 500 }}>{saveMsg}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { setSelected({}); setMixerActiveId(null) }}
                        disabled={selectedGarments.length === 0}
                        className="btn btn-ghost"
                        style={{ flex: 1, justifyContent: 'center', fontSize: 12, padding: '8px 6px' }}
                      >
                        {t('outfitsResetCta')}
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving || selectedGarments.length === 0 || !outfitName.trim()}
                        className="btn btn-primary"
                        style={{ flex: 1, justifyContent: 'center', fontSize: 12, padding: '8px 6px', opacity: (saving || !outfitName.trim()) ? 0.4 : 1 }}
                      >
                        {saving ? '…' : t('outfitsSaveCta')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

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
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? (compactCards ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)') : 'repeat(auto-fill, minmax(150px, 1fr))', gap: isMobile ? (compactCards ? 6 : 10) : 10 }}>
                    {byCategory[cat].map((g, gi) => (
                      <div key={g.id} style={{ animation: `slideUp 0.3s ease ${Math.min(gi * 35, 250)}ms backwards`, minWidth: 0 }}>
                      <GarmentCard
                        garment={g}
                        selectable
                        selected={selected[cat] === g.id}
                        onClick={() => toggleGarment(g)}
                        mobile={isMobile}
                      />
                      </div>
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
            {outfits.length > 0 && (
              <div style={{ marginBottom: 14, position: 'relative' }}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth={2} strokeLinecap="round" style={{
                    position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--text-dim)', pointerEvents: 'none',
                  }}>
                  <circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  value={savedSearch}
                  onChange={e => setSavedSearch(e.target.value)}
                  placeholder={language === 'en' ? 'Search by outfit or garment name…' : 'Cerca per nome outfit o capo…'}
                  style={{
                    width: '100%', padding: '9px 12px 9px 33px',
                    background: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: 10, color: 'var(--text)', fontSize: 13,
                    outline: 'none',
                  }}
                />
              </div>
            )}
            {(() => {
              const q = savedSearch.trim().toLowerCase()
              const filtered = q
                ? outfits.filter(o => {
                    if (o.name?.toLowerCase().includes(q)) return true
                    return (o.garment_ids || []).some(id => {
                      const g = getById(id)
                      return g?.name?.toLowerCase().includes(q)
                    })
                  })
                : outfits
              return filtered.length === 0 ? (
              <div className="empty-state">
                <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><IconSparkle size={40} /></div>
                <h3>{q ? (language === 'en' ? 'No results' : 'Nessun risultato') : t('outfitsEmpty')}</h3>
                <p>{q ? (language === 'en' ? 'Try a different search' : 'Prova con un\'altra ricerca') : t('outfitsEmptyHint')}</p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 16,
              }}>
                {filtered.map((outfit, i) => (
                  <div key={outfit.id} style={{ animation: `slideUp 0.38s ease ${Math.min(i * 50, 380)}ms backwards` }}>
                  <SavedOutfitCard
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
                  </div>
                ))}
              </div>
            )
            })()}
          </div>
        )}

        {/* Tab: mixer — mobile only, full-width interactive mixer */}
        {isMobile && tab === 'mixer' && (
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 0' }}>
            {/* Save section — always visible at top */}
            <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 14, border: '1.5px solid var(--border)', background: 'var(--card)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                className="input"
                placeholder={t('outfitsNamePlaceholder')}
                value={outfitName}
                onChange={e => setOutfitName(e.target.value)}
                style={{ fontSize: 13 }}
              />
              {saveMsg && <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 500 }}>{saveMsg}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setSelected({}); setMixerActiveId(null) }}
                  disabled={selectedGarments.length === 0}
                  className="btn btn-ghost"
                  style={{ flex: 1, justifyContent: 'center', fontSize: 12, padding: '8px 6px' }}
                >
                  {t('outfitsResetCta')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || selectedGarments.length === 0 || !outfitName.trim()}
                  className="btn btn-primary"
                  style={{ flex: 1, justifyContent: 'center', fontSize: 12, padding: '8px 6px', opacity: (saving || !outfitName.trim()) ? 0.4 : 1 }}
                >
                  {saving ? '…' : t('outfitsSaveCta')}
                </button>
              </div>
            </div>
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

        {/* Tab: stylist — mobile only, rendered inline (no position:fixed) so tab bar stays visible */}
        {isMobile && tab === 'stylist' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <StylistWizard
              selectedGarments={selectedGarments}
              weather={weather ?? null}
              onApplyOutfit={(ids, name, notes) => {
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
          </div>
        )}

        {/* Modale dettaglio outfit */}
        {detailOutfit && (
          <OutfitDetailModal
            outfit={detailOutfit}
            getById={getById}
            wearCount={wearCounts[detailOutfit.id] || 0}
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


        {/* Stylist AI — barra scorrevole solo su desktop */}
        {!isMobile && (
          <div data-pagetour="outfit-stylist" style={{ flexShrink: 0 }}>
            <StylistSlider
              currentTab={tab}
              selectedGarments={selectedGarments}
              onApplyOutfit={(ids, name, notes) => {
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
          </div>
        )}
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
  const garments = sortByOutfitOrder((outfit.garment_ids || []).map(id => getById(id)).filter(Boolean))
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
function OutfitDetailModal({ outfit, getById, onClose, onLoad, onDelete, wearCount = 0 }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const garments = sortByOutfitOrder((outfit.garment_ids || []).map(id => getById(id)).filter(Boolean))
  const t = useT()
  const language = useSettingsStore(s => s.language) || 'it'
  const CATEGORY_LABELS = useCategoryLabels()

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="fade-in"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          width: '100%', maxWidth: 460,
          maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Photo strip */}
        {garments.length > 0 && (
          <div style={{
            height: 130, display: 'flex', flexShrink: 0,
            background: 'var(--photo-bg)', overflow: 'hidden',
          }}>
            {garments.slice(0, 4).map((g, i) => {
              const photo = g.photo_front ? imgUrl(g.photo_front) : null
              return (
                <div key={g.id} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                  borderRight: i < Math.min(garments.length, 4) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  {photo
                    ? <img src={photo} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <span style={{ fontSize: 32, opacity: 0.18 }}>{CAT_ICONS[g.category]}</span>
                  }
                </div>
              )
            })}
          </div>
        )}

        {/* Header */}
        <div style={{
          padding: '14px 18px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {outfit.name}
            </h2>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              {outfit.ai_generated && <span className="tag tag-purple">{t('outfitsAiLabel')}</span>}
              {outfit.occasion    && <span className="tag tag-purple">{outfit.occasion}</span>}
              {outfit.season      && <span className="tag tag-green">{outfit.season}</span>}
              <span className="tag tag-gray">{garments.length} {language === 'en' ? 'pieces' : 'capi'}</span>
              {wearCount > 0 && <span className="tag tag-amber">{wearCount}× {language === 'en' ? 'worn' : 'indossato'}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: 'var(--card)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13,
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
          {/* Note AI */}
          {outfit.notes && (
            <div style={{
              fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6,
              background: 'rgba(108,63,199,0.07)', border: '1px solid rgba(108,63,199,0.18)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 14,
            }}>
              {outfit.notes}
            </div>
          )}

          {/* Garment list */}
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 10 }}>
            {t('outfitsGarments', garments.length)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {garments.map(g => {
              const photo = g.photo_front ? imgUrl(g.photo_front) : null
              return (
                <div key={g.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 10px', borderRadius: 12,
                  background: 'var(--card)', border: '1px solid var(--border)',
                }}>
                  <div style={{
                    width: 50, height: 50, borderRadius: 9, flexShrink: 0,
                    background: 'var(--photo-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                  }}>
                    {photo
                      ? <img src={photo} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      : <span style={{ fontSize: 22, opacity: 0.22 }}>{CAT_ICONS[g.category]}</span>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      {CATEGORY_LABELS[g.category]}{g.brand ? ` · ${g.brand}` : ''}{g.size ? ` · ${g.size}` : ''}
                    </div>
                  </div>
                  {g.color_hex && (
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: g.color_hex, flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.15)' }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          {confirmDelete ? (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger)', textAlign: 'center', padding: '2px 0' }}>
                {language === 'en' ? `Delete "${outfit.name}"?` : `Eliminare "${outfit.name}"?`}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="btn btn-ghost"
                  style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}
                >
                  {language === 'en' ? 'Cancel' : 'Annulla'}
                </button>
                <button
                  onClick={onDelete}
                  className="btn btn-danger"
                  style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}
                >
                  {language === 'en' ? 'Delete' : 'Elimina'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setConfirmDelete(true)}
                className="btn btn-ghost"
                style={{ padding: '9px 14px', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.25)', flexShrink: 0 }}
                title={language === 'en' ? 'Delete outfit' : 'Elimina outfit'}
              >
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
              <button
                onClick={onLoad}
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}
              >
                {t('outfitsOpenEditor')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
