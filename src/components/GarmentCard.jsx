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

export default function GarmentCard({ garment, onClick, selectable, selected, compact = false, mobile = false }) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)
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
      if (pollAttempts.current > 35) {
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
        if (pollErrors.current >= 5) {
          clearInterval(pollRef.current)
          updateGarmentBg(garment.id, 'none')
        }
      }
    }, 4000)
    return () => clearInterval(pollRef.current)
  }, [bgProcessing, garment.id])

  const photoUrl = liveGarment.photo_front ? imgUrl(liveGarment.photo_front) : null

  /* ── Mobile render — identico alle card di MobileWardrobe ─────────────── */
  if (mobile) {
    const borderColor = selected     ? 'var(--primary)'           :
                        bgProcessing ? 'rgba(251,191,36,0.5)'     :
                                       'var(--border)'
    return (
      <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        style={{
          borderRadius: 14,
          boxShadow: selected
            ? `0 0 0 2px var(--primary), 0 0 0 4px var(--primary-dim)`
            : `0 0 0 1.5px ${borderColor}`,
          minWidth: 0,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
          transition: 'transform 0.12s',
          WebkitUserSelect: 'none',
          position: 'relative',
        }}
        onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
        onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)' }}
        onTouchCancel={e => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        {selected && (
          <div style={{
            position: 'absolute', top: 7, right: 7, zIndex: 10,
            width: 20, height: 20, borderRadius: '50%',
            background: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, color: 'white', fontWeight: 700,
            boxShadow: '0 2px 8px rgba(139,92,246,0.4)',
          }}>✓</div>
        )}

        <div style={{
          borderRadius: 14,
          overflow: 'hidden',
          background: selected
            ? 'linear-gradient(160deg, var(--primary-dim), var(--primary-hover-bg))'
            : 'var(--card)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Immagine */}
          <div style={{
            height: compact ? 'var(--card-img-h-compact)' : 'var(--card-img-h)',
            background: 'var(--photo-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}>
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={liveGarment.name}
                loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ fontSize: compact ? 30 : 44, opacity: 0.25 }}>
                {CATEGORY_ICONS[garment.category] || '👕'}
              </div>
            )}
            {bgProcessing && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                padding: '20px 8px 7px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}>
                <div className="spinner" style={{
                  width: 11, height: 11, borderWidth: 1.5,
                  borderColor: 'rgba(255,255,255,0.2)', borderTopColor: '#fbbf24', flexShrink: 0,
                }} />
                <span style={{ fontSize: 9.5, color: '#fcd34d', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {t('garmentRemoveBgSpinner')}
                </span>
              </div>
            )}
          </div>

          {/* Info */}
          <div style={{ padding: compact ? '5px 7px 7px' : '8px 10px 10px' }}>
            <div style={{
              fontSize: 12.5, fontWeight: 600, color: 'var(--text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              lineHeight: 1.3, marginBottom: compact ? 3 : 4,
            }}>
              {liveGarment.name}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: compact ? 0 : 5 }}>
              {(() => {
                const palette = liveGarment.color_palette?.length > 0
                  ? liveGarment.color_palette
                  : liveGarment.color_hex ? [{ hex: liveGarment.color_hex }] : []
                return palette.slice(0, compact ? 2 : 4).map((c, i) => c.hex ? (
                  <span key={i} style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: c.hex, border: '1px solid rgba(0,0,0,0.12)',
                    display: 'inline-block',
                  }} />
                ) : null)
              })()}
              {liveGarment.brand && (
                <span style={{
                  fontSize: 10.5, color: 'var(--text-dim)', flex: 1,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {liveGarment.brand}
                </span>
              )}
              {!compact && liveGarment.size && (
                <span style={{
                  fontSize: 9.5, fontWeight: 700, color: 'var(--primary-light)',
                  background: 'var(--primary-dim)', border: '1px solid var(--primary-border)',
                  borderRadius: 5, padding: '1px 5px', flexShrink: 0,
                }}>
                  {liveGarment.size}
                </span>
              )}
            </div>

            {!compact && (liveGarment.style_tags || []).length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }}>
                {liveGarment.style_tags.slice(0, 2).map(tag => (
                  <span key={tag} style={{
                    fontSize: 9.5, fontWeight: 600,
                    background: 'rgba(139,92,246,0.1)',
                    border: '1px solid rgba(139,92,246,0.2)',
                    color: 'var(--primary-light)',
                    borderRadius: 5, padding: '1px 6px',
                    whiteSpace: 'nowrap',
                  }}>
                    {translateTag(tag)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* ── Desktop render ───────────────────────────────────────────────────── */
  const handleDelete = async (e) => {
    e.stopPropagation()
    if (confirm(t('garmentCardDeleteConfirm', garment.name))) {
      await removeGarment(garment.id)
    }
  }

  const imgHeight = compact ? 110 : 170

  return (
    /*
     * iOS Safari border fix — outer div: borderRadius + boxShadow only
     * inner div: overflow:hidden + background + same borderRadius
     */
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onTouchCancel={() => setPressed(false)}
      className="fade-in"
      style={{
        borderRadius: 'var(--radius)',
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
        transition: 'box-shadow 0.15s ease, transform 0.12s ease',
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        position: 'relative',
      }}
    >
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
              style={{ height: '100%', width: '100%', objectFit: 'contain' }}
            />
          ) : (
            <div style={{ fontSize: compact ? 40 : 52, opacity: 0.25 }}>
              {CATEGORY_ICONS[garment.category] || '👕'}
            </div>
          )}

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

          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginBottom: compact ? 0 : 7, minHeight: 22,
          }}>
            {(() => {
              const palette = garment.color_palette?.length > 0 ? garment.color_palette : (garment.color_hex ? [{ hex: garment.color_hex, name: garment.color_primary }] : [])
              return palette.slice(0, 4).map((c, i) => (
                <div key={i} className="color-dot" style={{
                  background: c.hex,
                  marginRight: i < palette.length - 1 ? -5 : 0,
                  boxShadow: i > 0 ? '0 0 0 1.5px var(--card)' : undefined,
                  zIndex: 4 - i, position: 'relative',
                }} title={c.name} />
              ))
            })()}
            {garment.brand && (
              <span style={{
                fontSize: 11, color: 'var(--text-dim)', fontWeight: 500,
                flex: 1, minWidth: 0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
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

      </div>
    </div>
  )
}
