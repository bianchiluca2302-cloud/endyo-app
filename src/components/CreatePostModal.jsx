import { useState } from 'react'
import { createSocialPost, imgUrl } from '../api/client'
import useWardrobeStore from '../store/wardrobeStore'
import useAuthStore from '../store/authStore'
import useSettingsStore from '../store/settingsStore'
import { useT } from '../i18n'
import { IconSparkle } from './Icons'
import OutfitCanvasShared from './OutfitCanvas'

// Wrapper che adatta le props di CreatePostModal al componente condiviso
function OutfitCanvas({ garmentItems, bgMode, bgColor, height = 420 }) {
  const effectiveBg = bgMode === 'color' ? bgColor : null
  return <OutfitCanvasShared garmentItems={garmentItems} bgColor={effectiveBg} height={height} />
}

export default function CreatePostModal({ onClose, onCreated }) {
  const t    = useT()
  const lang = useSettingsStore(s => s.language) || 'it'
  const garments        = useWardrobeStore(s => s.garments)
  const outfits         = useWardrobeStore(s => s.outfits)
  const markOutfitUsual = useWardrobeStore(s => s.markOutfitUsual)
  const user            = useAuthStore(s => s.user)

  // Step 1 = selezione outfit, Step 2 = anteprima + caption, Step 3 = salva outfit abituale
  const [step,         setStep]         = useState(1)
  const [selected,     setSelected]     = useState(null)
  const [outfitSearch, setOutfitSearch] = useState('')
  const [caption,      setCaption]      = useState('')
  // bgMode: 'none' | 'color'
  // bgColor: hex string when bgMode === 'color'
  const [bgMode,    setBgMode]    = useState('none')
  const [bgColor,   setBgColor]   = useState('#FFFFFF')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [publishedOutfitId, setPublishedOutfitId] = useState(null)

  // Valore effettivo da inviare al backend
  const effectiveBgColor = bgMode === 'color' ? bgColor : null

  const selectedItem = selected ? outfits.find(o => o.id === selected) : null

  // Garments dell'outfit selezionato per il canvas di anteprima
  const outfitGarments = selectedItem
    ? (selectedItem.garment_ids || []).map(id => garments.find(g => g.id === id)).filter(Boolean)
    : []

  const goPreview = () => {
    if (!selected) { setError(lang === 'en' ? 'Select an outfit to publish.' : 'Seleziona un outfit da pubblicare.'); return }
    setError(null)
    setStep(2)
  }

  const handlePublish = async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = {
        post_type: 'outfit',
        caption:   caption.trim() || null,
        bg_color:  effectiveBgColor,
        outfit_id: selected,
      }
      const newPost = await createSocialPost(payload)
      // Offri di salvare come outfit abituale (step 3)
      const currentOutfit = outfits.find(o => o.id === selected)
      if (currentOutfit && !currentOutfit.is_usual) {
        setPublishedOutfitId(selected)
        setStep(3)
        onCreated(newPost)
        return
      }
      onCreated(newPost)
    } catch (e) {
      setError(e.response?.data?.detail || 'Errore nella pubblicazione.')
    } finally {
      setLoading(false)
    }
  }

  const handleMarkUsual = async (yes) => {
    if (yes && publishedOutfitId) {
      try { await markOutfitUsual(publishedOutfitId, true) } catch {}
    }
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 480,
          border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{
          padding: '18px 20px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-dim)', fontSize: 22, padding: '0 4px', lineHeight: 1,
              }}
            >
              ‹
            </button>
          )}
          <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', flex: 1 }}>
            {step === 1 ? t('feedNewPost') : 'Anteprima'}
          </h3>
          <div style={{ display: 'flex', gap: 5 }}>
            {[1, 2].map(s => (
              <div key={s} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: s <= step ? 'var(--primary)' : 'var(--border)',
                transition: 'background 0.2s',
              }} />
            ))}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 18, padding: 4 }}
          >
            ✕
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'auto' }}>

          {/* ═══ STEP 1: Selezione outfit ═══════════════════════════════ */}
          {step === 1 && (
            <div style={{ padding: '16px 20px' }}>
              {/* Barra di ricerca */}
              {outfits.length > 3 && (
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <svg
                    width={15} height={15} viewBox="0 0 24 24" fill="none"
                    stroke="var(--text-dim)" strokeWidth={2} strokeLinecap="round"
                    style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                  >
                    <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
                  </svg>
                  <input
                    value={outfitSearch}
                    onChange={e => setOutfitSearch(e.target.value)}
                    placeholder={lang === 'en' ? 'Search outfits…' : 'Cerca outfit…'}
                    style={{
                      width: '100%', padding: '9px 12px 9px 34px',
                      background: 'var(--card)', border: '1px solid var(--border)',
                      borderRadius: 10, color: 'var(--text)', fontSize: 13,
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                  {outfitSearch && (
                    <button
                      onClick={() => setOutfitSearch('')}
                      style={{
                        position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-dim)', fontSize: 15, padding: 2, lineHeight: 1,
                      }}
                    >✕</button>
                  )}
                </div>
              )}

              {/* Lista outfit */}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                {t('feedSelectOutfit')}
              </div>
              {outfits.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {lang === 'en' ? 'No saved outfits. Create one first in the Outfit section.' : 'Nessun outfit salvato. Creane uno prima nella sezione Outfit.'}
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(() => {
                    const filtered = outfits.filter(o =>
                      !outfitSearch.trim() ||
                      (o.name || '').toLowerCase().includes(outfitSearch.toLowerCase())
                    )
                    if (filtered.length === 0) return (
                      <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                        {lang === 'en' ? 'No outfits match your search.' : 'Nessun outfit corrisponde alla ricerca.'}
                      </div>
                    )
                    return filtered.map(o => {
                      const cover = (o.garment_ids || [])
                        .map(id => garments.find(g => g.id === id))
                        .find(g => g?.photo_front)
                      return (
                        <button
                          key={o.id}
                          onClick={() => setSelected(o.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                            borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                            border: `1.5px solid ${selected === o.id ? 'var(--primary)' : 'var(--border)'}`,
                            background: selected === o.id ? 'var(--primary-dim)' : 'var(--card)',
                            transition: 'var(--transition)',
                          }}
                        >
                          {cover ? (
                            <img
                              src={imgUrl(cover.photo_front)}
                              alt=""
                              style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
                            />
                          ) : (
                            <div style={{
                              width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                              background: 'var(--surface)', border: '1px solid var(--border)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)',
                            }}>
                              <IconSparkle size={20} />
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                              {o.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                              {(o.garment_ids || []).length} {lang === 'en' ? 'items' : 'capi'}
                            </div>
                          </div>
                          {selected === o.id && (
                            <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                          )}
                        </button>
                      )
                    })
                  })()}
                </div>
              )}

              {error && (
                <div style={{
                  marginTop: 14, fontSize: 13, color: '#fca5a5',
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 8, padding: '8px 12px',
                }}>
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 2: Anteprima + Caption ═══════════════════════════ */}
          {/* ═══ STEP 3: Salva come outfit abituale ═══════════════════ */}
          {step === 3 && (
            <div style={{ padding: '32px 24px', textAlign: 'center' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px',
                background: 'var(--primary-dim)', border: '1px solid var(--primary-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <IconSparkle size={28} style={{ color: 'var(--primary)' }} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, letterSpacing: '-0.02em' }}>
                Post pubblicato! 🎉
              </h3>
              <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 28, maxWidth: 300, margin: '0 auto 28px' }}>
                Vuoi salvare questo outfit come <strong style={{ color: 'var(--primary-light)' }}>outfit abituale</strong>? Lo stylist AI lo userà per capire meglio il tuo stile.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => handleMarkUsual(false)} className="btn btn-ghost" style={{ minWidth: 110 }}>
                  No, grazie
                </button>
                <button onClick={() => handleMarkUsual(true)} className="btn btn-primary" style={{ minWidth: 110 }}>
                  Sì, salvalo
                </button>
              </div>
            </div>
          )}

          {step === 2 && selectedItem && (
            <div>
              {/* Card anteprima */}
              <div style={{ margin: '16px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                {/* Header utente */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, var(--primary), #c084fc)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 12 }}>
                    {(user?.username || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>@{user?.username}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{lang === 'en' ? 'Just now' : 'Adesso'}</div>
                  </div>
                </div>

                {/* Anteprima outfit canvas */}
                <div style={{ width: '100%' }}>
                  <OutfitCanvas
                    garmentItems={outfitGarments}
                    bgMode={bgMode}
                    bgColor={bgColor}
                    height={400}
                  />
                </div>

                {/* Nome + caption preview */}
                <div style={{ padding: '10px 14px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{selectedItem.name}</div>
                  {caption.trim() && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>{caption}</p>
                  )}
                </div>
              </div>

              {/* ── Selettore sfondo ── */}
              <div style={{ padding: '4px 20px 0' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {lang === 'en' ? 'Background' : 'Sfondo'}
                </label>

                {/* Pulsanti modalità */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                  {/* Senza sfondo */}
                  <button
                    onClick={() => setBgMode('none')}
                    style={{
                      padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 99, cursor: 'pointer',
                      border: `1.5px solid ${bgMode === 'none' ? 'var(--primary)' : 'var(--border)'}`,
                      background: bgMode === 'none' ? 'var(--primary-dim)' : 'var(--card)',
                      color: bgMode === 'none' ? 'var(--primary-light)' : 'var(--text-muted)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {lang === 'en' ? 'None' : 'Senza sfondo'}
                  </button>

                  {/* Colore */}
                  <button
                    onClick={() => setBgMode('color')}
                    style={{
                      padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 99, cursor: 'pointer',
                      border: `1.5px solid ${bgMode === 'color' ? 'var(--primary)' : 'var(--border)'}`,
                      background: bgMode === 'color' ? 'var(--primary-dim)' : 'var(--card)',
                      color: bgMode === 'color' ? 'var(--primary-light)' : 'var(--text-muted)',
                      transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {bgMode === 'color' && (
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: bgColor, border: '1px solid rgba(255,255,255,0.3)', flexShrink: 0 }} />
                    )}
                    {lang === 'en' ? 'Colour' : 'Colore'}
                  </button>

                  {/* Sfondo originale — solo per capi */}
                </div>

                {/* Palette colori — solo visibile in modalità "colore" */}
                {bgMode === 'color' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    {/* Bianco */}
                    <button
                      title={lang === 'en' ? 'White' : 'Bianco'}
                      onClick={() => setBgColor('#FFFFFF')}
                      style={{
                        width: 30, height: 30, borderRadius: '50%', padding: 0, cursor: 'pointer', flexShrink: 0,
                        background: '#FFFFFF',
                        border: bgColor === '#FFFFFF' ? '2.5px solid var(--primary)' : '1.5px solid var(--border)',
                        outline: bgColor === '#FFFFFF' ? '2px solid var(--primary-dim)' : 'none',
                        transition: 'border 0.15s, outline 0.15s',
                      }}
                    />
                    {/* Nero */}
                    <button
                      title={lang === 'en' ? 'Black' : 'Nero'}
                      onClick={() => setBgColor('#0D0D0D')}
                      style={{
                        width: 30, height: 30, borderRadius: '50%', padding: 0, cursor: 'pointer', flexShrink: 0,
                        background: '#0D0D0D',
                        border: bgColor === '#0D0D0D' ? '2.5px solid var(--primary)' : '1.5px solid var(--border)',
                        outline: bgColor === '#0D0D0D' ? '2px solid var(--primary-dim)' : 'none',
                        transition: 'border 0.15s, outline 0.15s',
                      }}
                    />
                    {/* Spettro colori */}
                    <label
                      title={lang === 'en' ? 'Custom colour' : 'Colore personalizzato'}
                      style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', border: '1.5px solid var(--border)', flexShrink: 0, position: 'relative' }}
                    >
                      <input
                        type="color"
                        value={bgColor}
                        onChange={e => setBgColor(e.target.value)}
                        style={{ position: 'absolute', inset: 0, width: '200%', height: '200%', opacity: 0, cursor: 'pointer' }}
                      />
                      <div style={{ width: '100%', height: '100%', background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)', borderRadius: '50%' }} />
                    </label>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{bgColor}</span>
                  </div>
                )}
              </div>

              {/* Caption input */}
              <div style={{ padding: '12px 20px 16px' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {lang === 'en' ? 'Caption (optional)' : 'Descrizione (opzionale)'}
                </label>
                <textarea
                  className="input"
                  autoFocus
                  style={{ width: '100%', resize: 'none', height: 88, fontSize: 13, lineHeight: 1.5, boxSizing: 'border-box' }}
                  placeholder={lang === 'en' ? 'Write something about your look…' : 'Scrivi qualcosa sul tuo look…'}
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  maxLength={500}
                />
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'right', marginTop: 3 }}>
                  {caption.length}/500
                </div>
                {error && (
                  <div style={{ marginTop: 10, fontSize: 13, color: '#fca5a5', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px' }}>
                    {error}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        {step !== 3 && (
          <div style={{
            padding: '14px 20px', borderTop: '1px solid var(--border)',
            display: 'flex', gap: 10, flexShrink: 0,
          }}>
            <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>
              {t('cancel')}
            </button>

            {step === 1 ? (
              <button
                onClick={goPreview}
                disabled={!selected}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                Avanti →
              </button>
            ) : (
              <button
                onClick={handlePublish}
                disabled={loading}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                {loading ? t('loading') : t('feedPublish')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
