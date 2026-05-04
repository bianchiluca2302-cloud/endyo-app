import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeGarment, confirmGarment, createGarmentManual, imgUrl, fetchChatQuota } from '../api/client'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import { useT, useCategoryLabels, useUploadCategories, useTagTranslator } from '../i18n'


/* ── Duplicate check (same as Upload.jsx) ────────────────────────────────────── */
function findDuplicates(analysis, garments) {
  const cat   = analysis.category
  const brand = (analysis.brand || '').toLowerCase().trim()
  const color = (analysis.color_primary || '').toLowerCase().trim()
  const name  = (analysis.name || '').toLowerCase().trim()
  return garments.filter(g => {
    if (g.category !== cat) return false
    const sameBrand = !!(brand && (g.brand||'').toLowerCase().trim() === brand)
    const sameColor = !!(color && (g.color_primary||'').toLowerCase().trim() === color)
    const sameName  = !!(name  && ((g.name||'').toLowerCase().includes(name) || name.includes((g.name||'').toLowerCase())))
    return sameBrand && sameColor && sameName
  })
}

/* ── Icons ───────────────────────────────────────────────────────────────────── */
const CameraIcon = () => (
  <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
)

const CheckIcon = () => (
  <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5"/>
  </svg>
)

const ChevronIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18l6-6-6-6"/>
  </svg>
)

/* ── Photo slot ──────────────────────────────────────────────────────────────── */
// Usa <input type="file" accept="image/*"> senza capture: il sistema operativo
// mostra il pannello nativo con le opzioni "Scatta foto / Libreria / File".
function PhotoSlot({ label, preview, onChange, required, small, style: extraStyle = {} }) {
  const inputRef = useRef(null)

  return (
    <div
      onClick={() => inputRef.current?.click()}
      style={{
        borderRadius: small ? 14 : 20,
        border: `2px dashed ${preview ? 'var(--primary-border)' : 'var(--border)'}`,
        background: preview ? 'transparent' : 'var(--card)',
        cursor: 'pointer',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: small ? 5 : 8,
        WebkitTapHighlightColor: 'transparent',
        transition: 'border-color 0.2s',
        ...extraStyle,
      }}
    >
      {preview ? (
        <img src={preview} alt={label}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
        <>
          <div style={{ color: required ? 'var(--primary-light)' : 'var(--text-dim)', opacity: small ? 0.7 : 1 }}>
            {small
              ? <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
              : <CameraIcon />
            }
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: small ? 11 : 14, fontWeight: 600, color: required ? 'var(--text)' : 'var(--text-muted)' }}>
              {label}
            </div>
            {required && (
              <div style={{ fontSize: 11, color: 'var(--primary-light)', marginTop: 2 }}>Obbligatoria</div>
            )}
          </div>
        </>
      )}
      {/* Input nativo: apre il pannello OS (Scatta / Libreria / File) */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files[0]
          if (f) onChange(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/* ── Analyzing / Confirming spinner ─────────────────────────────────────────── */
function LoadingScreen({ title, subtitle }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32,
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'var(--primary-dim)',
        border: '1px solid var(--primary-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>{subtitle}</div>
      </div>
    </div>
  )
}

/* ── EXIF orientation fix ────────────────────────────────────────────────────── */
// I browser moderni (Safari 15+, Chrome, Firefox) applicano automaticamente
// l'orientamento EXIF quando si disegna un'immagine su canvas tramite drawImage().
// Basta ridisegnare su canvas per "fissare" l'orientamento e rimuovere l'EXIF,
// senza dover leggere/interpretare manualmente i tag — il che evitava double-rotation.
async function fixImageOrientation(file) {
  if (!file.type.startsWith('image/')) return file

  const url = URL.createObjectURL(file)
  const img = await new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url
  })
  URL.revokeObjectURL(url)

  const canvas = document.createElement('canvas')
  canvas.width  = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  // drawImage applica automaticamente l'orientamento EXIF su browser moderni
  ctx.drawImage(img, 0, 0)

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(
      new File([blob], file.name, { type: 'image/jpeg' })
    ), 'image/jpeg', 0.93)
  })
}

/* ── Cache a livello di modulo: sopravvive ai re-mount iOS ───────────────────── */
// Su iOS Safari, aprire il file picker può causare il reset dello stato React.
// Salvando i File e le preview URL fuori dal componente, le foto persistono.
const _photoCache   = { front: null, back: null, label: null }
const _previewCache = { front: null, back: null, label: null }

/* ── Main component ──────────────────────────────────────────────────────────── */
export default function MobileUpload() {
  const navigate    = useNavigate()
  const addGarment  = useWardrobeStore(s => s.addGarment)
  const garments    = useWardrobeStore(s => s.garments)
  const language    = useSettingsStore(s => s.language || 'it')
  const t           = useT()
  const CATEGORIES  = useUploadCategories()
  const CATEGORY_LABELS = useCategoryLabels()
  const translateTag    = useTagTranslator()

  // Inizializza da cache: se il componente si rimonta (iOS), le foto non spariscono
  const [photos,    setPhotos]   = useState(() => ({ ..._photoCache }))
  const [previews,  setPreviews] = useState(() => ({ ..._previewCache }))
  const [category,  setCategory] = useState('')
  const [loading,   setLoading]  = useState(false)
  const [error,     setError]    = useState(null)
  const [step,      setStep]     = useState('upload')
  const [analysis,  setAnalysis] = useState(null)
  const [tmpFiles,  setTmpFiles] = useState(null)
  const [duplicates, setDuplicates] = useState([])
  const [result,    setResult]   = useState(null)
  const [showCatSheet, setShowCatSheet] = useState(false)

  // Quota upload giornaliera — inizializza subito da cache localStorage, poi aggiorna
  const QUOTA_CACHE_KEY = 'endyo_upload_quota'
  const [uploadQuota, setUploadQuota] = useState(() => {
    try {
      const c = localStorage.getItem(QUOTA_CACHE_KEY)
      return c ? JSON.parse(c) : null
    } catch { return null }
  })
  useEffect(() => {
    fetchChatQuota()
      .then(q => {
        const quota = {
          remaining: q.upload_remaining_day ?? null,
          limit:     q.upload_limit_day     ?? null,
          extra:     q.upload_extra         ?? 0,
        }
        setUploadQuota(quota)
        try { localStorage.setItem(QUOTA_CACHE_KEY, JSON.stringify(quota)) } catch {}
      })
      .catch(() => {})
  }, [])

  // Stato form manuale (quando crediti esauriti)
  const [manualForm, setManualForm] = useState({ name: '', category: '', brand: '', color: '', size: '' })
  const [manualLoading, setManualLoading] = useState(false)
  const [manualError,   setManualError]   = useState(null)

  const handleFile = async (type, file) => {
    if (!file) return
    // Corregge l'orientamento EXIF (es. foto specchiata da fotocamera frontale)
    const fixed = await fixImageOrientation(file).catch(() => file)
    const url = URL.createObjectURL(fixed)
    _photoCache[type]   = fixed
    _previewCache[type] = url
    setPhotos(p => ({ ...p, [type]: fixed }))
    setPreviews(p => ({ ...p, [type]: url }))
  }

  const handleAnalyze = async () => {
    if (!photos.front) { setError(t('uploadNeedFront')); return }
    setError(null); setLoading(true); setStep('analyzing')
    try {
      const fd = new FormData()
      fd.append('photo_front', photos.front)
      if (photos.back)  fd.append('photo_back',  photos.back)
      if (photos.label) fd.append('photo_label', photos.label)
      if (category)     fd.append('category',    category)
      fd.append('language', language)
      const data = await analyzeGarment(fd)
      setAnalysis(data.analysis)
      setTmpFiles({ tmp_front: data.tmp_front, tmp_back: data.tmp_back, tmp_label: data.tmp_label })
      setDuplicates(findDuplicates(data.analysis, garments))
      setStep('review')
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
      setStep('upload')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    setLoading(true); setStep('confirming')
    try {
      const garment = await confirmGarment({ ...tmpFiles, analysis, category: analysis.category })
      addGarment(garment)
      // Pulisci la cache del modulo subito dopo il salvataggio: se l'utente
      // naviga via dalla schermata "done" senza premere "Aggiungi altro",
      // le foto non riappaiono al prossimo accesso alla pagina.
      _photoCache.front   = null; _photoCache.back   = null; _photoCache.label   = null
      _previewCache.front = null; _previewCache.back = null; _previewCache.label = null
      setResult(garment)
      setStep('done')
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
      setStep('review')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    _photoCache.front   = null; _photoCache.back   = null; _photoCache.label   = null
    _previewCache.front = null; _previewCache.back = null; _previewCache.label = null
    setPhotos({ front: null, back: null, label: null })
    setPreviews({ front: null, back: null, label: null })
    setCategory(''); setResult(null); setAnalysis(null)
    setTmpFiles(null); setDuplicates([]); setError(null); setStep('upload')
    setManualForm({ name: '', category: '', brand: '', color: '', size: '' })
    setManualError(null)
  }

  const handleManualSubmit = async () => {
    if (!manualForm.name.trim() || !manualForm.category) {
      setManualError('Nome e categoria sono obbligatori'); return
    }
    setManualLoading(true); setManualError(null)
    try {
      const fd = new FormData()
      fd.append('name',          manualForm.name.trim())
      fd.append('category',      manualForm.category)
      if (manualForm.brand)      fd.append('brand',         manualForm.brand.trim())
      if (manualForm.color)      fd.append('color_primary', manualForm.color.trim())
      if (manualForm.size)       fd.append('size',          manualForm.size.trim())
      if (photos.front)          fd.append('photo_front',   photos.front)
      const garment = await createGarmentManual(fd)
      addGarment(garment)
      // Pulisci la cache del modulo subito dopo il salvataggio
      _photoCache.front   = null; _photoCache.back   = null; _photoCache.label   = null
      _previewCache.front = null; _previewCache.back = null; _previewCache.label = null
      setResult(garment); setStep('done')
    } catch (e) {
      setManualError(e.response?.data?.detail || e.message)
    } finally {
      setManualLoading(false)
    }
  }

  /* ── STEP: analyzing ─────────────────────────────────────────────────────── */
  if (step === 'analyzing') return (
    <LoadingScreen title={t('uploadMobileAnalyzingTitle')} subtitle={t('uploadMobileAnalyzingDesc')} />
  )

  /* ── STEP: confirming ────────────────────────────────────────────────────── */
  if (step === 'confirming') return (
    <LoadingScreen title={t('uploadMobileSavingTitle')} subtitle={t('uploadMobileSavingDesc')} />
  )

  /* ── STEP: done ──────────────────────────────────────────────────────────── */
  if (step === 'done' && result) return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 28, gap: 20, background: 'var(--bg)',
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: 'rgba(16,185,129,0.12)', border: '2px solid rgba(16,185,129,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981',
      }}>
        <CheckIcon />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>{t('uploadAddedTitle')}</div>
        <div style={{ fontSize: 15, color: 'var(--text-muted)', marginTop: 6 }}>{result.name}</div>
      </div>

      {/* Summary card */}
      <div style={{
        width: '100%', background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 18, padding: '16px 20px',
      }}>
        {[
          [CATEGORY_LABELS[result.category] || result.category, t('uploadFieldCat')],
          [result.brand || '—', 'Brand'],
          [result.color_primary || '—', t('uploadFieldColor')],
          [result.size || '—', t('uploadFieldSize')],
        ].map(([v, k]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{k}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
        <button onClick={handleReset} style={{
          flex: 1, padding: '14px 0', borderRadius: 14, border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--text)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
        }}>
          {t('uploadMobileAddMore')}
        </button>
        <button onClick={() => navigate('/wardrobe')} style={{
          flex: 1, padding: '14px 0', borderRadius: 14, border: 'none',
          background: 'var(--primary)', color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer',
        }}>
          {t('uploadMobileWardrobeBtn')}
        </button>
      </div>
    </div>
  )

  /* ── STEP: review ────────────────────────────────────────────────────────── */
  if (step === 'review' && analysis) return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 100px', background: 'var(--bg)' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4, color: 'var(--text)' }}>
        {t('uploadMobileCheckTitle')}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
        {t('uploadMobileCheckDesc')}
      </p>

      {/* Foto + dati AI */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        {previews.front && (
          <div style={{ width: 100, flexShrink: 0, borderRadius: 14, overflow: 'hidden', background: 'var(--card)', aspectRatio: '3/4' }}>
            <img src={previews.front} alt="fronte" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>{analysis.name}</div>
          {[
            [CATEGORY_LABELS[analysis.category] || analysis.category, t('uploadFieldCat')],
            [analysis.brand || '—', 'Brand'],
            [analysis.color_primary || '—', t('uploadFieldColor')],
            [analysis.size || '—', t('uploadFieldSize')],
          ].map(([v, k]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{k}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tags */}
      {(analysis.style_tags || analysis.season_tags) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {[...(analysis.style_tags || []), ...(analysis.season_tags || [])].map(tag => (
            <span key={tag} style={{
              padding: '4px 10px', borderRadius: 99,
              background: 'var(--primary-dim)', border: '1px solid var(--primary-border)',
              color: 'var(--primary-light)', fontSize: 12, fontWeight: 600,
            }}>{translateTag(tag)}</span>
          ))}
        </div>
      )}

      {/* Avviso duplicato */}
      {duplicates.length > 0 && (
        <div style={{
          background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.3)',
          borderRadius: 14, padding: '12px 16px', marginBottom: 20,
          fontSize: 13, color: '#fbbf24', lineHeight: 1.5,
        }}>
          ⚠️ {t('uploadDuplicateWarning')}: <strong>{duplicates[0].name}</strong>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 14, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {/* Azioni */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={handleReset} style={{
          flex: 1, padding: '14px 0', borderRadius: 14, border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--text)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
        }}>
          {t('cancel')}
        </button>
        <button onClick={handleConfirm} disabled={loading} style={{
          flex: 2, padding: '14px 0', borderRadius: 14, border: 'none',
          background: 'var(--primary)', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer',
        }}>
          {t('uploadMobileSaveBtn')}
        </button>
      </div>
    </div>
  )

  /* ── STEP: upload ────────────────────────────────────────────────────────── */
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 100px', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', margin: 0 }}>
            Aggiungi capo
          </h1>
          {/* Badge quota giornaliera */}
          {uploadQuota !== null && uploadQuota.limit !== null && (() => {
            const UNLIMITED = 999
            if (uploadQuota.limit >= UNLIMITED) return null
            const rem   = uploadQuota.remaining ?? 0
            const lim   = uploadQuota.limit
            const extra = uploadQuota.extra ?? 0
            const pct   = Math.min(100, Math.round(((lim - rem) / lim) * 100))
            const color = rem === 0 ? '#ef4444' : rem <= 2 ? '#f59e0b' : 'var(--primary-light)'
            const bg    = rem === 0 ? 'rgba(239,68,68,0.08)' : rem <= 2 ? 'rgba(245,158,11,0.10)' : 'var(--primary-dim)'
            const border= rem === 0 ? 'rgba(239,68,68,0.25)' : rem <= 2 ? 'rgba(245,158,11,0.3)' : 'var(--primary-border)'
            return (
              <div style={{
                flexShrink: 0, background: bg, border: `1px solid ${border}`,
                borderRadius: 10, padding: '6px 10px', textAlign: 'center', minWidth: 70,
              }}>
                <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{rem}</div>
                <div style={{ fontSize: 9, color, opacity: 0.75, marginTop: 1, letterSpacing: '0.03em' }}>
                  di {lim} oggi
                </div>
                {/* Barra progresso */}
                <div style={{ height: 3, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden', marginTop: 5 }}>
                  <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`, background: color, transition: 'width 0.4s' }} />
                </div>
                {extra > 0 && (
                  <div style={{ fontSize: 9, color: '#16a34a', marginTop: 3 }}>+{extra} extra</div>
                )}
              </div>
            )
          })()}
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24, marginTop: 4 }}>
          Scatta o carica una foto — l'AI fa il resto
        </p>
      </div>

      {/* Suggerimento foto */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--primary-dim)', border: '1px solid var(--primary-border)',
        borderRadius: 10, padding: '9px 12px', marginBottom: 12,
      }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>☀️</span>
        <span style={{ fontSize: 12, color: 'var(--primary-light)', lineHeight: 1.4 }}>
          Per risultati migliori usa <strong>luce naturale</strong> e uno <strong>sfondo neutro</strong> (bianco o grigio)
        </span>
      </div>

      {/* Griglia foto: principale a sx, retro+etichetta a dx */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 8,
        marginBottom: 14,
        height: 'clamp(220px, 38dvh, 300px)',
      }}>
        {/* Foto frontale — occupa entrambe le righe */}
        <PhotoSlot
          label="Foto frontale"
          preview={previews.front}
          onChange={f => handleFile('front', f)}
          required
          style={{ gridRow: '1 / 3', height: '100%', borderRadius: 20 }}
        />
        {/* Retro */}
        <PhotoSlot
          label="Retro"
          preview={previews.back}
          onChange={f => handleFile('back', f)}
          small
          style={{ height: '100%' }}
        />
        {/* Etichetta */}
        <PhotoSlot
          label="Etichetta"
          preview={previews.label}
          onChange={f => handleFile('label', f)}
          small
          style={{ height: '100%' }}
        />
      </div>

      {/* Categoria (opzionale) */}
      <button
        onClick={() => setShowCatSheet(true)}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: 14,
          background: 'var(--surface)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', marginBottom: 20, WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: category ? 'var(--primary-dim)' : 'var(--card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={category ? 'var(--primary-light)' : 'var(--text-dim)'} strokeWidth={2} strokeLinecap="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 1 }}>Categoria (opzionale)</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: category ? 'var(--text)' : 'var(--text-muted)' }}>
              {category ? (CATEGORY_LABELS[category] || category) : 'Lascia scegliere all\'AI'}
            </div>
          </div>
        </div>
        <ChevronIcon />
      </button>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 14, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {/* CTA — Analizza AI oppure form manuale se crediti esauriti */}
      {(() => {
        const rem   = uploadQuota?.remaining ?? 1
        const extra = uploadQuota?.extra     ?? 0
        const quotaOk = uploadQuota === null || rem > 0 || extra > 0

        if (quotaOk) {
          return (
            <button
              onClick={handleAnalyze}
              disabled={!photos.front || loading}
              style={{
                width: '100%', padding: '16px', borderRadius: 16, border: 'none',
                background: photos.front ? 'var(--primary)' : 'var(--primary-dim)',
                color: photos.front ? 'white' : 'var(--text-dim)',
                fontSize: 16, fontWeight: 700, cursor: photos.front ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              Analizza con AI
            </button>
          )
        }

        // Crediti esauriti → form manuale
        return (
          <div style={{
            border: '1px solid var(--border)', borderRadius: 16,
            overflow: 'hidden',
          }}>
            {/* Banner crediti esauriti */}
            <div style={{
              background: 'rgba(239,68,68,0.07)', borderBottom: '1px solid rgba(239,68,68,0.2)',
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, color: '#f87171',
            }}>
              <span style={{ fontSize: 15 }}>⚠️</span>
              <div>
                <strong>Crediti AI esauriti per oggi</strong> — puoi comunque inserire il capo a mano.
                {extra === 0 && <span style={{ color: 'var(--text-dim)' }}> Acquista crediti extra in Impostazioni.</span>}
              </div>
            </div>

            {/* Campi form manuale */}
            <div style={{ padding: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { key: 'name',     label: 'Nome capo *',      placeholder: 'es. Felpa oversize grigia' },
                { key: 'brand',    label: 'Brand',             placeholder: 'es. Zara, H&M…' },
                { key: 'color',    label: 'Colore principale', placeholder: 'es. Grigio melange' },
                { key: 'size',     label: 'Taglia',            placeholder: 'es. M, 42, L…' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 3 }}>{label}</label>
                  <input
                    className="input"
                    value={manualForm[key]}
                    onChange={e => setManualForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={{ width: '100%' }}
                  />
                </div>
              ))}

              {/* Categoria — bottone che apre lo sheet esistente */}
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 3 }}>Categoria *</label>
                <button
                  onClick={() => setShowCatSheet(true)}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 10,
                    background: 'var(--surface)', border: `1px solid ${manualForm.category ? 'var(--primary)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                    color: manualForm.category ? 'var(--text)' : 'var(--text-muted)', fontSize: 14,
                  }}
                >
                  <span>{manualForm.category ? (CATEGORY_LABELS[manualForm.category] || manualForm.category) : 'Scegli categoria…'}</span>
                  <ChevronIcon />
                </button>
              </div>

              {manualError && (
                <div style={{ fontSize: 12, color: '#f87171', padding: '6px 0' }}>{manualError}</div>
              )}

              <button
                onClick={() => {
                  setManualForm(f => ({ ...f, category: manualForm.category || category || '' }))
                  handleManualSubmit()
                }}
                disabled={!manualForm.name.trim() || !manualForm.category || manualLoading}
                style={{
                  width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                  background: manualForm.name && manualForm.category ? 'var(--primary)' : 'var(--border)',
                  color: manualForm.name && manualForm.category ? 'white' : 'var(--text-dim)',
                  fontSize: 15, fontWeight: 700,
                  cursor: manualForm.name && manualForm.category ? 'pointer' : 'not-allowed',
                  margin: '4px 0 14px',
                }}
              >
                {manualLoading ? 'Salvataggio…' : 'Salva capo manualmente'}
              </button>
            </div>
          </div>
        )
      })()}

      {/* Category sheet overlay */}
      {showCatSheet && (
        <div
          onClick={() => setShowCatSheet(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 800, display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', background: 'var(--surface)',
              borderRadius: '24px 24px 0 0',
              padding: '12px 0 calc(env(safe-area-inset-bottom,0px) + 20px)',
              maxHeight: '75dvh', overflowY: 'auto',
            }}
          >
            {/* Handle */}
            <div style={{ width: 40, height: 4, borderRadius: 99, background: 'var(--border)', margin: '0 auto 16px' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', padding: '0 20px 12px' }}>Scegli categoria</div>
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => { setCategory(cat.value); setManualForm(f => ({ ...f, category: cat.value })); setShowCatSheet(false) }}
                style={{
                  width: '100%', padding: '14px 20px', background: 'transparent',
                  border: 'none', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderBottom: '1px solid var(--border)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{ fontSize: 15, color: category === cat.value ? 'var(--primary-light)' : 'var(--text)', fontWeight: category === cat.value ? 600 : 400 }}>
                  {cat.label}
                </span>
                {category === cat.value && (
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--primary-light)" strokeWidth={2.5} strokeLinecap="round">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
