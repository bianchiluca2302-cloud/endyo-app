import { useState, useEffect, useRef } from 'react'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import { imgUrl, fetchBgStatus } from '../api/client'
import { useT, useTagTranslator } from '../i18n'

const CATEGORY_ICONS = {
  cappello:   '🧢',
  maglietta:  '👕',
  felpa:      '🧥',
  giacchetto: '🧣',
  pantaloni:  '👖',
  scarpe:     '👟',
  occhiali:   '🕶️',
  cintura:    '🪢',
  borsa:      '👜',
  orologio:   '⌚',
}

export default function GarmentCard({ garment, onClick, selectable, selected, compact = false }) {
  const [hovered, setHovered] = useState(false)
  const removeGarment    = useWardrobeStore(s => s.removeGarment)
  const updateGarmentBg  = useWardrobeStore(s => s.updateGarmentBg)
  const getCurrencySymbol = useSettingsStore(s => s.getCurrencySymbol)
  const showPrices        = useSettingsStore(s => s.showPrices)
  const currencySymbol    = getCurrencySymbol()
  const t            = useT()
  const translateTag = useTagTranslator()

  const liveGarment  = useWardrobeStore(s => s.garments.find(g => g.id === garment.id)) || garment
  const bgProcessing = liveGarment.bg_status === 'processing'
  const pollRef      = useRef(null)
  const pollAttempts = useRef(0)
  const pollErrors   = useRef(0)

  useEffect(() => {
    if (!bgProcessing) {
      clearInterval(pollRef.current)
      pollAttempts.current = 0
      pollErrors.current   = 0
      return
    }
    pollAttempts.current = 0
    pollErrors.current   = 0
    pollRef.current = setInterval(async () => {
      pollAttempts.current += 1
      if (pollAttempts.current > 35) {          // ~2.5 min max
        clearInterval(pollRef.current)
        updateGarmentBg(garment.id, 'none')
        return
      }
      try {
        const data = await fetchBgStatus(garment.id)
        pollErrors.current = 0
        if (data.bg_status !== 'processing') {
          clearInterval(pollRef.current)
          updateGarmentBg(garment.id, data.bg_status, {
            photo_front: data.photo_front,
            photo_back:  data.photo_back,
            photo_label: data.photo_label,
          })
        }
      } catch {
        pollErrors.current += 1
        if (pollErrors.current >= 5) {          // 5 errori consecutivi → abbandona
          clearInterval(pollRef.current)
          updateGarmentBg(garment.id, 'none')
        }
      }
    }, 4000)
    return () => clearInterval(pollRef.current)
  }, [bgProcessing, garment.id])

  const photoUrl = liveGarment.photo_front ? imgUrl(liveGarment.photo_front) : null

  const handleDelete = async (e) => {
    e.stopPropagation()
    if (confirm(t('garmentCardDeleteConfirm', garment.name))) {
      await removeGarment(garment.id)
    }
  }

  const imgHeight = compact ? 110 : 170

  return (
    /*
     * iOS Safari border fix — soluzione definitiva con box-shadow:
     *   • box-shadow: 0 0 0 1px simula il border ma è renderizzato FUORI
     *     dal border-box in un layer separato — nessun background interno
     *     (anche se sfuma per il bug overflow:hidden+border-radius di Safari)
     *     può raggiungerlo e coprirlo.
     *   • Badge ✓ rimane sul div esterno (position:relative) fuori
     *     dall'inner, così non viene clippato dall'overflow:hidden interno.
     */
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="fade-in"
      style={{
        borderRadius: 'var(--radius)',
        /* Border via box-shadow — immune al background bleed di Safari */
        boxShadow: (() => {
          const borderColor = selected      ? 'var(--primary-border)'  :
                              bgProcessing  ? 'rgba(251,191,36,0.4)'   :
                              hovered       ? 'var(--primary)'          :
                                             'var(--border)'
          const borderShadow = `0 0 0 1.5px ${borderColor}`
          const hoverShadow  = hovered && !selected
            ? ', 0 0 0 3px var(--primary-dim), var(--shadow)'
            : ''
          return borderShadow + hoverShadow
        })(),
        cursor: selectable || onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s ease',
        position: 'relative',
      }}
    >
      {/* ── Selection check — fuori dall'inner per non essere clippato ── */}
      {selected && (
        <div style={{
          position: 'absolute', top: 9, right: 9, zIndex: 10,
          width: 20, height: 20, borderRadius: '50%',
          background: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: 'white', fontWeight: 700,
          boxShadow: '0 2px 8px var(--primary-shadow-lg)',
        }}>✓</div>
      )}

      {/* ── Inner wrapper: overflow:hidden + background dinamico, nessun border ── */}
      <div style={{
        borderRadius: 'calc(var(--radius) - 1px)',
        overflow: 'hidden',
        background: selected
          ? 'linear-gradient(160deg, var(--primary-dim), var(--primary-hover-bg))'
          : hovered ? 'var(--card-hover)' : 'var(--card)',
        transition: 'background 0.18s ease',
      }}>

        {/* ── Image area ── */}
        <div style={{
          height: imgHeight,
          background: 'var(--bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={garment.name}
              style={{
                height: '100%', width: '100%',
                objectFit: 'contain',
              }}
            />
          ) : (
            <div style={{ fontSize: compact ? 40 : 52, opacity: 0.25 }}>
              {CATEGORY_ICONS[garment.category] || '👕'}
            </div>
          )}

          {/* BG removal overlay */}
          {bgProcessing && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
              padding: '24px 10px 9px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <div className="spinner spinner-sm" style={{
                borderColor: 'rgba(255,255,255,0.15)',
                borderTopColor: '#fbbf24',
              }} />
              <span style={{ fontSize: 10.5, color: '#fcd34d', fontWeight: 600, letterSpacing: '0.02em' }}>
                {t('garmentRemoveBgSpinner')}
              </span>
            </div>
          )}
        </div>

        {/* ── Info ── */}
        <div style={{ padding: compact ? '8px 10px' : '11px 13px' }}>

          {/* Name */}
          <div style={{
            fontSize: compact ? 12.5 : 13,
            fontWeight: 600,
            color: 'var(--text)',
            marginBottom: 5,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            letterSpacing: '-0.01em',
          }}>
            {garment.name}
          </div>

          {/* Brand + color + size row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: compact ? 0 : 7,
          }}>
            {garment.color_hex && (
              <div className="color-dot" style={{ background: garment.color_hex }} title={garment.color_primary} />
            )}
            {garment.brand && (
              <span style={{
                fontSize: 11,
                color: 'var(--text-dim)',
                fontWeight: 500,
                flex: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {garment.brand}
              </span>
            )}
            {garment.size && (
              <span className="tag tag-purple" style={{ fontSize: 10, flexShrink: 0 }}>
                {garment.size}
              </span>
            )}
          </div>

          {/* Tags row — only on non-compact */}
          {!compact && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {(garment.style_tags || []).slice(0, 2).map(tag => (
                <span key={tag} className="tag tag-gray">{translateTag(tag)}</span>
              ))}
              {garment.price && showPrices && (
                <span className="tag tag-amber" style={{ marginLeft: 'auto' }}>
                  {currencySymbol}{garment.price}
                </span>
              )}
            </div>
          )}
        </div>

      </div>{/* fine inner wrapper */}
    </div>
  )
}
