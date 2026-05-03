import { useState, useMemo, useRef, useCallback } from 'react'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import { imgUrl, analyzeGarment, confirmGarment } from '../api/client'
import { useCategoryLabels, useT, useTagTranslator } from '../i18n'
import MobileGarmentSheet from './MobileGarmentSheet'

/* ── Icons ───────────────────────────────────────────────────────────────────── */
const SearchIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
  </svg>
)
const CloseIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2.2} strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
)
const ShirtPlaceholder = () => (
  <svg width={44} height={44} viewBox="0 0 24 24" fill="none"
    stroke="var(--border)" strokeWidth={1} strokeLinecap="round">
    <path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.86H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.86l.58-3.57a2 2 0 00-1.34-2.23z"/>
  </svg>
)
const CameraIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
)

/* ── Garment card ────────────────────────────────────────────────────────────── */
function GarmentCard({ g, onClick }) {
  const hasImg       = !!g.photo_front
  const translateTag = useTagTranslator()
  const language     = useSettingsStore(s => s.language) || 'it'

  return (
    /*
     * iOS Safari border fix — outer div: borderRadius + boxShadow only
     * inner div: overflow:hidden + background + same borderRadius
     */
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      style={{
        borderRadius: 14,
        boxShadow: '0 0 0 1.5px var(--border)',
        minWidth: 0,
        height: '100%',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        transition: 'transform 0.12s',
        WebkitUserSelect: 'none',
      }}
      onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
      onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)' }}
    >
      <div style={{ borderRadius: 14, overflow: 'hidden', background: 'var(--card)', height: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* Immagine */}
        <div style={{
          height: 158,
          background: 'var(--photo-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {hasImg ? (
            <img
              src={imgUrl(g.photo_front)}
              alt={g.name}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <ShirtPlaceholder />
          )}
        </div>

        {/* Info */}
        <div style={{ padding: '8px 10px 10px', flex: 1 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 600, color: 'var(--text)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            lineHeight: 1.3, marginBottom: 4,
          }}>
            {g.name || (language === 'en' ? 'Item' : 'Capo')}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
            {g.color_hex && (
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: g.color_hex, border: '1px solid rgba(0,0,0,0.12)',
                display: 'inline-block',
              }} />
            )}
            {g.brand && (
              <span style={{
                fontSize: 10.5, color: 'var(--text-dim)', flex: 1,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {g.brand}
              </span>
            )}
            {g.size && (
              <span style={{
                fontSize: 9.5, fontWeight: 700, color: 'var(--primary-light)',
                background: 'var(--primary-dim)', border: '1px solid var(--primary-border)',
                borderRadius: 5, padding: '1px 5px', flexShrink: 0,
              }}>
                {g.size}
              </span>
            )}
          </div>

          {(g.style_tags || []).length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }}>
              {g.style_tags.slice(0, 2).map(tag => (
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

/* ── Empty state ─────────────────────────────────────────────────────────────── */
function EmptyState({ hasGarments }) {
  const t = useT()
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 28px', gap: 14,
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 22,
        background: 'var(--primary-dim)',
        border: '1px solid var(--primary-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width={32} height={32} viewBox="0 0 24 24" fill="none"
          stroke="var(--primary-light)" strokeWidth={1.5} strokeLinecap="round">
          <path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.86H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.86l.58-3.57a2 2 0 00-1.34-2.23z"/>
        </svg>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', textAlign: 'center' }}>
        {hasGarments ? t('wardrobeNoResults') : t('wardrobeEmpty')}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.55 }}>
        {t('wardrobeEmptyHint')}
      </div>
    </div>
  )
}

/* ── Score ring SVG ──────────────────────────────────────────────────────────── */
function ScoreRing({ score }) {
  const radius = 44
  const stroke = 7
  const circumference = 2 * Math.PI * radius
  const pct = score / 10
  const dashOffset = circumference * (1 - pct)
  let color = '#22c55e'
  if (score < 5)  color = '#ef4444'
  else if (score < 8) color = '#f59e0b'
  return (
    <svg width={110} height={110} viewBox="0 0 110 110">
      <circle cx={55} cy={55} r={radius} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle
        cx={55} cy={55} r={radius}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform="rotate(-90 55 55)"
        style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(.4,0,.2,1)' }}
      />
      <text x={55} y={50} textAnchor="middle" fontSize="26" fontWeight="800" fill="var(--text)">{score}</text>
      <text x={55} y={65} textAnchor="middle" fontSize="9" fill="var(--text-dim)">/10</text>
    </svg>
  )
}

/* ── Shopping tab ────────────────────────────────────────────────────────────── */
function ShoppingTab() {
  const garments   = useWardrobeStore(s => s.garments)
  const outfits    = useWardrobeStore(s => s.outfits)
  const addGarment = useWardrobeStore(s => s.addGarment)
  const profile    = useWardrobeStore(s => s.profile)
  const language   = useSettingsStore(s => s.language || 'it')
  const CATEGORY_LABELS = useCategoryLabels()
  const gender = profile?.gender || 'maschio' // default maschile se non impostato
  const isFemale = gender === 'femmina'

  const [photo,    setPhoto]    = useState(null)
  const [preview,  setPreview]  = useState(null)
  const [state,    setState]    = useState('idle') // idle | analyzing | results
  const [analysis, setAnalysis] = useState(null)
  const [compat,   setCompat]   = useState(null)
  const [tmpPaths, setTmpPaths] = useState(null)
  const [error,    setError]    = useState(null)
  const [adding,   setAdding]   = useState(false)
  const [added,    setAdded]    = useState(false)
  const fileRef = useRef()

  const applyFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
    setState('idle')
    setAnalysis(null)
    setCompat(null)
    setError(null)
    setAdded(false)
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (!photo) return
    setState('analyzing')
    setError(null)
    try {
      const fd = new FormData()
      fd.append('photo_front', photo)
      fd.append('language', language)
      const result = await analyzeGarment(fd)
      const a = result.analysis

      // Compute compatibility (gender-aware)
      const cat = (a.category || '').toLowerCase()
      const styleTags = (a.style_tags || []).map(t => t.toLowerCase())
      const byCategory = {}
      garments.forEach(g => {
        const c = (g.category || '').toLowerCase()
        byCategory[c] = (byCategory[c] || 0) + 1
      })
      // Tops: maglietta, felpa, giacchetto (+ top e vestito per donne)
      const TOP_CATS    = isFemale ? ['maglietta','felpa','giacchetto','top'] : ['maglietta','felpa','giacchetto']
      // Bottoms: pantaloni (+ gonna per donne; vestito conta come outfit completo)
      const BOTTOM_CATS = isFemale ? ['pantaloni','gonna'] : ['pantaloni']
      const tops    = TOP_CATS.reduce((s,c) => s + (byCategory[c]||0), 0)
      const bottoms = BOTTOM_CATS.reduce((s,c) => s + (byCategory[c]||0), 0)
      const shoes   = byCategory['scarpe'] || 0
      // Vestiti (donne): ogni vestito aggiunge direttamente scarpe combos
      const dresses = isFemale ? (byCategory['vestito'] || 0) : 0
      const before  = tops * bottoms * shoes + dresses * shoes
      let after = before
      if (TOP_CATS.includes(cat))    after = (tops+1)*bottoms*shoes + dresses*shoes
      else if (BOTTOM_CATS.includes(cat)) after = tops*(bottoms+1)*shoes + dresses*shoes
      else if (cat === 'scarpe')     after = tops*bottoms*(shoes+1) + dresses*(shoes+1)
      else if (cat === 'vestito' && isFemale) after = tops*bottoms*shoes + (dresses+1)*shoes
      const newCombos = Math.max(0, after - before)
      const styleMatches = garments.filter(g => (g.style_tags||[]).some(t => styleTags.includes(t.toLowerCase())))
      const similarInWardrobe = garments.filter(g => (g.category||'').toLowerCase() === cat)
      const fillsGap = !byCategory[cat]
      let score = 5
      if (fillsGap)                       score += 2
      if (similarInWardrobe.length < 3)   score += 1
      if (similarInWardrobe.length >= 3)  score -= 1
      if (similarInWardrobe.length >= 5)  score -= 1
      if (styleMatches.length >= 3)       score += 2
      else if (styleMatches.length >= 1)  score += 1
      if (newCombos >= 3)                 score += 2
      else if (newCombos >= 1)            score += 1
      score = Math.max(0, Math.min(10, score))

      setAnalysis(a)
      setTmpPaths({ tmp_front: result.tmp_front, tmp_back: result.tmp_back, tmp_label: result.tmp_label })
      setCompat({ score, newCombos, styleMatches, similarInWardrobe, fillsGap })
      setState('results')
    } catch {
      setError(language === 'en' ? 'Analysis error. Try again.' : 'Errore nell\'analisi. Riprova.')
      setState('idle')
    }
  }, [photo, language, garments])

  const handleAdd = useCallback(async () => {
    if (!analysis || !tmpPaths || adding || added) return
    setAdding(true)
    try {
      const payload = { ...analysis, ...tmpPaths, language }
      const result = await confirmGarment(payload)
      addGarment(result)
      setAdded(true)
    } catch {}
    finally { setAdding(false) }
  }, [analysis, tmpPaths, adding, added, language, addGarment])

  const verdict = compat ? (
    compat.score >= 8
      ? { label: language === 'en' ? '🟢 Worth buying!' : '🟢 Vale l\'acquisto!', color: '#22c55e' }
      : compat.score >= 5
      ? { label: language === 'en' ? '🟡 Think about it' : '🟡 Valuta con calma', color: '#f59e0b' }
      : { label: language === 'en' ? '🔴 Skip it' : '🔴 Lascia perdere', color: '#ef4444' }
  ) : null

  if (state === 'results' && analysis && compat) {
    return (
      <div style={{ padding: '12px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>

        {/* Photo + score */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
          <div style={{ width: 110, height: 110, borderRadius: 14, overflow: 'hidden', flexShrink: 0, background: 'var(--card)', border: '1px solid var(--border)' }}>
            <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <ScoreRing score={compat.score} />
          </div>
        </div>

        {/* Verdict */}
        <div style={{
          padding: '12px 16px', borderRadius: 14, marginBottom: 12,
          background: 'var(--card)', border: `1px solid var(--border)`,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: verdict.color, marginBottom: 4 }}>{verdict.label}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {analysis.category ? (CATEGORY_LABELS[analysis.category] || analysis.category) : ''}
            {analysis.color_primary ? ` · ${analysis.color_primary}` : ''}
            {analysis.brand ? ` · ${analysis.brand}` : ''}
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            { label: language === 'en' ? 'New outfits' : 'Outfit aggiuntivi', value: `+${compat.newCombos}`, color: '#a78bfa' },
            { label: language === 'en' ? 'Style matches' : 'Match di stile', value: compat.styleMatches.length, color: '#60a5fa' },
            { label: language === 'en' ? 'Similar in wardrobe' : 'Simili nell\'armadio', value: compat.similarInWardrobe.length, color: '#f59e0b' },
            { label: language === 'en' ? 'Fills a gap' : 'Colma una lacuna', value: compat.fillsGap ? '✓' : '✗', color: compat.fillsGap ? '#22c55e' : '#ef4444' },
          ].map(s => (
            <div key={s.label} style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'var(--card)', border: '1px solid var(--border)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Description */}
        {analysis.description && (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              {language === 'en' ? 'AI Analysis' : 'Analisi AI'}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65, margin: 0 }}>
              {analysis.description}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setState('idle'); setAnalysis(null); setCompat(null); setPreview(null); setPhoto(null); setAdded(false) }}
            style={{
              flex: 1, padding: '13px', borderRadius: 12,
              background: 'var(--card)', border: '1px solid var(--border)',
              color: 'var(--text-muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {language === 'en' ? '← New analysis' : '← Nuova analisi'}
          </button>
          <button
            onClick={handleAdd}
            disabled={adding || added}
            style={{
              flex: 1, padding: '13px', borderRadius: 12, border: 'none',
              background: added ? '#10b981' : 'var(--primary)',
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              opacity: adding ? 0.6 : 1,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {added ? (language === 'en' ? '✓ Added' : '✓ Aggiunto') : adding ? '…' : (language === 'en' ? 'Add to wardrobe' : 'Aggiungi all\'armadio')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
      {/* Intro card */}
      <div style={{ padding: '16px', borderRadius: 14, background: 'var(--primary-dim)', border: '1px solid var(--primary-border)', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary-light)', marginBottom: 4 }}>
          🛍️ {language === 'en' ? 'Shopping Advisor' : 'Shopping Advisor'}
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
          {language === 'en'
            ? 'Considering a new item? Upload a photo and discover if it\'s worth adding to your wardrobe.'
            : 'Stai valutando un nuovo capo? Carica la foto e scopri se vale il tuo armadio.'}
        </p>
      </div>

      {/* Photo upload area */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => applyFile(e.target.files?.[0])}
      />

      {preview ? (
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <div style={{
            width: '100%', height: 220, borderRadius: 16,
            overflow: 'hidden', background: 'var(--card)',
            border: '1px solid var(--border)',
          }}>
            <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <button
            onClick={() => { setPreview(null); setPhoto(null); setError(null) }}
            style={{
              position: 'absolute', top: 10, right: 10,
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(0,0,0,0.5)', border: 'none',
              color: '#fff', fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
          >✕</button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            width: '100%', height: 180, borderRadius: 16,
            border: '2px dashed var(--border)', background: 'var(--card)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10, cursor: 'pointer', marginBottom: 16,
            color: 'var(--text-dim)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <CameraIcon />
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {language === 'en' ? 'Tap to upload or take photo' : 'Tocca per caricare o scattare'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', opacity: 0.6 }}>
            {language === 'en' ? 'JPG, PNG, HEIC' : 'JPG, PNG, HEIC'}
          </div>
        </button>
      )}

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <button
        onClick={handleAnalyze}
        disabled={!photo || state === 'analyzing'}
        style={{
          width: '100%', padding: '15px', borderRadius: 14, border: 'none',
          background: (!photo || state === 'analyzing') ? 'rgba(124,58,237,0.25)' : 'var(--primary)',
          color: (!photo || state === 'analyzing') ? 'rgba(255,255,255,0.4)' : '#fff',
          fontSize: 16, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          WebkitTapHighlightColor: 'transparent',
          transition: 'background 0.2s',
        }}
      >
        {state === 'analyzing' ? (
          <>
            <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2, borderTopColor: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.2)' }} />
            {language === 'en' ? 'Analyzing…' : 'Analisi in corso…'}
          </>
        ) : (
          language === 'en' ? '✨ Analyze item' : '✨ Analizza capo'
        )}
      </button>

      {/* Wardrobe summary */}
      <div style={{ marginTop: 20, padding: '14px', borderRadius: 14, background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          {language === 'en' ? 'Your wardrobe' : 'Il tuo armadio'}
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary-light)' }}>{garments.length}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{language === 'en' ? 'items' : 'capi'}</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#a78bfa' }}>{outfits.length}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{language === 'en' ? 'outfits' : 'outfit'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Analisi tab ──────────────────────────────────────────────────────────────── */
function AnalisiTab() {
  const garments        = useWardrobeStore(s => s.garments)
  const profile         = useWardrobeStore(s => s.profile)
  const language        = useSettingsStore(s => s.language || 'it')
  const CATEGORY_LABELS = useCategoryLabels()
  const gender = profile?.gender || 'altro'
  const isFemale = gender === 'femmina' || gender === 'altro'

  const stats = useMemo(() => {
    if (!garments.length) return null

    // Category counts
    const byCategory = {}
    garments.forEach(g => {
      const c = g.category || 'altro'
      byCategory[c] = (byCategory[c] || 0) + 1
    })
    const catEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1])

    // Color counts (top 8)
    const byColor = {}
    garments.forEach(g => {
      if (g.color_primary) {
        const c = g.color_primary.toLowerCase()
        byColor[c] = (byColor[c] || 0) + 1
      }
    })
    const colorEntries = Object.entries(byColor).sort((a, b) => b[1] - a[1]).slice(0, 8)

    // Brand counts (top 6)
    const byBrand = {}
    garments.forEach(g => {
      if (g.brand) {
        byBrand[g.brand] = (byBrand[g.brand] || 0) + 1
      }
    })
    const brandEntries = Object.entries(byBrand).sort((a, b) => b[1] - a[1]).slice(0, 6)

    // Season tags
    const bySeason = {}
    garments.forEach(g => {
      (g.season_tags || []).forEach(tag => {
        bySeason[tag] = (bySeason[tag] || 0) + 1
      })
    })
    const seasonEntries = Object.entries(bySeason).sort((a, b) => b[1] - a[1]).slice(0, 6)

    // Gap analysis (gender-aware)
    const IDEAL_PCT = isFemale
      ? { maglietta: 16, top: 10, felpa: 8, giacchetto: 12, pantaloni: 12, gonna: 10, vestito: 12, scarpe: 12, borsa: 8 }
      : { maglietta: 30, pantaloni: 24, giacchetto: 16, felpa: 14, scarpe: 12, cappello: 4 }
    const total = garments.length
    const gaps = Object.entries(IDEAL_PCT)
      .map(([cat, ideal]) => {
        const actual = Math.round(((byCategory[cat] || 0) / total) * 100)
        return { cat, ideal, actual, count: byCategory[cat] || 0 }
      })
      .filter(g => g.actual < g.ideal * 0.7)
      .slice(0, 4)

    return { catEntries, colorEntries, brandEntries, seasonEntries, gaps, total }
  }, [garments])

  const PALETTE = ['#818cf8','#a78bfa','#c084fc','#e879f9','#f472b6','#fb7185','#fb923c','#fbbf24','#a3e635','#34d399','#22d3ee','#60a5fa']

  if (!garments.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 28px', gap: 14 }}>
        <div style={{ fontSize: 48, opacity: 0.3 }}>📊</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', textAlign: 'center' }}>
          {language === 'en' ? 'No data yet' : 'Nessun dato ancora'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.55 }}>
          {language === 'en' ? 'Add items to your wardrobe to see analysis.' : 'Aggiungi capi all\'armadio per vedere l\'analisi.'}
        </div>
      </div>
    )
  }

  const SectionTitle = ({ children }) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, marginTop: 20 }}>
      {children}
    </div>
  )

  const maxCat = stats.catEntries[0]?.[1] || 1

  return (
    <div style={{ padding: '12px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>

      {/* Summary card */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 0, borderRadius: 14, overflow: 'hidden',
        border: '1px solid var(--border)', background: 'var(--card)', marginBottom: 4,
      }}>
        {[
          { label: language === 'en' ? 'Total items' : 'Capi totali', value: stats.total, color: 'var(--primary-light)' },
          { label: language === 'en' ? 'Categories' : 'Categorie', value: stats.catEntries.length, color: '#a78bfa' },
          { label: language === 'en' ? 'Brands' : 'Brand', value: stats.brandEntries.length, color: '#60a5fa' },
        ].map((s, i) => (
          <div key={s.label} style={{
            textAlign: 'center', padding: '14px 4px',
            borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Category bars */}
      <SectionTitle>{language === 'en' ? 'Categories' : 'Categorie'}</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {stats.catEntries.map(([cat, count], i) => {
          const pct = Math.round((count / maxCat) * 100)
          return (
            <div key={cat}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{CATEGORY_LABELS[cat] || cat}</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{count}</span>
              </div>
              <div style={{ height: 7, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  background: PALETTE[i % PALETTE.length],
                  width: `${pct}%`,
                  transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
                }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Color palette */}
      {stats.colorEntries.length > 0 && (
        <>
          <SectionTitle>{language === 'en' ? 'Colors' : 'Colori'}</SectionTitle>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stats.colorEntries.map(([color, count]) => {
              const g = garments.find(g => (g.color_primary||'').toLowerCase() === color && g.color_hex)
              const hex = g?.color_hex
              return (
                <div key={color} style={{ textAlign: 'center' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: hex || 'var(--card)',
                    border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 4,
                  }}>
                    {!hex && <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>?</span>}
                  </div>
                  <div style={{ fontSize: 9.5, color: 'var(--text-dim)', lineHeight: 1.2 }}>
                    {color.charAt(0).toUpperCase() + color.slice(1)}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', opacity: 0.6 }}>{count}</div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Top brands */}
      {stats.brandEntries.length > 0 && (
        <>
          <SectionTitle>{language === 'en' ? 'Brands' : 'Brand'}</SectionTitle>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stats.brandEntries.map(([brand, count]) => (
              <div key={brand} style={{
                padding: '6px 12px', borderRadius: 99,
                background: 'var(--card)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{brand}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--border)', borderRadius: 99, padding: '1px 5px' }}>{count}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Seasons */}
      {stats.seasonEntries.length > 0 && (
        <>
          <SectionTitle>{language === 'en' ? 'Seasons' : 'Stagioni'}</SectionTitle>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stats.seasonEntries.map(([tag, count]) => (
              <div key={tag} style={{
                padding: '6px 12px', borderRadius: 99,
                background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#34d399' }}>{tag}</span>
                <span style={{ fontSize: 11, color: 'rgba(52,211,153,0.6)' }}>{count}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Gaps */}
      {stats.gaps.length > 0 && (
        <>
          <SectionTitle>{language === 'en' ? 'What\'s missing?' : 'Cosa manca?'}</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.gaps.map(({ cat, ideal, actual, count }) => (
              <div key={cat} style={{
                padding: '12px 14px', borderRadius: 12,
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    {CATEGORY_LABELS[cat] || cat}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                    {count} {language === 'en' ? 'items' : 'capi'} · {language === 'en' ? 'ideal' : 'ideale'} ≥{ideal}%
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f87171', background: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: '3px 8px' }}>
                  {language === 'en' ? 'Missing' : 'Pochi'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ── Main component ──────────────────────────────────────────────────────────── */
export default function MobileWardrobe() {
  const garments        = useWardrobeStore(s => s.garments)
  const loading         = useWardrobeStore(s => s.loading)
  const CATEGORY_LABELS = useCategoryLabels()
  const t               = useT()

  const language    = useSettingsStore(s => s.language) || 'it'

  const [search,     setSearch]     = useState('')
  const [activeCat,  setActiveCat]  = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [selected,   setSelected]   = useState(null)
  const [activeTab,  setActiveTab]  = useState('armadio') // 'armadio' | 'shopping' | 'analisi'

  /* Categories derived from actual garments */
  const categories = useMemo(
    () => [...new Set(garments.map(g => g.category).filter(Boolean))].sort(),
    [garments]
  )

  /* Filter */
  const filtered = useMemo(() => {
    let list = garments
    if (activeCat) list = list.filter(g => g.category === activeCat)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(g =>
        (g.name || '').toLowerCase().includes(q) ||
        (g.brand || '').toLowerCase().includes(q) ||
        (g.color_primary || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [garments, activeCat, search])

  /* Chip style */
  const chipStyle = (active) => ({
    padding: '7px 14px', borderRadius: 99, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
    WebkitTapHighlightColor: 'transparent',
    background: active ? 'var(--primary)' : 'var(--card)',
    color: active ? '#fff' : 'var(--text-muted)',
    border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
    transition: 'background 0.15s, color 0.15s',
  })

  /* Tab style */
  const tabStyle = (active) => ({
    flex: 1, padding: '8px 4px', cursor: 'pointer',
    fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? 'var(--primary-light)' : 'var(--text-dim)',
    background: 'none', border: 'none',
    borderBottom: `2px solid ${active ? 'var(--primary)' : 'transparent'}`,
    transition: 'color 0.15s, border-color 0.15s',
    WebkitTapHighlightColor: 'transparent',
  })

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Sticky header ──────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--bg)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingLeft: 20, paddingRight: 20, paddingBottom: 0,
        borderBottom: '1px solid var(--border)',
      }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)', lineHeight: 1, margin: 0 }}>
              {t('wardrobeTitle')}
            </h1>
            {activeTab === 'armadio' && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>
                {filtered.length} {language === 'en'
                  ? (filtered.length === 1 ? 'item' : 'items')
                  : (filtered.length === 1 ? 'capo' : 'capi')}
              </div>
            )}
          </div>
          {activeTab === 'armadio' && (
            <button
              onClick={() => { setShowSearch(s => !s); if (showSearch) setSearch('') }}
              style={{
                width: 38, height: 38, borderRadius: '50%',
                background: showSearch ? 'var(--primary-dim)' : 'var(--card)',
                border: `1px solid ${showSearch ? 'var(--primary-border)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: showSearch ? 'var(--primary-light)' : 'var(--text-muted)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {showSearch ? <CloseIcon /> : <SearchIcon />}
            </button>
          )}
        </div>

        {/* Search input (Armadio only) */}
        {activeTab === 'armadio' && showSearch && (
          <div style={{ paddingBottom: 10 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={language === 'en' ? 'Search name, brand, color…' : 'Cerca nome, brand, colore…'}
              autoFocus
              style={{
                width: '100%', padding: '11px 16px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 14, color: 'var(--text)', fontSize: 15,
                outline: 'none', WebkitAppearance: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0 }}>
          <button style={tabStyle(activeTab === 'armadio')} onClick={() => setActiveTab('armadio')}>
            👗 {language === 'en' ? 'Wardrobe' : 'Armadio'}
          </button>
          <button style={tabStyle(activeTab === 'shopping')} onClick={() => setActiveTab('shopping')}>
            🛍️ Shopping
          </button>
          <button style={tabStyle(activeTab === 'analisi')} onClick={() => setActiveTab('analisi')}>
            📊 {language === 'en' ? 'Analysis' : 'Analisi'}
          </button>
        </div>
      </div>

      {/* ── Armadio tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'armadio' && (
        <>
          {/* Category chips */}
          <div style={{
            display: 'flex', gap: 8, padding: '10px 16px',
            overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none',
            flexShrink: 0, WebkitOverflowScrolling: 'touch',
          }}>
            <button onClick={() => setActiveCat('')} style={chipStyle(activeCat === '')}>{language === 'en' ? 'All' : 'Tutti'}</button>
            {categories.map(cat => (
              <button key={cat} onClick={() => setActiveCat(cat === activeCat ? '' : cat)} style={chipStyle(activeCat === cat)}>
                {CATEGORY_LABELS[cat] || cat}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div style={{ flex: 1, padding: '4px 12px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
            {loading && garments.length === 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState hasGarments={garments.length > 0} />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, alignItems: 'stretch' }}>
                {filtered.map((g, i) => (
                  <div key={g.id} style={{ animation: `slideUp 0.38s ease ${Math.min(i * 50, 380)}ms backwards`, height: '100%', minWidth: 0 }}>
                    <GarmentCard g={g} onClick={() => setSelected(g)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Shopping tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'shopping' && (
        <div style={{ animation: 'slideUp 0.38s ease backwards', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
          <ShoppingTab />
        </div>
      )}

      {/* ── Analisi tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'analisi' && (
        <div style={{ animation: 'slideUp 0.38s ease backwards', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
          <AnalisiTab />
        </div>
      )}

      {/* ── Garment detail modal ────────────────────────────────────────────────── */}
      {selected && (
        <MobileGarmentSheet garment={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
