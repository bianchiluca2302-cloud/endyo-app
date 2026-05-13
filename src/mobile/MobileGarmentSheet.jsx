/**
 * MobileGarmentSheet — bottom sheet mobile per il dettaglio di un capo.
 *
 * Sostituisce GarmentDetailModal su smartphone:
 * - Slide-up dal basso con animazione cubic-bezier
 * - Swipe down per chiudere (drag > 80px)
 * - Foto compatta (240px), tab Fronte/Retro/Etichetta
 * - Chip taglia, colore, prezzo
 * - Descrizione + tag stile/stagione/occasione
 * - Bottoni: Rimuovi sfondo · Rigenera · Elimina
 */

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { imgUrl, removeGarmentBackground, reEnrichGarment, fetchBgStatus } from '../api/client'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import { useT, useCategoryLabels, useTagTranslator, useColorOptions } from '../i18n'
import FullscreenImageViewer from '../components/FullscreenImageViewer'

/* ── Traduzione colori ───────────────────────────────────────────────────────── */
const COLOR_TRANS = {
  it_to_en: {
    'nero':'black','bianco':'white','grigio':'grey','blu':'blue','rosso':'red',
    'verde':'green','giallo':'yellow','arancione':'orange','viola':'purple',
    'rosa':'pink','marrone':'brown','beige':'beige','azzurro':'light blue',
    'bordeaux':'burgundy','crema':'cream','senape':'mustard','turchese':'teal',
    'argento':'silver','oro':'gold','navy':'navy',
  },
  en_to_it: {
    'black':'nero','white':'bianco','grey':'grigio','gray':'grigio','blue':'blu',
    'red':'rosso','green':'verde','yellow':'giallo','orange':'arancione',
    'purple':'viola','pink':'rosa','brown':'marrone','beige':'beige',
    'light blue':'azzurro','burgundy':'bordeaux','cream':'crema','mustard':'senape',
    'teal':'turchese','silver':'argento','gold':'oro','navy':'navy',
  },
}
const translateColor = (color, from, to) => {
  if (!color || from === to) return color
  const map = COLOR_TRANS[`${from}_to_${to}`]
  return (map && map[color.toLowerCase()]) || color
}

/* ── ConfirmActionSheet — iOS-style destructive action sheet ─────────────────── */
function ConfirmActionSheet({ message, confirmLabel, onConfirm, onCancel, language = 'it' }) {
  const [visible, setVisible] = useState(false)
  const label = confirmLabel ?? (language === 'en' ? 'Delete' : 'Elimina')
  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const handleCancel = () => { setVisible(false); setTimeout(onCancel, 300) }
  const handleConfirm = () => { setVisible(false); setTimeout(onConfirm, 300) }

  return (
    <div
      onClick={handleCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: `rgba(0,0,0,${visible ? 0.55 : 0})`,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        transition: 'background 0.25s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          padding: '0 12px',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
          transform: visible ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
          willChange: 'transform',
        }}
      >
        <div style={{ borderRadius: 16, overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 10 }}>
          <div style={{ padding: '16px 16px 14px', textAlign: 'center', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            {message}
          </div>
          <button
            onClick={handleConfirm}
            style={{ width: '100%', padding: '16px', border: 'none', background: 'none', color: '#f43f5e', fontSize: 17, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            {label}
          </button>
        </div>
        <div style={{ borderRadius: 16, overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <button
            onClick={handleCancel}
            style={{ width: '100%', padding: '16px', border: 'none', background: 'none', color: 'var(--text)', fontSize: 17, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            {language === 'en' ? 'Cancel' : 'Annulla'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Handle ──────────────────────────────────────────────────────────────────── */
function DragHandle() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
      <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border)' }} />
    </div>
  )
}

/* ── Tag pill ────────────────────────────────────────────────────────────────── */
function TagPill({ label, cls = 'tag-gray' }) {
  return <span className={`tag ${cls}`} style={{ fontSize: 11.5 }}>{label}</span>
}

/* ── Main ────────────────────────────────────────────────────────────────────── */
export default function MobileGarmentSheet({ garment, onClose }) {
  const removeGarment       = useWardrobeStore(s => s.removeGarment)
  const updateGarmentBg     = useWardrobeStore(s => s.updateGarmentBg)
  const updateGarmentFields = useWardrobeStore(s => s.updateGarmentFields)
  const enrichingIds        = useWardrobeStore(s => s.enrichingIds)
  const setGarmentEnriching = useWardrobeStore(s => s.setGarmentEnriching)
  const liveGarment         = useWardrobeStore(s => s.garments.find(g => g.id === garment.id)) || garment

  const language       = useSettingsStore(s => s.language || 'it')
  const t              = useT()
  const CATEGORY_LABELS = useCategoryLabels()
  const translateTag   = useTagTranslator()

  /* ── Slide-up + swipe ─────────────────────────────────────────────────────── */
  const [visible,       setVisible]       = useState(false)
  const [dragY,         setDragY]         = useState(0)
  const [confirmOpen,   setConfirmOpen]   = useState(false)
  const [fullscreenUrl, setFullscreenUrl] = useState(null)
  const startYRef   = useRef(0)
  const draggingRef = useRef(false)
  const sheetRef    = useRef(null)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  // Lock body scroll while sheet is open — prevents background content from scrolling
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 350)
  }

  const startDrag = (y) => { startYRef.current = y; draggingRef.current = true }
  const moveDrag  = (y, preventDefault) => {
    if (!draggingRef.current) return
    const delta = y - startYRef.current
    if (delta > 0) { setDragY(delta); preventDefault() }
  }
  const endDrag   = () => {
    draggingRef.current = false
    const sheetH = sheetRef.current?.offsetHeight || 400
    if (dragY > sheetH * 0.35) {
      setDragY(0)
      setTimeout(() => handleClose(), 0)
    } else {
      setDragY(0)
    }
  }

  /* Handle drag — always closes */
  const onHandleTouchStart = (e) => startDrag(e.touches[0].clientY)
  const onHandleTouchMove  = (e) => moveDrag(e.touches[0].clientY, () => e.preventDefault())
  const onHandleTouchEnd   = () => endDrag()

  /* Content drag — only closes when scrolled to top */
  const onContentTouchStart = (e) => {
    if ((sheetRef.current?.scrollTop ?? 0) === 0) startDrag(e.touches[0].clientY)
  }
  const onContentTouchMove = (e) => {
    if ((sheetRef.current?.scrollTop ?? 0) === 0) moveDrag(e.touches[0].clientY, () => e.preventDefault())
  }
  const onContentTouchEnd = () => endDrag()

  /* ── Edit mode ────────────────────────────────────────────────────────────── */
  const CATEGORIES_ORDER = ['cappello','maglietta','felpa','giacchetto','pantaloni','gonna','vestito','top','scarpe','occhiali','cintura','borsa','orologio','altro']
  const [editMode,    setEditMode]    = useState(false)
  const [editSaving,  setEditSaving]  = useState(false)
  const [editFields,  setEditFields]  = useState({})
  const [editPalette, setEditPalette] = useState([])

  const startEdit = () => {
    setEditFields({
      name:     liveGarment.name     || '',
      category: liveGarment.category || '',
      brand:    liveGarment.brand    || '',
      size:     liveGarment.size     || '',
    })
    setEditPalette(
      (liveGarment.color_palette || []).length > 0
        ? liveGarment.color_palette
        : liveGarment.color_hex
          ? [{ name: liveGarment.color_primary || '', hex: liveGarment.color_hex }]
          : []
    )
    setEditMode(true)
  }
  const cancelEdit = () => setEditMode(false)
  const saveEdit = async () => {
    setEditSaving(true)
    try {
      const paletteToSave = editPalette.filter(c => c.hex)
      await updateGarmentFields(garment.id, {
        name:          editFields.name.trim()  || undefined,
        category:      editFields.category     || undefined,
        brand:         editFields.brand.trim() || undefined,
        size:          editFields.size.trim()  || undefined,
        color_palette: paletteToSave.length ? paletteToSave : undefined,
        color_primary: paletteToSave[0]?.name || undefined,
        color_hex:     paletteToSave[0]?.hex  || undefined,
      })
      setEditMode(false)
    } catch { /* ignore */ } finally { setEditSaving(false) }
  }

  /* ── Foto tabs ────────────────────────────────────────────────────────────── */
  const photos = {
    front: liveGarment.photo_front || null,
    back:  liveGarment.photo_back  || null,
    label: garment.photo_label     || null,
  }
  const tabs = [
    photos.front && { id: 'front', label: '📷 Fronte', url: imgUrl(photos.front) },
    photos.back  && { id: 'back',  label: '↩️ Retro',  url: imgUrl(photos.back)  },
    photos.label && { id: 'label', label: '🏷️ Etichetta', url: imgUrl(photos.label) },
  ].filter(Boolean)
  const [activePhoto, setActivePhoto] = useState(tabs[0]?.id || null)
  const currentPhotoUrl = tabs.find(t => t.id === activePhoto)?.url

  /* ── BG removal ───────────────────────────────────────────────────────────── */
  const bgStatus     = liveGarment.bg_status || 'none'
  const bgProcessing = bgStatus === 'processing'
  const bgDone       = bgStatus === 'done'
  const bgPollRef    = useRef(null)

  // Polling: quando bgProcessing è true, controlla ogni 4s fino a max 35 tentativi (~2.5 min)
  const bgPollAttempts = useRef(0)
  const bgPollErrors   = useRef(0)
  useEffect(() => {
    if (!bgProcessing) {
      clearInterval(bgPollRef.current)
      bgPollAttempts.current = 0
      bgPollErrors.current   = 0
      return
    }
    bgPollAttempts.current = 0
    bgPollErrors.current   = 0
    bgPollRef.current = setInterval(async () => {
      bgPollAttempts.current += 1
      // Timeout: dopo 35 tentativi (~2.5 min) abbandona e resetta a 'none'
      if (bgPollAttempts.current > 35) {
        clearInterval(bgPollRef.current)
        updateGarmentBg(garment.id, 'none')
        return
      }
      try {
        const data = await fetchBgStatus(garment.id)
        bgPollErrors.current = 0  // reset errori consecutivi su successo
        if (data.bg_status !== 'processing') {
          clearInterval(bgPollRef.current)
          updateGarmentBg(garment.id, data.bg_status, {
            photo_front: data.photo_front,
            photo_back:  data.photo_back,
            photo_label: data.photo_label,
          })
        }
      } catch {
        bgPollErrors.current += 1
        // Dopo 5 errori consecutivi (server giù) → abbandona
        if (bgPollErrors.current >= 5) {
          clearInterval(bgPollRef.current)
          updateGarmentBg(garment.id, 'none')
        }
      }
    }, 4000)
    return () => clearInterval(bgPollRef.current)
  }, [bgProcessing, garment.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemoveBg = () => {
    if (bgProcessing || bgDone) return
    updateGarmentBg(garment.id, 'processing')
    removeGarmentBackground(garment.id).catch(() => updateGarmentBg(garment.id, 'none'))
  }

  /* ── Re-enrich (rigenera/traduci) ─────────────────────────────────────────── */
  const IT_TAGS = new Set(['primavera','estate','autunno','inverno','quotidiano','lavoro','serata','cerimonia','spiaggia','sportivo','elegante'])
  const EN_TAGS = new Set(['spring','summer','autumn','fall','winter','everyday','work','evening','ceremony','beach','sporty','elegant'])
  const IT_WORDS = /\b(il|la|lo|le|un|una|del|della|dei|con|per|che|come|questo|questa|sono|nel|nella|si|è|ha|al|alla|di|da|su|tra)\b/g
  const EN_WORDS = /\b(the|and|with|for|this|that|are|has|from|its|which|can|be|an|of|in|is|it|to|a)\b/g
  const detectGarmentLanguage = (g) => {
    const allTags = [...(g.season_tags||[]),...(g.occasion_tags||[]),...(g.style_tags||[])]
    for (const tag of allTags) {
      const lc = (tag||'').toLowerCase()
      if (IT_TAGS.has(lc)) return 'it'
      if (EN_TAGS.has(lc)) return 'en'
    }
    // Fallback: conta parole comuni nella descrizione
    const desc = (g.description || '').toLowerCase()
    if (desc.length > 10) {
      const itCount = (desc.match(IT_WORDS) || []).length
      const enCount = (desc.match(EN_WORDS) || []).length
      if (itCount > enCount && itCount > 0) return 'it'
      if (enCount > itCount && enCount > 0) return 'en'
    }
    return null
  }

  const reEnriching  = !!(enrichingIds[garment.id])
  const [reEnrichDone, setReEnrichDone] = useState(false)
  const savedLang       = detectGarmentLanguage(liveGarment)
  const needsTranslation = savedLang !== null && savedLang !== language

  const handleReEnrich = async () => {
    setGarmentEnriching(garment.id, true)
    setReEnrichDone(false)
    try {
      const updated = await reEnrichGarment(garment.id, language)
      const fromLang = detectGarmentLanguage(liveGarment) || (language === 'en' ? 'it' : 'en')
      await updateGarmentFields(garment.id, {
        description:   updated.description,
        style_tags:    updated.style_tags,
        season_tags:   updated.season_tags,
        occasion_tags: updated.occasion_tags,
        material:      updated.material   ?? undefined,
        color_hex:     updated.color_hex  ?? undefined,
        ...(updated.color_primary
          ? { color_primary: translateColor(updated.color_primary, fromLang, language) }
          : {}),
        ...(updated.color_secondary
          ? { color_secondary: translateColor(updated.color_secondary, fromLang, language) }
          : {}),
      })
      setReEnrichDone(true)
      setTimeout(() => setReEnrichDone(false), 3000)
    } catch (e) { console.error('Re-enrich error:', e) }
    finally     { setGarmentEnriching(garment.id, false) }
  }

  /* ── Elimina ──────────────────────────────────────────────────────────────── */
  const handleDelete = async () => {
    await removeGarment(garment.id)
    handleClose()
  }

  /* ── Render ───────────────────────────────────────────────────────────────── */
  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: `rgba(0,0,0,${visible ? 0.72 : 0})`,
        display: 'flex', alignItems: 'flex-end',
        transition: 'background 0.3s ease',
      }}
    >
      <div
        ref={sheetRef}
        onClick={e => e.stopPropagation()}
        onTouchStart={onContentTouchStart}
        onTouchMove={onContentTouchMove}
        onTouchEnd={onContentTouchEnd}
        style={{
          width: '100%',
          background: 'var(--surface)',
          borderRadius: '22px 22px 0 0',
          maxHeight: '93dvh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          transform: visible ? `translateY(${dragY}px)` : 'translateY(100%)',
          transition: dragY > 0 ? 'none' : 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
          willChange: 'transform',
        }}
      >
        {/* ── Sticky drag header — sempre visibile anche scrollando ───────────── */}
        <div
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: 'var(--surface)',
            borderBottom: '2px solid var(--border)',
            touchAction: 'none', cursor: 'grab',
          }}
        >
          {/* Pill handle */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border)' }} />
          </div>

          {/* Titolo + azioni */}
          <div style={{ padding: '0 20px 14px' }}>
            {editMode ? (
              /* ── Edit form ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  value={editFields.name}
                  onChange={e => setEditFields(f => ({ ...f, name: e.target.value }))}
                  placeholder={language === 'en' ? 'Name' : 'Nome'}
                  style={{ ...editInputStyle }}
                />
                <select
                  value={editFields.category}
                  onChange={e => setEditFields(f => ({ ...f, category: e.target.value }))}
                  style={{ ...editInputStyle }}
                >
                  {CATEGORIES_ORDER.map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={editFields.brand}
                    onChange={e => setEditFields(f => ({ ...f, brand: e.target.value }))}
                    placeholder={language === 'en' ? 'Brand' : 'Brand'}
                    style={{ ...editInputStyle, flex: 1 }}
                  />
                  <input
                    value={editFields.size}
                    onChange={e => setEditFields(f => ({ ...f, size: e.target.value }))}
                    placeholder={language === 'en' ? 'Size' : 'Taglia'}
                    style={{ ...editInputStyle, width: 70 }}
                  />
                </div>
                {/* Color palette editor */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {language === 'en' ? 'Colors' : 'Colori'}
                  </span>
                  {editPalette.map((c, i) => (
                    <div key={i} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <div style={{ position: 'relative', width: 32, height: 32 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: c.hex || '#888888', border: '2px solid rgba(0,0,0,0.15)', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', position: 'absolute', inset: 0, pointerEvents: 'none' }} />
                        <input
                          type="color"
                          value={c.hex || '#888888'}
                          onChange={e => {
                            const next = [...editPalette]
                            next[i] = { ...next[i], hex: e.target.value }
                            setEditPalette(next)
                          }}
                          style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer', borderRadius: '50%', border: 'none' }}
                        />
                      </div>
                      <button
                        onClick={() => setEditPalette(prev => prev.filter((_, j) => j !== i))}
                        style={{
                          width: 14, height: 14, borderRadius: '50%',
                          background: 'var(--border)', border: 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', padding: 0, color: 'var(--text-muted)',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        <svg width={7} height={7} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  ))}
                  {editPalette.length < 5 && (
                    <button
                      onClick={() => setEditPalette(prev => [...prev, { name: '', hex: '#888888' }])}
                      style={{
                        width: 32, height: 32, borderRadius: '50%',
                        border: '2px dashed var(--border)', background: 'var(--card)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: 'var(--text-dim)', flexShrink: 0,
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  <button onClick={cancelEdit} style={{ ...editBtnStyle, flex: 1, background: 'var(--card)', color: 'var(--text-muted)' }}>
                    {language === 'en' ? 'Cancel' : 'Annulla'}
                  </button>
                  <button onClick={saveEdit} disabled={editSaving} style={{ ...editBtnStyle, flex: 2, background: 'var(--primary)', color: '#fff', opacity: editSaving ? 0.6 : 1 }}>
                    {editSaving
                      ? <><div className="spinner" style={{ width: 11, height: 11, borderWidth: 2, borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} /></>
                      : (language === 'en' ? 'Save' : 'Salva')}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em',
                    color: 'var(--text)', lineHeight: 1.2,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {liveGarment.name || 'Capo'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                    {CATEGORY_LABELS[liveGarment.category] || liveGarment.category}
                    {liveGarment.brand && <> · <strong style={{ color: 'var(--text-dim)' }}>{liveGarment.brand}</strong></>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {/* Modifica */}
                  <button
                    onClick={startEdit}
                    style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'var(--card)', border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  {/* Elimina */}
                  <button
                    onClick={() => setConfirmOpen(true)}
                    style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Chips: taglia, colore, prezzo — hidden in edit mode */}
            {!editMode && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {liveGarment.size && (
              <span style={chipStyle('var(--primary-dim)', 'var(--primary-border)', 'var(--primary-light)')}>
                📐 {liveGarment.size}
              </span>
            )}
            {liveGarment.color_primary && (
              <span style={{ ...chipStyle('var(--card)', 'var(--border)', 'var(--text-muted)'), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {liveGarment.color_hex && (
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: liveGarment.color_hex, flexShrink: 0, display: 'inline-block', border: '1px solid rgba(0,0,0,0.1)' }} />
                )}
                {liveGarment.color_primary}
              </span>
            )}
            {liveGarment.price && (
              <span style={chipStyle('var(--card)', 'var(--border)', 'var(--text-muted)')}>
                💰 €{liveGarment.price}
              </span>
            )}
            {liveGarment.material && (
              <span style={chipStyle('var(--card)', 'var(--border)', 'var(--text-dim)')}>
                🧵 {liveGarment.material}
              </span>
            )}
            </div>}{/* /chips */}
          </div>{/* /padding */}
        </div>{/* /sticky header */}

        {/* ── Foto ───────────────────────────────────────────────────────────── */}
        <div style={{ background: 'var(--photo-bg)', position: 'relative' }}>
          {/* Spinner BG removal */}
          {bgProcessing && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              <span style={{ fontSize: 11, color: 'white' }}>{t('garmentRemoveBgSpinner')}</span>
            </div>
          )}

          {/* Immagine */}
          <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {currentPhotoUrl ? (
              <img
                key={currentPhotoUrl}
                src={currentPhotoUrl}
                alt={liveGarment.name}
                onClick={() => setFullscreenUrl(currentPhotoUrl)}
                style={{ height: '100%', width: '100%', objectFit: 'contain', cursor: 'zoom-in' }}
              />
            ) : (
              <div style={{ fontSize: 64, opacity: 0.15 }}>👕</div>
            )}
          </div>

          {/* Tab foto */}
          {tabs.length > 1 && (
            <div style={{
              display: 'flex',
              borderTop: '1px solid var(--border)',
            }}>
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActivePhoto(tab.id)}
                  style={{
                    flex: 1, padding: '9px 4px', fontSize: 11, fontWeight: activePhoto === tab.id ? 700 : 400,
                    color: activePhoto === tab.id ? 'var(--primary-light)' : 'var(--text-muted)',
                    background: activePhoto === tab.id ? 'var(--primary-dim)' : 'transparent',
                    border: 'none', cursor: 'pointer',
                    borderTop: `2px solid ${activePhoto === tab.id ? 'var(--primary)' : 'transparent'}`,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Banner traduzione ───────────────────────────────────────────────── */}
        {reEnriching && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 20px',
            background: 'var(--primary-dim)',
            borderBottom: '1px solid var(--primary-border)',
          }}>
            <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: 'var(--primary-light)', borderColor: 'var(--primary-border)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-light)' }}>
              {language === 'en' ? 'Translating to English…' : 'Traduzione in italiano in corso…'}
            </span>
          </div>
        )}

        {/* ── Dettagli ───────────────────────────────────────────────────────── */}
        <div style={{ padding: '18px 20px 8px' }}>

          {/* Descrizione */}
          {liveGarment.description && (
            <div style={{ marginBottom: 18 }}>
              <SectionLabel>{t('garmentDescription')}</SectionLabel>
              <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.7, margin: 0 }}>
                {liveGarment.description}
              </p>
            </div>
          )}

          {/* Tag stile */}
          {(liveGarment.style_tags || []).length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <SectionLabel>{t('garmentStyle')}</SectionLabel>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {liveGarment.style_tags.map(tag => (
                  <TagPill key={tag} label={translateTag(tag)} cls="tag-purple" />
                ))}
              </div>
            </div>
          )}

          {/* Tag stagione */}
          {(liveGarment.season_tags || []).length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <SectionLabel>{t('garmentSeason')}</SectionLabel>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {liveGarment.season_tags.map(tag => (
                  <TagPill key={tag} label={translateTag(tag)} cls="tag-green" />
                ))}
              </div>
            </div>
          )}

          {/* Tag occasione */}
          {(liveGarment.occasion_tags || []).length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <SectionLabel>{t('garmentOccasion')}</SectionLabel>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {liveGarment.occasion_tags.map(tag => (
                  <TagPill key={tag} label={translateTag(tag)} cls="tag-amber" />
                ))}
              </div>
            </div>
          )}

          {/* Data aggiunta */}
          {liveGarment.created_at && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, marginBottom: 20 }}>
              {t('garmentAddedOn', new Date(liveGarment.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))}
            </div>
          )}
        </div>

        {/* ── Action buttons — sticky at bottom so they're always reachable ── */}
        <div style={{
          display: 'flex', gap: 8, padding: '14px 20px',
          borderTop: '1px solid var(--border)', flexWrap: 'wrap',
          position: 'sticky', bottom: 0, zIndex: 5,
          background: 'var(--surface)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
        }}>
          {/* Rimuovi sfondo */}
          {!bgDone && (
            <button
              onClick={handleRemoveBg}
              disabled={bgProcessing}
              style={{
                ...actionBtnStyle,
                background: bgProcessing ? 'var(--surface)' : 'var(--card)',
                color: bgProcessing ? 'var(--text-dim)' : 'var(--text-muted)',
                opacity: bgProcessing ? 0.6 : 1,
              }}
            >
              {bgProcessing
                ? <><div className="spinner" style={{ width: 11, height: 11, borderWidth: 2 }} /> {t('garmentRemoveBgProcessing')}</>
                : t('garmentRemoveBg')}
            </button>
          )}

          {/* Rigenera / Traduci — sempre visibile quando non in corso */}
          {!reEnriching && (
            <button
              onClick={handleReEnrich}
              style={{
                ...actionBtnStyle,
                background: needsTranslation ? 'var(--primary-dim)' : 'var(--card)',
                border: needsTranslation ? '1px solid var(--primary-border)' : '1px solid var(--border)',
                color: needsTranslation ? 'var(--primary-light)' : 'var(--text-muted)',
                fontWeight: needsTranslation ? 600 : 400,
              }}
            >
              {reEnrichDone
                ? t('garmentReEnrichDone')
                : (language === 'en' ? t('garmentReEnrich') : t('garmentReEnrichIt'))}
            </button>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />
        </div>
      </div>

      {/* Conferma eliminazione — portaled to body to escape transform stacking context */}
      {confirmOpen && createPortal(
        <ConfirmActionSheet
          message={t('garmentDeleteConfirm', garment.name)}
          onConfirm={handleDelete}
          onCancel={() => setConfirmOpen(false)}
          language={language}
        />,
        document.body
      )}

      {/* Fullscreen foto */}
      {fullscreenUrl && (
        <FullscreenImageViewer
          src={fullscreenUrl}
          alt={liveGarment.name}
          onClose={() => setFullscreenUrl(null)}
        />
      )}
    </div>
  )
}

/* ── Helpers di stile ────────────────────────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 700, color: 'var(--text-dim)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7,
    }}>
      {children}
    </div>
  )
}

const chipStyle = (bg, border, color) => ({
  display: 'inline-flex', alignItems: 'center',
  padding: '4px 10px', borderRadius: 99,
  fontSize: 12, fontWeight: 600,
  background: bg, border: `1px solid ${border}`, color,
})

const actionBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '9px 14px', borderRadius: 12, fontSize: 12,
  border: '1px solid var(--border)', background: 'var(--card)',
  color: 'var(--text-muted)', cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  fontWeight: 500,
}

const editInputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: 14,
  border: '1px solid var(--border)', background: 'var(--card)',
  color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
  WebkitAppearance: 'none',
}

const editBtnStyle = {
  padding: '10px 16px', borderRadius: 12, fontSize: 14, fontWeight: 600,
  border: '1px solid var(--border)', cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
}
