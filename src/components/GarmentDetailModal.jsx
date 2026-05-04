import { useState } from 'react'
import { imgUrl, removeGarmentBackground, reEnrichGarment } from '../api/client'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import { useT, useCategoryLabels, useColorOptions, useTagTranslator } from '../i18n'

// Taglie per categoria
const SIZE_OPTIONS_CLOTHING  = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '44/46', '48/50', '52/54']
const SIZE_OPTIONS_SHOES     = ['35', '35.5', '36', '36.5', '37', '37.5', '38', '38.5', '39', '39.5',
                                 '40', '40.5', '41', '41.5', '42', '42.5', '43', '43.5', '44', '44.5',
                                 '45', '45.5', '46', '46.5', '47']
const SIZE_OPTIONS_PANTS     = ['38', '40', '42', '44', '46', '48', '50', '52', 'XS', 'S', 'M', 'L', 'XL', 'XXL']
// Cappelli: taglie classiche cm + New Era fitted (in pollici frazionari)
const SIZE_OPTIONS_HAT       = [
  'S/M', 'L/XL', 'ONE SIZE',
  '54', '55', '56', '57', '58', '59', '60', '61',
  '6⅝', '6¾', '6⅞', '7', '7⅛', '7¼', '7⅜', '7½', '7⅝', '7¾', '7⅞', '8',
]

const SIZE_OPTIONS_BELT    = ['70', '75', '80', '85', '90', '95', '100', '105', '110', 'S', 'M', 'L', 'XL', 'XXL']

const SIZE_OPTIONS_BY_CATEGORY = {
  scarpe:     SIZE_OPTIONS_SHOES,
  pantaloni:  SIZE_OPTIONS_PANTS,
  cappello:   SIZE_OPTIONS_HAT,
  maglietta:  SIZE_OPTIONS_CLOTHING,
  felpa:      SIZE_OPTIONS_CLOTHING,
  giacchetto: SIZE_OPTIONS_CLOTHING,
  cintura:    SIZE_OPTIONS_BELT,
  // occhiali, borsa, orologio, altro → nessuna taglia predefinita (campo libero)
}

// COLOR_OPTIONS is now computed dynamically via useColorOptions() hook inside GarmentDetailModal

// ── Mappa traduzione colori (IT ↔ EN) ────────────────────────────────────────
const COLOR_TRANS = {
  it_to_en: {
    'nero': 'black', 'bianco': 'white', 'grigio': 'grey', 'grigio scuro': 'dark grey',
    'grigio chiaro': 'light grey', 'blu': 'blue', 'blu navy': 'navy blue', 'navy': 'navy',
    'rosso': 'red', 'verde': 'green', 'verde oliva': 'olive green', 'giallo': 'yellow',
    'arancione': 'orange', 'viola': 'purple', 'rosa': 'pink', 'marrone': 'brown',
    'beige': 'beige', 'azzurro': 'light blue', 'celeste': 'sky blue',
    'bordeaux': 'burgundy', 'crema': 'cream', 'senape': 'mustard', 'turchese': 'teal',
    'argento': 'silver', 'oro': 'gold', 'camel': 'camel', 'tortora': 'dove grey',
    'terracotta': 'terracotta', 'corallo': 'coral', 'ruggine': 'rust',
  },
  en_to_it: {
    'black': 'nero', 'white': 'bianco', 'grey': 'grigio', 'gray': 'grigio',
    'dark grey': 'grigio scuro', 'dark gray': 'grigio scuro',
    'light grey': 'grigio chiaro', 'light gray': 'grigio chiaro',
    'blue': 'blu', 'navy blue': 'blu navy', 'navy': 'navy',
    'red': 'rosso', 'green': 'verde', 'olive green': 'verde oliva', 'yellow': 'giallo',
    'orange': 'arancione', 'purple': 'viola', 'pink': 'rosa', 'brown': 'marrone',
    'beige': 'beige', 'light blue': 'azzurro', 'sky blue': 'celeste',
    'burgundy': 'bordeaux', 'cream': 'crema', 'mustard': 'senape', 'teal': 'turchese',
    'silver': 'argento', 'gold': 'oro', 'camel': 'camel', 'dove grey': 'tortora',
    'terracotta': 'terracotta', 'coral': 'corallo', 'rust': 'ruggine',
  },
}

function translateColor(color, fromLang, toLang) {
  if (!color || fromLang === toLang) return color
  const map = COLOR_TRANS[`${fromLang}_to_${toLang}`]
  if (!map) return color
  const lower = color.toLowerCase()
  return map[lower] || color
}

/**
 * InfoBox con stato di editing controllato dal parent (editingKey / setEditingKey).
 * Quando editingKey !== fieldKey il campo si resetta automaticamente.
 */
function InfoBox({ label, value, fieldKey, options, editingKey, setEditingKey, onSave }) {
  const isEditing = editingKey === fieldKey
  const [input,  setInput]  = useState(value || '')
  const [saving, setSaving] = useState(false)
  const t = useT()

  // Apri editing (annulla eventuale campo precedente)
  const openEdit = () => {
    setInput(value || '')
    setEditingKey(fieldKey)
  }

  // Chiudi senza salvare
  const cancel = () => {
    setInput(value || '')
    setEditingKey(null)
  }

  // Salva
  const handleSave = async (val) => {
    const v = (val ?? input)
    if (!String(v).trim()) { cancel(); return }
    setSaving(true)
    try {
      await onSave(fieldKey, String(v).trim())
    } finally {
      setSaving(false)
      setEditingKey(null)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter')  handleSave()
    if (e.key === 'Escape') cancel()
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>{label}</div>

      {isEditing ? (
        // ── Dropdown (taglia / colore) ──────────────────────────────────
        options ? (
          <div>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 130,
              overflowY: 'auto', marginBottom: 6,
            }}>
              {options.map(opt => {
                const optLabel = typeof opt === 'string' ? opt : opt.label
                const optHex   = typeof opt === 'string' ? null : opt.hex
                const selected = optLabel === input
                return (
                  <button
                    key={optLabel}
                    onClick={() => handleSave(optLabel)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', fontSize: 11, borderRadius: 5,
                      border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                      background: selected ? 'var(--primary-dim)' : 'var(--card)',
                      color: selected ? 'var(--primary-light)' : 'var(--text)',
                      cursor: 'pointer', fontWeight: selected ? 600 : 400,
                      transition: 'var(--transition)',
                    }}
                  >
                    {optHex && (
                      <div style={{
                        width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                        background: optHex,
                        border: '1px solid rgba(255,255,255,0.15)',
                      }} />
                    )}
                    {optLabel}
                  </button>
                )
              })}
            </div>
            <button
              onClick={cancel}
              style={{
                background: 'transparent', border: 'none', fontSize: 11,
                color: 'var(--text-dim)', cursor: 'pointer', padding: 0,
              }}
            >
              ✕ {t('cancel')}
            </button>
          </div>
        ) : (
        // ── Input libero (prezzo) ───────────────────────────────────────
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              style={{
                flex: 1, background: 'var(--card)', border: '1px solid var(--primary)',
                borderRadius: 5, padding: '4px 8px', fontSize: 13, color: 'var(--text)',
                outline: 'none',
              }}
              placeholder={t('garmentInsertPlaceholder', label)}
            />
            <button
              onClick={() => handleSave()}
              disabled={saving}
              style={{
                background: 'var(--primary)', border: 'none', borderRadius: 5,
                padding: '4px 8px', fontSize: 11, color: 'white', cursor: 'pointer',
                fontWeight: 600, flexShrink: 0,
              }}
            >
              {saving ? '…' : '✓'}
            </button>
            <button
              onClick={cancel}
              style={{
                background: 'transparent', border: 'none', borderRadius: 5,
                padding: '4px 6px', fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        )
      ) : value ? (
        // ── Valore compilato → clicca per modificare ────────────────────
        <div
          onClick={openEdit}
          title={t('garmentClickToEdit')}
          style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {value}
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>✏️</span>
        </div>
      ) : (
        // ── Campo vuoto → bottone Aggiungi ──────────────────────────────
        <button
          onClick={openEdit}
          style={{
            background: 'transparent', border: '1px dashed var(--border)',
            borderRadius: 5, padding: '3px 10px', fontSize: 11,
            color: 'var(--text-dim)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {t('garmentAddValue')}
        </button>
      )}
    </div>
  )
}

export default function GarmentDetailModal({ garment, onClose }) {
  const removeGarment        = useWardrobeStore(s => s.removeGarment)
  const updateGarmentBg      = useWardrobeStore(s => s.updateGarmentBg)
  const updateGarmentFields  = useWardrobeStore(s => s.updateGarmentFields)
  const enrichingIds         = useWardrobeStore(s => s.enrichingIds)
  const setGarmentEnriching  = useWardrobeStore(s => s.setGarmentEnriching)
  const t = useT()
  const language = useSettingsStore(s => s.language || 'it')
  const updateGarment = updateGarmentFields
  const CATEGORY_LABELS = useCategoryLabels()
  const COLOR_OPTIONS = useColorOptions()
  const translateTag = useTagTranslator()

  // Rileva la lingua in cui il capo è stato salvato analizzando i tag
  const IT_TAGS = new Set(['primavera','estate','autunno','inverno','quotidiano','lavoro','serata','cerimonia','spiaggia','sportivo','elegante'])
  const EN_TAGS = new Set(['spring','summer','autumn','fall','winter','everyday','work','evening','ceremony','beach','sporty','elegant'])
  const detectGarmentLanguage = (g) => {
    const allTags = [...(g.season_tags || []), ...(g.occasion_tags || []), ...(g.style_tags || [])]
    for (const tag of allTags) {
      const lc = (tag || '').toLowerCase()
      if (IT_TAGS.has(lc)) return 'it'
      if (EN_TAGS.has(lc)) return 'en'
    }
    return null  // lingua non determinabile
  }

  // Capo aggiornato in tempo reale dallo store (deve stare prima di handleReEnrich)
  const liveGarment  = useWardrobeStore(s => s.garments.find(g => g.id === garment.id)) || garment

  // reEnriching viene dallo store → persiste anche se il modale viene chiuso e riaperto
  const reEnriching = !!(enrichingIds[garment.id])
  const [reEnrichDone, setReEnrichDone] = useState(false)

  const handleReEnrich = async () => {
    setGarmentEnriching(garment.id, true)
    setReEnrichDone(false)
    try {
      const updated = await reEnrichGarment(garment.id, language)

      // Determina la lingua originale del capo per tradurre i colori
      const fromLang = detectGarmentLanguage(liveGarment) || (language === 'en' ? 'it' : 'en')

      // Traduce i colori: usa la risposta del backend se diversa, altrimenti traduce con la mappa locale
      const rawColorPrimary   = updated.color_primary   || liveGarment.color_primary
      const rawColorSecondary = updated.color_secondary || liveGarment.color_secondary
      const colorPrimary   = translateColor(rawColorPrimary,   fromLang, language) || rawColorPrimary
      const colorSecondary = translateColor(rawColorSecondary, fromLang, language) || rawColorSecondary

      const fields = {
        description:     updated.description,
        style_tags:      updated.style_tags,
        season_tags:     updated.season_tags,
        occasion_tags:   updated.occasion_tags,
        material:        updated.material   ?? undefined,
        color_hex:       updated.color_hex  ?? undefined,
        ...(colorPrimary   ? { color_primary:   colorPrimary }   : {}),
        ...(colorSecondary ? { color_secondary: colorSecondary } : {}),
      }

      await updateGarment(garment.id, fields)
      setReEnrichDone(true)
      setTimeout(() => setReEnrichDone(false), 3000)
    } catch (e) {
      console.error('Re-enrich error:', e)
    } finally {
      setGarmentEnriching(garment.id, false)
    }
  }

  const bgStatus     = liveGarment.bg_status || 'none'
  const bgProcessing = bgStatus === 'processing'
  const bgDone       = bgStatus === 'done'

  // Stato editing condiviso: solo un campo alla volta
  const [editingKey, setEditingKey] = useState(null)

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

  const handleRemoveBg = () => {
    if (bgProcessing || bgDone) return
    updateGarmentBg(garment.id, 'processing')
    removeGarmentBackground(garment.id).catch(err => {
      console.error('BG removal error:', err)
      updateGarmentBg(garment.id, 'none')
    })
  }

  const handleDelete = async () => {
    if (confirm(t('garmentDeleteConfirm', garment.name))) {
      await removeGarment(garment.id)
      onClose()
    }
  }

  const handleSaveField = async (fieldKey, rawValue) => {
    const value = fieldKey === 'price'
      ? parseFloat(rawValue.replace('€', '').replace(',', '.')) || rawValue
      : rawValue
    await updateGarmentFields(garment.id, { [fieldKey]: value })
  }

  const boxProps = { editingKey, setEditingKey, onSave: handleSaveField }

  const sizeOptions = SIZE_OPTIONS_BY_CATEGORY[liveGarment.category] || SIZE_OPTIONS_CLOTHING

  const topFields = [
    { label: t('garmentSize'),  fieldKey: 'size',          value: liveGarment.size || null,          options: sizeOptions },
    { label: t('garmentPrice'), fieldKey: 'price',          value: liveGarment.price ? `€${liveGarment.price}` : null, options: null },
    { label: t('garmentColor'), fieldKey: 'color_primary',  value: liveGarment.color_primary || null, options: COLOR_OPTIONS },
  ]

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(12px)',
        padding: 24,
        animation: 'fadeIn 0.2s ease forwards',
      }}
      onClick={onClose}
    >
      <div
        className="slide-up"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          width: '100%',
          maxWidth: 860,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{liveGarment.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {CATEGORY_LABELS[liveGarment.category] || liveGarment.category}
              {liveGarment.brand && <> · {liveGarment.brand}</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!bgDone && (
              <button
                onClick={handleRemoveBg}
                disabled={bgProcessing}
                className="btn btn-ghost"
                style={{ fontSize: 12, gap: 6 }}
                title={t('garmentRemoveBgBothTitle')}
              >
                {bgProcessing
                  ? <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> {t('garmentRemoveBgProcessing')}</>
                  : t('garmentRemoveBg')}
              </button>
            )}
            {/* Mostra il bottone di traduzione solo se NON è in corso */}
            {!reEnriching && (() => {
              const savedLang = detectGarmentLanguage(liveGarment)
              const needsTranslation = savedLang !== null && savedLang !== language
              if (!needsTranslation) return null
              return (
                <button
                  onClick={handleReEnrich}
                  className={reEnrichDone ? 'btn btn-ghost' : 'btn btn-primary btn-sm'}
                  style={{ fontSize: 12, gap: 5 }}
                  title={language === 'en' ? t('garmentReEnrich') : t('garmentReEnrichIt')}
                >
                  {reEnrichDone
                    ? t('garmentReEnrichDone')
                    : (language === 'en' ? t('garmentReEnrich') : t('garmentReEnrichIt'))}
                </button>
              )
            })()}
            <button onClick={handleDelete} className="btn btn-ghost" style={{ fontSize: 12, color: '#f87171' }}>
              {t('garmentDelete')}
            </button>
            <button onClick={onClose} className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: 18 }}>
              ✕
            </button>
          </div>
        </div>

        {/* ── Banner traduzione in corso (persiste anche riaprendo il modale) ── */}
        {reEnriching && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 24px', flexShrink: 0,
            background: 'var(--primary-dim)',
            borderBottom: '1px solid var(--primary-border)',
          }}>
            <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: 'var(--primary-light)', borderColor: 'var(--primary-border)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-light)' }}>
              {language === 'en' ? 'Translating to English…' : 'Traduzione in italiano in corso…'}
            </span>
          </div>
        )}

        {/* ── Body ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left: foto */}
          <div style={{
            width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderRight: '1px solid var(--border)', background: 'var(--bg)',
          }}>
            <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
              {bgProcessing && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 10,
                  background: 'rgba(0,0,0,0.55)',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 10,
                }}>
                  <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
                  <span style={{ fontSize: 11, color: 'white', opacity: 0.85 }}>{t('garmentRemoveBgSpinner')}</span>
                </div>
              )}
              {currentPhotoUrl ? (
                <img
                  key={currentPhotoUrl}
                  src={currentPhotoUrl}
                  alt={liveGarment.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56, opacity: 0.15 }}>
                  👕
                </div>
              )}
            </div>

            {tabs.length > 1 && (
              <div style={{ display: 'flex', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActivePhoto(tab.id)}
                    style={{
                      flex: 1, padding: '10px 4px', fontSize: 11,
                      fontWeight: activePhoto === tab.id ? 600 : 400,
                      color: activePhoto === tab.id ? 'var(--primary-light)' : 'var(--text-muted)',
                      background: activePhoto === tab.id ? 'var(--primary-dim)' : 'transparent',
                      border: 'none', cursor: 'pointer',
                      borderTop: `2px solid ${activePhoto === tab.id ? 'var(--primary)' : 'transparent'}`,
                      transition: 'var(--transition)',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: dettagli */}
          <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>

            {/* 3 box sempre visibili */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: (liveGarment.color_palette || []).length > 1 ? 10 : 20 }}>
              {topFields.map(f => (
                <InfoBox key={f.fieldKey} {...f} {...boxProps} />
              ))}
            </div>

            {/* Dettagli colore palette */}
            {(liveGarment.color_palette || []).length > 1 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                {(liveGarment.color_palette).map((c, i) => (
                  <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 9px 3px 6px', borderRadius: 20,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    fontSize: 11, color: 'var(--text-muted)',
                  }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.hex, flexShrink: 0, border: '1px solid rgba(0,0,0,0.12)' }} />
                    <span style={{ color: 'var(--text-dim)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {i === 0 ? (language === 'en' ? 'base' : 'base') : (language === 'en' ? 'detail' : 'det.')}
                    </span>
                    {c.name}
                  </span>
                ))}
              </div>
            )}

            {liveGarment.material && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('garmentMaterial')}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>{liveGarment.material}</div>
              </div>
            )}

            {liveGarment.description && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('garmentDescription')}</div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>{liveGarment.description}</p>
              </div>
            )}

            {[
              [t('garmentStyle'),    liveGarment.style_tags,    'tag-purple'],
              [t('garmentSeason'),   liveGarment.season_tags,   'tag-green'],
              [t('garmentOccasion'), liveGarment.occasion_tags, 'tag-amber'],
            ].map(([label, tags, cls]) => (tags || []).length > 0 && (
              <div key={label} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {tags.map(tag => <span key={tag} className={`tag ${cls}`}>{translateTag(tag)}</span>)}
                </div>
              </div>
            ))}

            {liveGarment.created_at && (
              <div style={{ marginTop: 24, fontSize: 11, color: 'var(--text-dim)' }}>
                {t('garmentAddedOn', new Date(liveGarment.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
