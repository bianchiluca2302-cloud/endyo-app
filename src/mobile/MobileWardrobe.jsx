import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import useAuthStore from '../store/authStore'
import { imgUrl, analyzeGarment, confirmGarment, fetchBgStatus, fetchTravelPlan, fetchSavedTravels, deleteSavedTravel } from '../api/client'
import { useCategoryLabels, useT, useTagTranslator } from '../i18n'
import MobileGarmentSheet from './MobileGarmentSheet'
import useDebounce from '../hooks/useDebounce'
import usePullToRefresh from '../hooks/usePullToRefresh'
import { hapticLight, hapticMedium } from '../hooks/useHaptic'
import { useToast } from '../components/Toast'

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

const CATEGORIES_ORDER = ['cappello','maglietta','felpa','giacchetto','pantaloni','scarpe','occhiali','cintura','borsa','orologio','altro']

const COLOR_NORMALIZE = {
  nera:'nero', nere:'nero', neri:'nero',
  bianca:'bianco', bianche:'bianco', bianchi:'bianco',
  rossa:'rosso', rosse:'rosso', rossi:'rosso',
  grigia:'grigio', grigie:'grigio', grigi:'grigio',
  gialla:'giallo', gialle:'giallo', gialli:'giallo',
  azzurra:'azzurro', azzurre:'azzurro', azzurri:'azzurro',
  dorata:'dorato', dorate:'dorato', dorati:'dorato',
  argentata:'argento', argentate:'argento', argentati:'argento',
  bronzata:'bronzo', bronzate:'bronzo', bronzati:'bronzo',
  viola:'viola', viole:'viola',
  marrone:'marrone', marroni:'marrone',
  verde:'verde', verdi:'verde',
  arancione:'arancione', arancioni:'arancione',
  celeste:'celeste', celesti:'celeste',
  turchese:'turchese', turchesi:'turchese',
  rosa:'rosa', rose:'rosa',
  lilla:'lilla',
  creme:'crema', crème:'crema',
  kaki:'kaki', khaki:'kaki',
  camel:'cammello', cammella:'cammello',
}
const normalizeColor = (raw) => {
  if (!raw) return raw
  const lower = raw.trim().toLowerCase()
  const canon = COLOR_NORMALIZE[lower]
  if (canon) return canon.charAt(0).toUpperCase() + canon.slice(1)
  return raw.trim()
}

/* ── Garment card ────────────────────────────────────────────────────────────── */
function GarmentCard({ g, onClick, compact = false }) {
  const translateTag    = useTagTranslator()
  const language        = useSettingsStore(s => s.language) || 'it'
  const updateGarmentBg = useWardrobeStore(s => s.updateGarmentBg)
  const liveGarment     = useWardrobeStore(s => s.garments.find(gm => gm.id === g.id)) || g
  const bgProcessing    = liveGarment.bg_status === 'processing'
  const pollRef         = useRef(null)
  const pollAttempts    = useRef(0)
  const pollErrors      = useRef(0)

  // Track image load state to keep spinner visible while new image fetches
  const [imgReady, setImgReady] = useState(true)
  const prevPhotoRef = useRef(liveGarment.photo_front)
  useEffect(() => {
    if (liveGarment.photo_front && liveGarment.photo_front !== prevPhotoRef.current) {
      setImgReady(false)
      prevPhotoRef.current = liveGarment.photo_front
    }
  }, [liveGarment.photo_front])

  useEffect(() => {
    if (!bgProcessing) { clearInterval(pollRef.current); return }
    pollAttempts.current = 0
    pollErrors.current   = 0
    pollRef.current = setInterval(async () => {
      pollAttempts.current += 1
      if (pollAttempts.current > 35) { clearInterval(pollRef.current); updateGarmentBg(g.id, 'none'); return }
      try {
        const data = await fetchBgStatus(g.id)
        pollErrors.current = 0
        if (data.bg_status !== 'processing') {
          clearInterval(pollRef.current)
          updateGarmentBg(g.id, data.bg_status, { photo_front: data.photo_front, photo_back: data.photo_back })
        }
      } catch {
        pollErrors.current += 1
        if (pollErrors.current >= 5) { clearInterval(pollRef.current); updateGarmentBg(g.id, 'none') }
      }
    }, 4000)
    return () => clearInterval(pollRef.current)
  }, [bgProcessing, g.id]) // eslint-disable-line

  const hasImg = !!liveGarment.photo_front

  return (
    /*
     * iOS Safari border fix — outer div: borderRadius + boxShadow only
     * inner div: overflow:hidden + background + same borderRadius
     */
    <div
      onClick={() => { hapticLight(); onClick?.() }}
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
          height: compact ? 'var(--card-img-h-compact)' : 'var(--card-img-h)',
          background: 'var(--photo-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}>
          {hasImg ? (
            <img
              src={imgUrl(liveGarment.photo_front)}
              alt={liveGarment.name}
              loading="lazy"
              onLoad={() => setImgReady(true)}
              onError={() => setImgReady(true)}
              style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: imgReady ? 1 : 0 }}
            />
          ) : (
            <ShirtPlaceholder />
          )}
          {(bgProcessing || !imgReady) && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
              padding: '20px 8px 7px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
              <div className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', borderTopColor: '#fbbf24', flexShrink: 0 }} />
              {!compact && (
                <span style={{ fontSize: 9.5, color: '#fcd34d', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {language === 'en' ? 'Removing bg…' : 'Rimozione sfondo…'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ padding: compact ? '5px 7px 7px' : '8px 10px 10px', flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 600, color: 'var(--text)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            lineHeight: 1.3, marginBottom: compact ? 2 : 4,
          }}>
            {liveGarment.name || (language === 'en' ? 'Item' : 'Capo')}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
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
                fontSize: 10.5, color: 'var(--text-dim)', flex: 1, minWidth: 0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {liveGarment.brand}
              </span>
            )}
            {liveGarment.size && !compact && (
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
            <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden', marginTop: 5 }}>
              {liveGarment.style_tags.slice(0, 2).map(tag => (
                <span key={tag} style={{
                  fontSize: 9.5, fontWeight: 600,
                  background: 'rgba(139,92,246,0.1)',
                  border: '1px solid rgba(139,92,246,0.2)',
                  color: 'var(--primary-light)',
                  borderRadius: 5, padding: '1px 6px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
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
function ShoppingTab({ busyRef }) {
  const garments      = useWardrobeStore(s => s.garments)
  const outfits       = useWardrobeStore(s => s.outfits)
  const addGarment    = useWardrobeStore(s => s.addGarment)
  const profile       = useWardrobeStore(s => s.profile)
  const setNavLocked  = useWardrobeStore(s => s.setNavLocked)
  const language      = useSettingsStore(s => s.language || 'it')
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
    if (busyRef) busyRef.current = true
    setNavLocked(true)
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
      if (busyRef) busyRef.current = false
      setNavLocked(false)
    }
  }, [photo, language, garments, busyRef, setNavLocked])

  const handleAdd = useCallback(async () => {
    if (!analysis || !tmpPaths || adding || added) return
    setAdding(true)
    try {
      const payload = { ...analysis, ...tmpPaths, language }
      const result = await confirmGarment(payload)
      addGarment(result)
      setAdded(true)
      if (busyRef) busyRef.current = false
      setNavLocked(false)
    } catch {}
    finally { setAdding(false) }
  }, [analysis, tmpPaths, adding, added, language, addGarment, busyRef, setNavLocked])

  const verdict = compat ? (
    compat.score >= 8
      ? { label: language === 'en' ? '🟢 Worth buying!' : '🟢 Vale l\'acquisto!', color: '#22c55e' }
      : compat.score >= 5
      ? { label: language === 'en' ? '🟡 Think about it' : '🟡 Valuta con calma', color: '#f59e0b' }
      : { label: language === 'en' ? '🔴 Skip it' : '🔴 Lascia perdere', color: '#ef4444' }
  ) : null

  if (state === 'results' && analysis && compat) {
    return (
      <div style={{ padding: '12px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}>

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
            {analysis.color_primary ? ` · ${normalizeColor(analysis.color_primary)}` : ''}
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
            onClick={() => { setState('idle'); setAnalysis(null); setCompat(null); setPreview(null); setPhoto(null); setAdded(false); if (busyRef) busyRef.current = false; setNavLocked(false) }}
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
    <div style={{ padding: '16px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}>
      {/* Intro card */}
      <div style={{ padding: '16px', borderRadius: 14, background: 'var(--primary-dim)', border: '1px solid var(--primary-border)', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary-light)', marginBottom: 4 }}>
          {language === 'en' ? 'Shopping Advisor' : 'Shopping Advisor'}
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
          language === 'en' ? 'Analyze item' : 'Analizza capo'
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

    // Color counts (top 8) — solo colore primario
    const byColor = {}   // colorName → count
    const colorHex = {}  // colorName → hex
    garments.forEach(g => {
      const norm = normalizeColor(g.color_primary)
      const hex  = g.color_hex
      if (!norm) return
      const c = norm.toLowerCase()
      byColor[c] = (byColor[c] || 0) + 1
      if (hex && !colorHex[c]) colorHex[c] = hex
    })
    const colorEntries = Object.entries(byColor).sort((a, b) => b[1] - a[1]).slice(0, 10)

    // Brand counts (top 6) — normalizzato (Zara / zara / ZARA → Zara)
    const normBrand = (b) => (b || '').trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    const byBrand = {}
    garments.forEach(g => {
      if (g.brand) {
        const nb = normBrand(g.brand)
        byBrand[nb] = (byBrand[nb] || 0) + 1
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

    return { catEntries, colorEntries, colorHex, brandEntries, seasonEntries, gaps, total }
  }, [garments])

  const PALETTE = ['#818cf8','#a78bfa','#c084fc','#e879f9','#f472b6','#fb7185','#fb923c','#fbbf24','#a3e635','#34d399','#22d3ee','#60a5fa']

  if (!garments.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 28px', gap: 14 }}>
        <svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={1.3} strokeLinecap="round" style={{ opacity: 0.3 }}>
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
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
    <div style={{ padding: '12px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}>

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
              const hex = stats.colorHex[color]
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
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', opacity: 0.6 }}>{Math.round(count)}</div>
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

/* ── Travel garment picker sheet ─────────────────────────────────────────────── */
function TravelGarmentSheet({ selectedIds, onToggle, onClose, language }) {
  const garments = useWardrobeStore(s => s.garments)
  const CATEGORY_LABELS = useCategoryLabels()
  const [search,    setSearch]    = useState('')
  const [activeCat, setActiveCat] = useState('')
  const [dragY,     setDragY]     = useState(0)
  const getVpH = () => {
    const rawH = window.visualViewport?.height ?? window.innerHeight
    const zoom = parseFloat(document.documentElement.dataset.zoom) || 1
    return rawH / zoom
  }
  const [vpH,       setVpH]       = useState(getVpH)
  const startYRef  = useRef(0)
  const dragging   = useRef(false)
  const sheetRef   = useRef(null)
  const en = language === 'en'

  useEffect(() => {
    const fn = () => setVpH(getVpH())
    window.visualViewport?.addEventListener('resize', fn)
    window.addEventListener('resize', fn)
    return () => {
      window.visualViewport?.removeEventListener('resize', fn)
      window.removeEventListener('resize', fn)
    }
  }, []) // eslint-disable-line

  const onTouchStart = e => { startYRef.current = e.touches[0].clientY; dragging.current = true }
  const onTouchMove  = e => {
    if (!dragging.current) return
    const d = e.touches[0].clientY - startYRef.current
    if (d > 0) { setDragY(d); e.preventDefault() }
  }
  const onTouchEnd = () => {
    dragging.current = false
    if (dragY > (sheetRef.current?.offsetHeight || 400) * 0.35) { setDragY(0); setTimeout(onClose, 0) }
    else setDragY(0)
  }

  const categories = useMemo(() => [...new Set(garments.map(g => g.category).filter(Boolean))].sort(), [garments])
  const filtered = useMemo(() => {
    let list = garments
    if (activeCat) list = list.filter(g => g.category === activeCat)
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(g => (g.name || '').toLowerCase().includes(q) || (g.brand || '').toLowerCase().includes(q)) }
    return list
  }, [garments, search, activeCat])

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 600 }} />
      <div ref={sheetRef} onClick={e => e.stopPropagation()} style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 601,
        background: 'var(--card)', borderRadius: '24px 24px 0 0',
        maxHeight: `${vpH * 0.92}px`, display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        transform: `translateY(${dragY}px)`,
        transition: dragY > 0 ? 'none' : 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
        willChange: 'transform',
      }}>
        {/* Drag handle + header */}
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--card)', borderBottom: '1px solid var(--border)', touchAction: 'none', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
            <div style={{ width: 44, height: 5, borderRadius: 99, background: 'var(--border)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 20px 12px' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
              {en ? 'Items to bring' : 'Capi da portare'}
              {selectedIds.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--primary-light)', fontWeight: 600 }}>({selectedIds.length})</span>
              )}
            </div>
            <button onClick={onClose} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text)' }}>
              <CloseIcon />
            </button>
          </div>
          {/* Search */}
          <div style={{ padding: '0 16px 8px' }}>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-dim)' }}>
                <SearchIcon />
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={en ? 'Search…' : 'Cerca…'}
                style={{ width: '100%', padding: '9px 14px 9px 34px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          {/* Category chips */}
          {categories.length > 0 && (
            <div style={{ display: 'flex', gap: 6, padding: '0 16px 10px', overflowX: 'auto', scrollbarWidth: 'none' }}>
              {[null, ...categories].map(cat => (
                <button key={cat || '__all'} onClick={() => setActiveCat(cat || '')} style={{
                  padding: '4px 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                  background: activeCat === (cat || '') ? 'var(--primary)' : 'var(--bg)',
                  color: activeCat === (cat || '') ? '#fff' : 'var(--text-muted)',
                  WebkitTapHighlightColor: 'transparent',
                }}>{cat ? (CATEGORY_LABELS[cat] || cat) : (en ? 'All' : 'Tutti')}</button>
              ))}
            </div>
          )}
        </div>

        {/* Card grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {filtered.map(g => {
              const sel = selectedIds.includes(g.id)
              return (
                <div key={g.id} onClick={() => onToggle(g.id)} style={{
                  borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
                  border: sel ? '2.5px solid var(--primary)' : '1.5px solid var(--border)',
                  background: 'var(--bg)',
                  position: 'relative',
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'border-color 0.15s',
                  boxShadow: sel ? '0 0 0 3px var(--primary-dim)' : 'none',
                }}>
                  {/* Image */}
                  <div style={{ aspectRatio: '1 / 1', background: g.bg_color || 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {g.photo_front
                      ? <img src={imgUrl(g.photo_front)} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      : <ShirtPlaceholder />}
                  </div>
                  {/* Label */}
                  <div style={{ padding: '8px 10px 10px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                    {g.brand && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.brand}</div>}
                  </div>
                  {/* Checkmark badge */}
                  {sel && (
                    <div style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-dim)', fontSize: 14 }}>
              {en ? 'No items found' : 'Nessun capo trovato'}
            </div>
          )}
        </div>

        {/* Confirm button */}
        <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={onClose} style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            {selectedIds.length > 0
              ? (en ? `Confirm (${selectedIds.length} item${selectedIds.length === 1 ? '' : 's'})` : `Conferma (${selectedIds.length} ${selectedIds.length === 1 ? 'capo' : 'capi'})`)
              : (en ? 'Done' : 'Fatto')}
          </button>
        </div>
      </div>
    </>
  )
}

/* ── Travel Tab ──────────────────────────────────────────────────────────────── */
function TravelTab() {
  const garments  = useWardrobeStore(s => s.garments)
  const language  = useSettingsStore(s => s.language) || 'it'
  const user      = useAuthStore(s => s.user)
  const isPremium = user?.plan && user.plan !== 'free'

  const today    = new Date().toISOString().slice(0, 10)
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

  // steps: 0=dest 1=dates 2=items 3=numOutfits 4=style 5=tripType 6=loading 7=results
  const [travelView,   setTravelView]   = useState('new') // 'new' | 'saved'
  const [step,         setStep]         = useState(0)
  const [destination,  setDestination]  = useState('')
  const [startDate,    setStartDate]    = useState(today)
  const [endDate,      setEndDate]      = useState(nextWeek)
  const [preferredIds, setPreferredIds] = useState([])
  const [outfitsPerDay,setOutfitsPerDay]= useState(null)  // null=AI, 1/2/3
  const [travelStyle,  setTravelStyle]  = useState('')
  const [tripType,     setTripType]     = useState('')
  const [autoTripType, setAutoTripType] = useState('')    // detected from geocoding
  const [showPicker,     setShowPicker]     = useState(false)
  const [result,         setResult]         = useState(null)
  const [error,          setError]          = useState(null)
  const [geoSuggestions, setGeoSuggestions] = useState([])
  const [geoLoading,     setGeoLoading]     = useState(false)
  const [savedTravels,   setSavedTravels]   = useState([])
  const [savedLoading,   setSavedLoading]   = useState(false)
  const [viewingTravel,  setViewingTravel]  = useState(null) // full saved travel object
  const [loadingPhase,   setLoadingPhase]   = useState(0)
  const loadingTimer = useRef(null)
  const geoTimer = useRef(null)
  const en = language === 'en'

  const travelDays = useMemo(() => {
    try {
      const ms = new Date(endDate) - new Date(startDate)
      return Math.max(1, Math.round(ms / 86400000) + 1)
    } catch { return 7 }
  }, [startDate, endDate])

  const computedNumOutfits = outfitsPerDay !== null ? outfitsPerDay * travelDays : null

  const togglePreferred = id => setPreferredIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const getById = id => garments.find(g => g.id === id)

  // Detect trip type from geocoding elevation/feature_code
  const detectTripType = (item) => {
    if (!item) return ''
    const elev = item.elevation || 0
    const fc   = (item.feature_code || '').toUpperCase()
    if (elev > 600 || fc.startsWith('MT') || fc === 'PK' || fc === 'PKLT' || fc === 'HLL' || fc === 'HLLS') {
      return en ? 'mountain' : 'montagna'
    }
    return en ? 'city' : 'città'
  }

  const fetchGeoSuggestions = (query) => {
    clearTimeout(geoTimer.current)
    if (!query || query.length < 2) { setGeoSuggestions([]); return }
    setGeoLoading(true)
    geoTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=${language}&format=json`)
        const data = await res.json()
        setGeoSuggestions(data.results || [])
      } catch {
        setGeoSuggestions([])
      } finally {
        setGeoLoading(false)
      }
    }, 320)
  }

  const selectGeoSuggestion = (item) => {
    const label = [item.name, item.admin1, item.country].filter(Boolean).join(', ')
    setDestination(label)
    setGeoSuggestions([])
    const detected = detectTripType(item)
    setAutoTripType(detected)
    setTripType(detected)
  }

  const LOADING_MESSAGES_IT = [
    'Cerco le previsioni meteo…',
    'Analizzo il tuo guardaroba…',
    'Abbino i capi al clima…',
    'Creo gli outfit perfetti…',
    'Scrivo i consigli di stile…',
    'Finalizzo il piano viaggio…',
  ]
  const LOADING_MESSAGES_EN = [
    'Fetching weather forecast…',
    'Scanning your wardrobe…',
    'Matching clothes to the climate…',
    'Creating perfect outfits…',
    'Writing styling tips…',
    'Finalizing your travel plan…',
  ]
  const loadingMessages = en ? LOADING_MESSAGES_EN : LOADING_MESSAGES_IT

  useEffect(() => {
    if (step === 6) {
      setLoadingPhase(0)
      loadingTimer.current = setInterval(() => {
        setLoadingPhase(p => (p + 1) % loadingMessages.length)
      }, 1800)
    } else {
      clearInterval(loadingTimer.current)
    }
    return () => clearInterval(loadingTimer.current)
  }, [step])

  useEffect(() => {
    if (isPremium) {
      setSavedLoading(true)
      fetchSavedTravels().then(data => setSavedTravels(data || [])).catch(() => {}).finally(() => setSavedLoading(false))
    }
  }, [isPremium])

  const generate = async (overrides = {}) => {
    setStep(6); setError(null); setResult(null)
    try {
      const data = await fetchTravelPlan({
        destination: destination.trim(), startDate, endDate, preferredIds, language,
        numOutfits: (overrides.numOutfits ?? computedNumOutfits) ?? 4,
        travelStyle: overrides.travelStyle ?? travelStyle,
        tripType:    overrides.tripType    ?? tripType,
      })
      setResult(data); setStep(7)
      // Refresh saved travels list
      fetchSavedTravels().then(d => setSavedTravels(d || [])).catch(() => {})
    } catch (e) {
      const msg = e.response?.data?.detail || (en ? 'Error generating travel plan.' : 'Errore nella generazione del piano viaggio.')
      setError(msg); setStep(7)
    }
  }

  const reset = () => { setStep(0); setDestination(''); setPreferredIds([]); setOutfitsPerDay(null); setTravelStyle(''); setTripType(''); setAutoTripType(''); setResult(null); setError(null) }

  const inputStyle = {
    width: '100%', padding: '13px 16px', borderRadius: 14,
    background: 'var(--card)', border: '1px solid var(--border)',
    color: 'var(--text)', fontSize: 15, outline: 'none',
    WebkitAppearance: 'none', boxSizing: 'border-box',
  }

  const StepDots = ({ current }) => (
    <div style={{ display: 'flex', gap: 5, marginBottom: 24 }}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ height: 3, borderRadius: 99, width: i === current ? 20 : 8, background: i <= current ? 'var(--primary)' : 'var(--border)', transition: 'width 0.25s, background 0.25s' }} />
      ))}
    </div>
  )

  const TravelHeader = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0' }}>
      <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)' }}>
        {[
          { id: 'new', label: en ? '✈️ New trip' : '✈️ Nuovo' },
          { id: 'saved', label: en ? `🗂 Saved${savedTravels.length > 0 ? ` (${savedTravels.length})` : ''}` : `🗂 Salvati${savedTravels.length > 0 ? ` (${savedTravels.length})` : ''}` },
        ].map(t => (
          <button key={t.id} onClick={() => { setTravelView(t.id); setViewingTravel(null) }} style={{
            padding: '6px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: travelView === t.id ? 'var(--primary)' : 'transparent',
            color: travelView === t.id ? '#fff' : 'var(--text-muted)',
            fontSize: 13, fontWeight: 700, WebkitTapHighlightColor: 'transparent', transition: 'background 0.15s',
          }}>{t.label}</button>
        ))}
      </div>
      {travelView === 'new' && step > 0 && step < 6 && (
        <button onClick={reset} style={{ fontSize: 12, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
          {en ? '↺ Restart' : '↺ Ricomincia'}
        </button>
      )}
    </div>
  )

  if (!isPremium) {
    return (
      <div style={{ padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: 24, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>✈️</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          {en ? 'Travel Planner' : 'Piano Viaggio'}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.65, maxWidth: 280 }}>
          {en
            ? 'AI-generated packing lists and outfit plans based on real weather at your destination.'
            : 'Liste valigia e piani outfit generati dall\'AI con le previsioni meteo reali della tua destinazione.'}
        </div>
        <div style={{ padding: '11px 16px', borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 13, color: 'var(--text-muted)' }}>
          {en ? '🔒 Premium & Premium Plus' : '🔒 Disponibile per Premium e Premium Plus'}
        </div>
        <a href="#/premium" style={{ display: 'inline-block', padding: '13px 28px', borderRadius: 14, background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
          {en ? 'Upgrade to Premium' : 'Passa a Premium'}
        </a>
      </div>
    )
  }

  /* Saved travels view */
  if (travelView === 'saved') {
    if (viewingTravel) {
      const t = viewingTravel
      return (
        <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)' }}>
          <TravelHeader />
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <button onClick={() => setViewingTravel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-dim)', fontSize: 13, padding: 0, alignSelf: 'flex-start' }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              {en ? 'Back to saved trips' : 'Viaggi salvati'}
            </button>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>{t.destination}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>{t.start_date} → {t.end_date} · {t.days} {en ? 'days' : 'giorni'}</div>
              {(t.trip_type || t.travel_style) && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {t.trip_type && <span style={{ padding: '3px 10px', borderRadius: 99, background: 'var(--primary-dim)', border: '1px solid var(--primary-border)', fontSize: 11, fontWeight: 700, color: 'var(--primary-light)' }}>{t.trip_type}</span>}
                  {t.travel_style && <span style={{ padding: '3px 10px', borderRadius: 99, background: 'var(--card)', border: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)' }}>{t.travel_style}</span>}
                </div>
              )}
            </div>
            {t.weather && (
              <div style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)', fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>🌡️</span><span>{t.weather}</span>
              </div>
            )}
            {t.description && <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.65 }}>{t.description}</div>}
            {(t.outfits || []).map((outfit, i) => (
              <div key={i} style={{ padding: '14px', borderRadius: 18, background: 'var(--card)', border: '1px solid var(--border)', animation: `slideUp 0.35s ease ${i * 70}ms backwards` }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>{outfit.name}</div>
                {outfit.occasion && <div style={{ fontSize: 12, color: 'var(--primary-light)', marginBottom: 10, fontWeight: 600 }}>{outfit.occasion}</div>}
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, marginBottom: outfit.notes ? 10 : 0 }}>
                  {(outfit.ids || []).map(id => {
                    const g = garments.find(x => x.id === id)
                    if (!g) return null
                    return (
                      <div key={id} style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {g.photo_front ? <img src={imgUrl(g.photo_front)} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <ShirtPlaceholder />}
                      </div>
                    )
                  })}
                </div>
                {outfit.notes && <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.55, padding: '8px 10px', background: 'var(--bg)', borderRadius: 10 }}>{outfit.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      )
    }

    return (
      <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)' }}>
        <TravelHeader />
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {savedLoading && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-dim)', fontSize: 14 }}>
              {en ? 'Loading…' : 'Caricamento…'}
            </div>
          )}
          {!savedLoading && savedTravels.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 40 }}>✈️</span>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{en ? 'No saved trips yet' : 'Nessun viaggio salvato'}</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{en ? 'Generated plans are saved automatically.' : 'I piani generati vengono salvati automaticamente.'}</div>
              <button onClick={() => setTravelView('new')} style={{ marginTop: 4, padding: '12px 24px', borderRadius: 14, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                {en ? 'Plan a trip →' : 'Pianifica un viaggio →'}
              </button>
            </div>
          )}
          {savedTravels.map(t => {
            const typeEmoji = { mare: '🏖️', beach: '🏖️', montagna: '🏔️', mountain: '🏔️', città: '🏙️', city: '🏙️', lavoro: '💼', business: '💼' }[t.trip_type] || '✈️'
            return (
              <div key={t.id} onClick={() => setViewingTravel(t)} style={{ padding: '14px 16px', borderRadius: 18, background: 'var(--card)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, WebkitTapHighlightColor: 'transparent' }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{typeEmoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.destination}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{t.start_date} → {t.end_date} · {t.num_outfits} outfit</div>
                </div>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={2.5} strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            )
          })}
          {savedTravels.length > 0 && (
            <button onClick={() => setTravelView('new')} style={{ marginTop: 4, padding: '14px', borderRadius: 14, border: '1.5px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              + {en ? 'Plan a new trip' : 'Pianifica un nuovo viaggio'}
            </button>
          )}
        </div>
      </div>
    )
  }

  /* Step 0 — Destination */
  if (step === 0) return (
    <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)' }}>
      <TravelHeader />
    <div style={{ padding: '20px 20px' }}>
      <StepDots current={0} />
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 6 }}>
        {en ? 'Where are you going?' : 'Dove vai?'}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 24 }}>
        {en ? 'I\'ll plan the perfect wardrobe for your trip.' : 'Pianificherò l\'armadio perfetto per il tuo viaggio.'}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          value={destination}
          onChange={e => { setDestination(e.target.value); fetchGeoSuggestions(e.target.value) }}
          onKeyDown={e => { if (e.key === 'Enter' && destination.trim()) { setGeoSuggestions([]); setStep(1) } }}
          placeholder={en ? 'e.g. Tokyo, Barcelona, New York…' : 'es. Parigi, Tokyo, New York…'}
          autoComplete="off"
          style={inputStyle}
        />
        {geoLoading && (
          <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--primary)', borderTopColor: 'transparent', animation: 'spin 0.6s linear infinite' }} />
        )}
        {geoSuggestions.length > 0 && (
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', zIndex: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            {geoSuggestions.map((item, i) => {
              const city    = item.name
              const region  = item.admin1
              const country = item.country
              const sub     = [region, country].filter(Boolean).join(', ')
              return (
                <button
                  key={i}
                  onMouseDown={e => { e.preventDefault(); selectGeoSuggestion(item); setStep(1) }}
                  style={{
                    width: '100%', padding: '12px 16px', border: 'none', background: 'none',
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    borderBottom: i < geoSuggestions.length - 1 ? '1px solid var(--border)' : 'none',
                    WebkitTapHighlightColor: 'transparent', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>📍</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{city}</div>
                    {sub && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 1 }}>{sub}</div>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
      <button
        onClick={() => { setGeoSuggestions([]); setStep(1) }}
        disabled={!destination.trim()}
        style={{
          marginTop: 16, width: '100%', padding: '15px', borderRadius: 14, border: 'none',
          background: destination.trim() ? 'var(--primary)' : 'var(--card)',
          color: destination.trim() ? '#fff' : 'var(--text-dim)',
          fontSize: 16, fontWeight: 700, cursor: destination.trim() ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {en ? 'Next →' : 'Avanti →'}
      </button>
    </div>
    </div>
  )

  /* Step 1 — Dates */
  if (step === 1) return (
    <div style={{ padding: '20px 20px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)' }}>
      <StepDots current={1} />
      <button onClick={() => setStep(0)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-dim)', fontSize: 13, marginBottom: 20, padding: 0 }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        {destination}
      </button>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 6 }}>
        {en ? 'When are you travelling?' : 'Quando partirai?'}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 24 }}>
        {en ? 'I\'ll check the weather forecast for the exact days.' : 'Controllerò le previsioni meteo per quei giorni.'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>{en ? 'Departure' : 'Partenza'}</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>{en ? 'Return' : 'Ritorno'}</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
        </div>
      </div>
      <button onClick={() => setStep(2)} style={{ marginTop: 20, width: '100%', padding: '15px', borderRadius: 14, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
        {en ? 'Next →' : 'Avanti →'}
      </button>
    </div>
  )

  /* Step 2 — Preferred items */
  if (step === 2) return (
    <div style={{ padding: '20px 20px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)' }}>
      <StepDots current={2} />
      <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-dim)', fontSize: 13, marginBottom: 20, padding: 0 }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        {startDate} → {endDate}
      </button>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 6 }}>
        {en ? 'Any must-haves?' : 'Capi che vuoi portare?'}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 20 }}>
        {en ? 'Optional: pick items you definitely want to include.' : 'Opzionale: seleziona capi che vuoi assolutamente portare.'}
      </div>

      {/* Selected chips preview */}
      {preferredIds.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {preferredIds.map(id => {
            const g = getById(id)
            return g ? (
              <div key={id} onClick={() => togglePreferred(id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px 4px 6px', borderRadius: 99, background: 'var(--primary-dim)', border: '1px solid var(--primary-border)', cursor: 'pointer' }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, overflow: 'hidden', background: g.bg_color || 'var(--card)', flexShrink: 0 }}>
                  {g.photo_front ? <img src={imgUrl(g.photo_front)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : null}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-light)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                <span style={{ fontSize: 14, color: 'var(--primary-light)', lineHeight: 1 }}>×</span>
              </div>
            ) : null
          })}
        </div>
      )}

      <button onClick={() => setShowPicker(true)} style={{
        width: '100%', padding: '13px 16px', borderRadius: 14, border: '1.5px dashed var(--border)', background: 'var(--card)',
        color: 'var(--text-muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, WebkitTapHighlightColor: 'transparent',
      }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        {preferredIds.length > 0
          ? (en ? `${preferredIds.length} items selected (tap to change)` : `${preferredIds.length} capi selezionati (tocca per modificare)`)
          : (en ? 'Select items from wardrobe' : 'Scegli capi dal guardaroba')}
      </button>

      <button onClick={() => setStep(3)} style={{ marginTop: 14, width: '100%', padding: '15px', borderRadius: 14, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {en ? 'Next →' : 'Avanti →'}
      </button>
      <button onClick={() => setStep(3)} style={{ marginTop: 10, width: '100%', padding: '12px', borderRadius: 14, border: 'none', background: 'transparent', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer' }}>
        {en ? 'Skip, let AI decide' : 'Salta'}
      </button>

      {showPicker && (
        <TravelGarmentSheet selectedIds={preferredIds} onToggle={togglePreferred} onClose={() => setShowPicker(false)} language={language} />
      )}
    </div>
  )

  /* Step 3 — Outfits per day */
  if (step === 3) {
    const opts = [
      { val: 1, emoji: '👌', labelFn: d => en ? `1/day · ${d} total` : `1/giorno · ${d} totali` },
      { val: 2, emoji: '✌️', labelFn: d => en ? `2/day · ${d * 2} total` : `2/giorno · ${d * 2} totali` },
      { val: 3, emoji: '🔥', labelFn: d => en ? `3/day · ${d * 3} total` : `3/giorno · ${d * 3} totali` },
      { val: null, emoji: '✨', labelFn: () => en ? 'AI decides' : 'Decide l\'AI' },
    ]
    return (
      <div style={{ padding: '20px 20px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)' }}>
        <StepDots current={3} />
        <button onClick={() => setStep(2)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-dim)', fontSize: 13, marginBottom: 20, padding: 0 }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          {en ? 'Luggage' : 'Bagagli'}
        </button>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 6 }}>
          {en ? 'How many outfits per day?' : 'Quanti outfit al giorno?'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 4 }}>
          {en ? 'Based on your trip duration:' : 'In base alla durata del viaggio:'}
          <span style={{ fontWeight: 700, color: 'var(--primary-light)', marginLeft: 5 }}>
            {travelDays} {en ? (travelDays === 1 ? 'day' : 'days') : (travelDays === 1 ? 'giorno' : 'giorni')}
          </span>
        </div>
        <div style={{ marginBottom: 20 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {opts.map(o => {
            const sel = outfitsPerDay === o.val
            return (
              <button key={String(o.val)} onClick={() => { setOutfitsPerDay(o.val); setStep(4) }} style={{
                padding: '18px 12px', borderRadius: 16, border: `2px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
                background: sel ? 'var(--primary-dim)' : 'var(--card)',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                WebkitTapHighlightColor: 'transparent', transition: 'border-color 0.15s',
              }}>
                <span style={{ fontSize: 28 }}>{o.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: sel ? 'var(--primary-light)' : 'var(--text)', textAlign: 'center', lineHeight: 1.3 }}>{o.labelFn(travelDays)}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  /* Step 4 — Style preference */
  if (step === 4) {
    const styles = [
      { val: en ? 'casual' : 'casual',   label: en ? 'Casual'   : 'Casual',   emoji: '👟' },
      { val: en ? 'elegant' : 'elegante', label: en ? 'Elegant'  : 'Elegante', emoji: '🌙' },
      { val: en ? 'sport' : 'sport',     label: en ? 'Sport'    : 'Sport',    emoji: '🏃' },
      { val: en ? 'mixed' : 'misto',     label: en ? 'Mixed'    : 'Misto',    emoji: '✨' },
    ]
    const outfitSummary = outfitsPerDay !== null
      ? (en ? `${outfitsPerDay}/day · ${computedNumOutfits} total` : `${outfitsPerDay}/giorno · ${computedNumOutfits} totali`)
      : (en ? 'AI decides' : 'Decide l\'AI')
    return (
      <div style={{ padding: '20px 20px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)' }}>
        <StepDots current={4} />
        <button onClick={() => setStep(3)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-dim)', fontSize: 13, marginBottom: 20, padding: 0 }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          {outfitSummary}
        </button>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 6 }}>
          {en ? 'What\'s your style?' : 'Che stile preferisci?'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 24 }}>
          {en ? 'I\'ll tailor the outfits to your vibe.' : 'Adatterò gli outfit al tuo stile.'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {styles.map(s => (
            <button key={s.val} onClick={() => { setTravelStyle(s.val); setStep(5) }} style={{
              padding: '18px 12px', borderRadius: 16, border: `2px solid ${travelStyle === s.val ? 'var(--primary)' : 'var(--border)'}`,
              background: travelStyle === s.val ? 'var(--primary-dim)' : 'var(--card)',
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              WebkitTapHighlightColor: 'transparent', transition: 'border-color 0.15s',
            }}>
              <span style={{ fontSize: 28 }}>{s.emoji}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: travelStyle === s.val ? 'var(--primary-light)' : 'var(--text)' }}>{s.label}</span>
            </button>
          ))}
        </div>
        <button onClick={() => { setTravelStyle(''); setStep(5) }} style={{ marginTop: 12, width: '100%', padding: '12px', borderRadius: 14, border: 'none', background: 'transparent', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer' }}>
          {en ? 'Skip' : 'Salta'}
        </button>
      </div>
    )
  }

  /* Step 5 — Trip type (pre-populated from geocoding) */
  if (step === 5) {
    const types = [
      { val: en ? 'beach' : 'mare',        label: en ? 'Beach'    : 'Mare',     emoji: '🏖️' },
      { val: en ? 'city' : 'città',        label: en ? 'City'     : 'Città',    emoji: '🏙️' },
      { val: en ? 'mountain' : 'montagna', label: en ? 'Mountain' : 'Montagna', emoji: '🏔️' },
      { val: en ? 'business' : 'lavoro',   label: en ? 'Business' : 'Lavoro',   emoji: '💼' },
    ]
    return (
      <div style={{ padding: '20px 20px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)' }}>
        <StepDots current={5} />
        <button onClick={() => setStep(4)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-dim)', fontSize: 13, marginBottom: 20, padding: 0 }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          {travelStyle || (en ? 'Style' : 'Stile')}
        </button>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 6 }}>
          {en ? 'What kind of trip?' : 'Che tipo di viaggio?'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: autoTripType ? 8 : 24 }}>
          {en ? 'The destination activities will shape your wardrobe.' : 'Le attività influenzeranno la scelta dei capi.'}
        </div>
        {autoTripType && (
          <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 10, background: 'var(--primary-dim)', border: '1px solid var(--primary-border)', fontSize: 12, color: 'var(--primary-light)', fontWeight: 600 }}>
            ✦ {en ? `Detected: ${autoTripType}` : `Rilevato: ${autoTripType}`}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {types.map(t => (
            <button key={t.val} onClick={() => { setTripType(t.val); generate({ tripType: t.val }) }} style={{
              padding: '18px 12px', borderRadius: 16, border: `2px solid ${tripType === t.val ? 'var(--primary)' : 'var(--border)'}`,
              background: tripType === t.val ? 'var(--primary-dim)' : 'var(--card)',
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              WebkitTapHighlightColor: 'transparent', transition: 'border-color 0.15s',
            }}>
              <span style={{ fontSize: 28 }}>{t.emoji}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: tripType === t.val ? 'var(--primary-light)' : 'var(--text)' }}>{t.label}</span>
            </button>
          ))}
        </div>
        <button onClick={() => generate({ tripType: '' })} style={{ marginTop: 12, width: '100%', padding: '12px', borderRadius: 14, border: 'none', background: 'transparent', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer' }}>
          {en ? 'Skip, generate now' : 'Salta, genera ora'}
        </button>
      </div>
    )
  }

  /* Step 6 — Loading */
  if (step === 6) return (
    <div style={{ flex: 1, minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '32px 24px' }}>
      <div style={{ position: 'relative' }}>
        <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b, #fb923c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 40px rgba(245,158,11,0.35)', fontSize: 34 }}>✈️</div>
        {/* Animated ring */}
        <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '3px solid rgba(245,158,11,0.0)', borderTopColor: '#f59e0b', animation: 'spin 1.1s linear infinite' }} />
        <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', border: '2px solid rgba(245,158,11,0.2)', borderBottomColor: '#fb923c', animation: 'spin 1.7s linear infinite reverse' }} />
      </div>
      <div style={{ textAlign: 'center', maxWidth: 240 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 10 }}>
          {destination}
        </div>
        <div key={loadingPhase} style={{ fontSize: 14, color: 'var(--primary-light)', fontWeight: 600, animation: 'fadeIn 0.4s ease' }}>
          {loadingMessages[loadingPhase]}
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 5, justifyContent: 'center' }}>
          {loadingMessages.map((_, i) => (
            <div key={i} style={{ width: i === loadingPhase ? 16 : 5, height: 5, borderRadius: 99, background: i === loadingPhase ? 'var(--primary)' : 'var(--border)', transition: 'width 0.3s, background 0.3s' }} />
          ))}
        </div>
      </div>
    </div>
  )

  /* Step 7 — Results */
  return (
    <div style={{ padding: '16px 20px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>
            {result ? result.destination : destination}
          </div>
          {result && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{result.start_date} → {result.end_date} · {result.days} {en ? 'days' : 'giorni'}</div>}
        </div>
        <button onClick={reset} style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-light)', background: 'var(--primary-dim)', border: '1px solid var(--primary-border)', borderRadius: 10, padding: '6px 14px', cursor: 'pointer' }}>
          {en ? '↺ New' : '↺ Nuovo'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Weather strip */}
          <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
            <span>🌡️</span><span>{result.weather}</span>
          </div>

          {result.description && (
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.65 }}>{result.description}</div>
          )}

          {/* Outfit cards */}
          {result.outfits.map((outfit, i) => (
            <div key={i} style={{ padding: '14px', borderRadius: 18, background: 'var(--card)', border: '1px solid var(--border)', animation: `slideUp 0.35s ease ${i * 70}ms backwards` }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 2, letterSpacing: '-0.01em' }}>{outfit.name}</div>
              {outfit.occasion && <div style={{ fontSize: 12, color: 'var(--primary-light)', marginBottom: 10, fontWeight: 600 }}>{outfit.occasion}</div>}
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, marginBottom: outfit.notes ? 10 : 0 }}>
                {(outfit.ids || []).map(id => {
                  const g = getById(id)
                  return g ? (
                    <div key={id} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 56, height: 56, borderRadius: 12, background: g.bg_color || 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                        {g.photo_front ? <img src={imgUrl(g.photo_front)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>👕</div>}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name || g.category}</div>
                    </div>
                  ) : null
                })}
              </div>
              {outfit.notes && <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, fontStyle: 'italic' }}>{outfit.notes}</div>}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

/* ── Main component ──────────────────────────────────────────────────────────── */
export default function MobileWardrobe() {
  const garments        = useWardrobeStore(s => s.garments)
  const loading         = useWardrobeStore(s => s.loading)
  const init            = useWardrobeStore(s => s.init)
  const setNavLocked    = useWardrobeStore(s => s.setNavLocked)
  const CATEGORY_LABELS = useCategoryLabels()
  const t               = useT()

  const language      = useSettingsStore(s => s.language) || 'it'
  const compactCards  = useSettingsStore(s => s.compactCards)
  const wardrobeSortOrder  = useSettingsStore(s => s.wardrobeSortOrder || 'date_desc')
  const updateSetting      = useSettingsStore(s => s.updateSetting)

  const [search,        setSearch]        = useState('')
  const [activeCat,     setActiveCat]     = useState('')
  const [showSearch,    setShowSearch]    = useState(false)
  const [showSort,      setShowSort]      = useState(false)
  const [selected,      setSelected]      = useState(null)
  const [activeTab,     setActiveTab]     = useState(() => { try { return sessionStorage.getItem('mw_tab') || 'armadio' } catch { return 'armadio' } })
  const [betaDismissed, setBetaDismissed] = useState(() => !!localStorage.getItem('endyo_beta_dismissed'))
  const shoppingBusyRef = useRef(false) // true mentre shopping è in analisi/risultati
  const location = useLocation()
  const scrollAreaRef = useRef(null)
  const debouncedSearch = useDebounce(search, 260)
  const toast = useToast()
  const { refreshing, pullY } = usePullToRefresh(
    async () => { try { await init() } catch { toast.show(language === 'en' ? 'Failed to refresh' : 'Aggiornamento fallito', 'error') } },
    scrollAreaRef
  )

  useEffect(() => { init() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Skeleton count: use last known garment count from localStorage (saved after each load)
  const skeletonCount = useMemo(() => {
    try { return Math.max(parseInt(localStorage.getItem('endyo_last_count') || '8', 10), 4) } catch { return 8 }
  }, [])
  useEffect(() => {
    if (!loading && garments.length > 0) {
      try { localStorage.setItem('endyo_last_count', String(garments.length)) } catch {}
    }
  }, [loading, garments.length])

  // Animate cards only when returning to page with cached data; suppress on first load to avoid
  // misalignment between skeleton placeholders and real cards appearing below them.
  const animateCards = useRef(garments.length > 0)
  useEffect(() => () => setNavLocked(false), [setNavLocked]) // clear lock on unmount
  useEffect(() => { try { sessionStorage.setItem('mw_tab', activeTab) } catch {} }, [activeTab])

  // Reset to armadio tab when tab bar icon is tapped while already on this page
  useEffect(() => {
    if (!location.state?.resetAt) return
    setActiveTab('armadio')
    setActiveCat('')
    setSearch('')
    setShowSearch(false)
  }, [location.state?.resetAt]) // eslint-disable-line

  const handleTabSwitch = (tab) => {
    if (shoppingBusyRef.current && activeTab === 'shopping' && tab !== 'shopping') return
    hapticLight()
    setActiveTab(tab)
  }

  /* Sort options */
  const SORT_OPTIONS = language === 'en' ? [
    { id: 'date_desc',     label: 'Newest first' },
    { id: 'date_asc',      label: 'Oldest first' },
    { id: 'category_asc',  label: 'Category'     },
    { id: 'color_asc',     label: 'Color'        },
    { id: 'brand_asc',     label: 'Brand A→Z'   },
  ] : [
    { id: 'date_desc',     label: 'Più recenti'  },
    { id: 'date_asc',      label: 'Più vecchi'   },
    { id: 'category_asc',  label: 'Categoria'    },
    { id: 'color_asc',     label: 'Colore'       },
    { id: 'brand_asc',     label: 'Brand A→Z'   },
  ]

  /* Categories derived from actual garments */
  const categories = useMemo(
    () => [...new Set(garments.map(g => g.category).filter(Boolean))].sort(),
    [garments]
  )

  /* Filter + Sort */
  const filtered = useMemo(() => {
    let list = garments
    if (activeCat) list = list.filter(g => g.category === activeCat)
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(g =>
        (g.name || '').toLowerCase().includes(q) ||
        (g.brand || '').toLowerCase().includes(q) ||
        (g.color_primary || '').toLowerCase().includes(q)
      )
    }
    list = [...list]
    switch (wardrobeSortOrder) {
      case 'date_asc':     list.sort((a, b) => (a.id || 0) - (b.id || 0)); break
      case 'category_asc': list.sort((a, b) => (a.category || '').localeCompare(b.category || '')); break
      case 'color_asc':    list.sort((a, b) => normalizeColor(a.color_primary || '').localeCompare(normalizeColor(b.color_primary || ''))); break
      case 'brand_asc':    list.sort((a, b) => (a.brand || '').localeCompare(b.brand || '')); break
      default:             list.sort((a, b) => (b.id || 0) - (a.id || 0)); break // date_desc
    }
    return list
  }, [garments, activeCat, debouncedSearch, wardrobeSortOrder])

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
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Sort popover backdrop */}
      {showSort && (
        <div
          onClick={() => setShowSort(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 150 }}
        />
      )}

      {/* ── Fixed header (flexShrink so it never scrolls) ───────────────────────── */}
      <div style={{
        flexShrink: 0, position: 'relative', zIndex: 160,
        background: 'var(--bg)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        paddingTop: 16,
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* Sort button */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowSort(s => !s)}
                  style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: showSort || wardrobeSortOrder !== 'date_desc' ? 'var(--primary-dim)' : 'var(--card)',
                    border: `1px solid ${showSort || wardrobeSortOrder !== 'date_desc' ? 'var(--primary-border)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: showSort || wardrobeSortOrder !== 'date_desc' ? 'var(--primary-light)' : 'var(--text-muted)',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M7 12h10M11 18h2"/>
                  </svg>
                </button>
                {showSort && (
                  <div style={{
                    position: 'absolute', top: 48, right: 0, zIndex: 200,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                    overflow: 'hidden',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08), 0 12px 40px rgba(0,0,0,0.14), 0 0 0 1px var(--border)',
                    minWidth: 190,
                    transformOrigin: 'top right',
                    animation: 'dropdownOpen 0.18s cubic-bezier(0.2,0,0,1.1) forwards',
                  }}>
                    {SORT_OPTIONS.map((opt, i) => {
                      const active = wardrobeSortOrder === opt.id
                      return (
                        <button
                          key={opt.id}
                          onClick={() => { updateSetting('wardrobeSortOrder', opt.id); setShowSort(false) }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            width: '100%', padding: '13px 16px', textAlign: 'left',
                            background: active ? 'var(--primary-dim)' : 'transparent',
                            color: active ? 'var(--primary-light)' : 'var(--text)',
                            fontSize: 14, fontWeight: active ? 700 : 400,
                            border: 'none',
                            borderBottom: i < SORT_OPTIONS.length - 1 ? '1px solid var(--border)' : 'none',
                            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                            transition: 'background 0.12s',
                          }}
                        >
                          <span style={{ flex: 1 }}>{opt.label}</span>
                          {active && (
                            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6 9 17l-5-5"/>
                            </svg>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              {/* Search button */}
              <button
                onClick={() => { setShowSearch(s => !s); if (showSearch) setSearch(''); setShowSort(false) }}
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
            </div>
          )}
        </div>

        {/* Search input (Armadio only) */}
        {activeTab === 'armadio' && showSearch && (
          <div style={{ paddingBottom: 10, transformOrigin: 'top center', animation: 'searchOpen 0.18s ease forwards' }}>
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
          <button style={tabStyle(activeTab === 'armadio')} onClick={() => handleTabSwitch('armadio')}>
            {language === 'en' ? 'Wardrobe' : 'Armadio'}
          </button>
          <button style={tabStyle(activeTab === 'shopping')} onClick={() => handleTabSwitch('shopping')}>
            Shopping
          </button>
          <button style={tabStyle(activeTab === 'viaggio')} onClick={() => handleTabSwitch('viaggio')}>
            {language === 'en' ? 'Travel' : 'Viaggio'}
          </button>
          <button style={tabStyle(activeTab === 'analisi')} onClick={() => handleTabSwitch('analisi')}>
            {language === 'en' ? 'Analysis' : 'Analisi'}
          </button>
        </div>
      </div>

      {/* ── Scrollable content area ─────────────────────────────────────────────── */}
      <div ref={scrollAreaRef} className="wardrobe-scroll-area" style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>

      {/* ── Pull-to-refresh indicator ────────────────────────────────────────────── */}
      {(pullY > 0 || refreshing) && (
        <div className="ptr-indicator" style={{ height: refreshing ? 36 : pullY * 0.6 }}>
          <div className={refreshing ? 'spinner spinner-sm' : ''} style={!refreshing ? { opacity: Math.min(pullY / 30, 1) } : {}} />
          {refreshing && <span style={{ fontSize: 11 }}>{language === 'en' ? 'Refreshing…' : 'Aggiornamento…'}</span>}
        </div>
      )}

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

          {/* Beta notice (dismissible) */}
          {!betaDismissed && (
            <div style={{
              margin: '0 12px 8px',
              padding: '10px 12px',
              background: 'rgba(251,191,36,0.07)',
              border: '1px solid rgba(251,191,36,0.2)',
              borderRadius: 10,
              display: 'flex', gap: 8, alignItems: 'flex-start',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>🚧</span>
              <div style={{ flex: 1, fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {language === 'en'
                  ? <>{`Beta version. Bugs may occur.`}<br/><a href="mailto:bugs@endyo.it" style={{ color: '#fbbf24', textDecoration: 'none', fontWeight: 600 }}>Report one →</a></>
                  : <>{`Versione beta. Potrebbero esserci bug.`}<br/><a href="mailto:bugs@endyo.it" style={{ color: '#fbbf24', textDecoration: 'none', fontWeight: 600 }}>Segnalane uno →</a></>}
              </div>
              <button
                onClick={() => { setBetaDismissed(true); localStorage.setItem('endyo_beta_dismissed', '1') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 2, flexShrink: 0 }}
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          )}

          {/* Grid / Sections */}
          <div style={{ flex: 1, padding: '4px 12px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}>
            {loading && garments.length === 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: compactCards ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: compactCards ? 6 : 10 }}>
                {Array.from({ length: skeletonCount }).map((_, i) => (
                  <div key={i} className="skeleton-card">
                    <div className="skeleton" style={{ height: compactCards ? 'var(--card-img-h-compact)' : 'var(--card-img-h)', borderRadius: 0 }} />
                    <div style={{ padding: compactCards ? '5px 7px 7px' : '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div className="skeleton" style={{ height: 11, width: '70%' }} />
                      <div className="skeleton" style={{ height: 8, width: compactCards ? '50%' : '45%' }} />
                      {!compactCards && <div className="skeleton" style={{ height: 8, width: '60%' }} />}
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState hasGarments={garments.length > 0} />
            ) : wardrobeSortOrder === 'color_asc' && activeCat === '' ? (
              /* ── Color-grouped sections ── */
              (() => {
                const colorMap = {}
                filtered.forEach(g => {
                  const norm = normalizeColor(g.color_primary) || '—'
                  const key = norm.toLowerCase()
                  if (!colorMap[key]) colorMap[key] = { label: norm, hex: g.color_hex || g.color_palette?.[0]?.hex || null, items: [] }
                  colorMap[key].items.push(g)
                })
                return Object.values(colorMap).sort((a, b) => b.items.length - a.items.length).map(group => (
                  <div key={group.label} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px 10px', borderBottom: '1px solid var(--border)', marginBottom: 10 }}>
                      {group.hex && (
                        <span style={{ width: 13, height: 13, borderRadius: '50%', background: group.hex, border: '1.5px solid rgba(0,0,0,0.12)', flexShrink: 0, display: 'inline-block' }} />
                      )}
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize', letterSpacing: '-0.01em' }}>
                        {group.label}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>({group.items.length})</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: compactCards ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: compactCards ? 6 : 10, alignItems: 'stretch' }}>
                      {group.items.map((g, i) => (
                        <div key={g.id} style={{ animation: animateCards.current ? `slideUp 0.3s ease ${Math.min(i * 35, 250)}ms backwards` : 'none', height: '100%', minWidth: 0 }}>
                          <GarmentCard g={g} onClick={() => setSelected(g)} compact={compactCards} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              })()
            ) : wardrobeSortOrder === 'category_asc' && activeCat === '' ? (
              /* ── Category-grouped sections ── */
              (() => {
                const catMap = {}
                filtered.forEach(g => {
                  const key = (g.category || '').trim() || '__none__'
                  if (!catMap[key]) catMap[key] = { key, label: CATEGORY_LABELS[key] || key, items: [] }
                  catMap[key].items.push(g)
                })
                return Object.values(catMap).sort((a, b) => a.label.localeCompare(b.label)).map(group => (
                  <div key={group.key} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 2px 10px', borderBottom: '1px solid var(--border)', marginBottom: 10 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize', letterSpacing: '-0.01em' }}>
                        {group.label}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>({group.items.length})</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: compactCards ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: compactCards ? 6 : 10, alignItems: 'stretch' }}>
                      {group.items.map((g, i) => (
                        <div key={g.id} style={{ animation: animateCards.current ? `slideUp 0.3s ease ${Math.min(i * 35, 250)}ms backwards` : 'none', height: '100%', minWidth: 0 }}>
                          <GarmentCard g={g} onClick={() => setSelected(g)} compact={compactCards} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              })()
            ) : wardrobeSortOrder === 'brand_asc' && activeCat === '' ? (
              /* ── Brand-grouped sections ── */
              (() => {
                const brandMap = {}
                filtered.forEach(g => {
                  const key = (g.brand || '').trim() || (language === 'en' ? 'No brand' : 'Senza brand')
                  if (!brandMap[key]) brandMap[key] = { label: key, items: [] }
                  brandMap[key].items.push(g)
                })
                return Object.values(brandMap).sort((a, b) => a.label.localeCompare(b.label)).map(group => (
                  <div key={group.label} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 2px 10px', borderBottom: '1px solid var(--border)', marginBottom: 10 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                        {group.label}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>({group.items.length})</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: compactCards ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: compactCards ? 6 : 10, alignItems: 'stretch' }}>
                      {group.items.map((g, i) => (
                        <div key={g.id} style={{ animation: animateCards.current ? `slideUp 0.3s ease ${Math.min(i * 35, 250)}ms backwards` : 'none', height: '100%', minWidth: 0 }}>
                          <GarmentCard g={g} onClick={() => setSelected(g)} compact={compactCards} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              })()
            ) : (
              /* ── Flat grid: date, name, or category filter active ── */
              <div style={{ display: 'grid', gridTemplateColumns: compactCards ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: compactCards ? 6 : 10, alignItems: 'stretch' }}>
                {filtered.map((g, i) => (
                  <div key={g.id} style={{ animation: animateCards.current ? `slideUp 0.38s ease ${Math.min(i * 50, 380)}ms backwards` : 'none', height: '100%', minWidth: 0 }}>
                    <GarmentCard g={g} onClick={() => setSelected(g)} compact={compactCards} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Shopping tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'shopping' && (
        <div style={{ animation: 'slideUp 0.38s ease backwards', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}>
          <ShoppingTab busyRef={shoppingBusyRef} />
        </div>
      )}

      {/* ── Viaggio tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'viaggio' && (
        <div style={{ animation: 'slideUp 0.38s ease backwards' }}>
          <TravelTab />
        </div>
      )}

      {/* ── Analisi tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'analisi' && (
        <div style={{ animation: 'slideUp 0.38s ease backwards', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}>
          <AnalisiTab />
        </div>
      )}

      </div>{/* end wardrobe-scroll-area */}

      {/* ── Garment detail modal ────────────────────────────────────────────────── */}
      {selected && (
        <MobileGarmentSheet garment={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
