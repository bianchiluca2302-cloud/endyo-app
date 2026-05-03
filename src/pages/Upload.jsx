import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeGarment, confirmGarment, fetchChatQuota } from '../api/client'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import { imgUrl } from '../api/client'
import { useT, useCategoryLabels, useUploadCategories, useTagTranslator } from '../i18n'
import { IconCheckCircle, IconAlertTriangle, IconCamera, IconTag, IconShirt } from '../components/Icons'
import useIsMobile from '../hooks/useIsMobile'

// STEPS, CATEGORIES, CATEGORY_LABELS are built dynamically inside the component using hooks

/** Trova duplicati reali: stesso capo, non solo stessa categoria.
 *  Richiede almeno 2 corrispondenze su 3 tra: brand, colore, nome.
 *  Es. Nike nera ≠ Nike bianca (solo brand uguale → non duplicato).
 *  Es. Nike nera = Nike nera (brand + colore → duplicato).
 */
function findDuplicates(analysis, garments) {
  const cat   = analysis.category
  const brand = (analysis.brand || '').toLowerCase().trim()
  const color = (analysis.color_primary || '').toLowerCase().trim()
  const name  = (analysis.name || '').toLowerCase().trim()

  return garments.filter(g => {
    if (g.category !== cat) return false

    const gBrand = (g.brand || '').toLowerCase().trim()
    const gColor = (g.color_primary || '').toLowerCase().trim()
    const gName  = (g.name || '').toLowerCase().trim()

    const sameBrand = !!(brand && gBrand && brand === gBrand)
    const sameColor = !!(color && gColor && color === gColor)
    const sameName  = !!(name  && gName  && (name.includes(gName) || gName.includes(name)))

    // Duplicato solo se tutti e 3 i criteri coincidono
    return sameBrand && sameColor && sameName
  })
}

export default function Upload() {
  const navigate  = useNavigate()
  const addGarment = useWardrobeStore(s => s.addGarment)
  const garments   = useWardrobeStore(s => s.garments)
  const language   = useSettingsStore(s => s.language || 'it')
  const t = useT()
  const isMobile = useIsMobile()
  const CATEGORIES = useUploadCategories()
  const CATEGORY_LABELS = useCategoryLabels()
  const translateTag = useTagTranslator()

  const STEPS = [
    { id: 'front',  label: t('uploadStepFrontLabel'), Icon: IconCamera, desc: t('uploadStepFrontDesc') },
    { id: 'back',   label: t('uploadStepBackLabel'),  Icon: IconCamera, desc: t('uploadStepBackDesc')  },
    { id: 'label',  label: t('uploadStepLabelLabel'), Icon: IconTag,   desc: t('uploadStepLabelDesc') },
  ]

  const [photos,   setPhotos]   = useState({ front: null, back: null, label: null })
  const [previews, setPreviews] = useState({ front: null, back: null, label: null })
  const [category, setCategory] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [step,     setStep]     = useState('upload') // upload | analyzing | review | confirming | done
  const [showCatPicker, setShowCatPicker] = useState(!isMobile)

  // Quota upload giornaliera
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

  // Risultato analisi + duplicati
  const [analysis,   setAnalysis]   = useState(null)
  const [tmpFiles,   setTmpFiles]   = useState(null)   // { tmp_front, tmp_back, tmp_label }
  const [duplicates, setDuplicates] = useState([])
  const [result,     setResult]     = useState(null)

  const fileRefs = { front: useRef(), back: useRef(), label: useRef() }

  const handleFile = (type, file) => {
    if (!file) return
    setPhotos(p => ({ ...p, [type]: file }))
    const url = URL.createObjectURL(file)
    setPreviews(p => ({ ...p, [type]: url }))
  }

  const handleDrop = (type, e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) handleFile(type, file)
  }

  // Step 1: analisi AI senza salvare nel DB
  const handleAnalyze = async () => {
    if (!photos.front) {
      setError(t('uploadErrFront'))
      return
    }
    setError(null)
    setLoading(true)
    setStep('analyzing')

    try {
      const formData = new FormData()
      formData.append('photo_front', photos.front)
      if (photos.back)  formData.append('photo_back',  photos.back)
      if (photos.label) formData.append('photo_label', photos.label)
      if (category)     formData.append('category',    category)
      formData.append('language', language)

      const data = await analyzeGarment(formData)
      const dups = findDuplicates(data.analysis, garments)

      setAnalysis(data.analysis)
      setTmpFiles({ tmp_front: data.tmp_front, tmp_back: data.tmp_back, tmp_label: data.tmp_label })
      setDuplicates(dups)
      setStep('review')
    } catch (e) {
      setError(t('uploadErrPrefix') + (e.response?.data?.detail || e.message))
      setStep('upload')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: conferma → crea il capo nel DB
  const handleConfirm = async () => {
    setLoading(true)
    setStep('confirming')
    try {
      const garment = await confirmGarment({
        ...tmpFiles,
        analysis,
        category: analysis.category,
      })
      addGarment(garment)
      setResult(garment)
      setStep('done')
    } catch (e) {
      setError(t('uploadErrPrefix') + (e.response?.data?.detail || e.message))
      setStep('review')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setPhotos({ front: null, back: null, label: null })
    setPreviews({ front: null, back: null, label: null })
    setCategory('')
    setResult(null)
    setAnalysis(null)
    setTmpFiles(null)
    setDuplicates([])
    setError(null)
    setStep('upload')
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (step === 'done' && result) {
    return (
      <div style={{ padding: 32, maxWidth: 600, margin: '0 auto' }}>
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 20, padding: 32, textAlign: 'center',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px',
            background: 'rgba(16,185,129,0.12)', border: '2px solid rgba(16,185,129,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)',
          }}>
            <IconCheckCircle size={30} />
          </div>
          <h2 className="page-title" style={{ marginBottom: 8 }}>{t('uploadAddedTitle')}</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>{result.name}</p>

          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 20, textAlign: 'left', marginBottom: 24 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>{t('uploadAiSummary')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                [t('uploadFieldCat'),      CATEGORY_LABELS[result.category] || result.category],
                [t('uploadFieldBrand'),    result.brand    || '—'],
                [t('uploadFieldColor'),    result.color_primary || '—'],
                [t('uploadFieldSize'),     result.size     || '—'],
                [t('uploadFieldPrice'),    result.price ? `€${result.price}` : '—'],
                [t('uploadFieldMaterial'), result.material || '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--text-dim)' }}>{k}: </span>
                  <span style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
            {result.description && (
              <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                {result.description}
              </p>
            )}
            <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[...(result.style_tags || []), ...(result.season_tags || []), ...(result.occasion_tags || [])].map(tag => (
                <span key={tag} className="tag tag-purple">{translateTag(tag)}</span>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={handleReset} className="btn btn-ghost">{t('uploadAddAnother')}</button>
            <button onClick={() => navigate('/wardrobe')} className="btn btn-primary">{t('uploadGoWardrobe')}</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Analyzing / Confirming spinner ────────────────────────────────────────
  if (step === 'analyzing' || step === 'confirming') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <div className="spinner" style={{ width: 48, height: 48, borderWidth: 4 }} />
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            {step === 'analyzing' ? t('uploadAnalyzingTitle') : t('uploadSavingTitle')}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {step === 'analyzing' ? t('uploadAnalyzingDesc') : t('uploadSavingDesc')}
          </p>
        </div>
      </div>
    )
  }

  // ── Review step: analisi + capi simili ────────────────────────────────────
  if (step === 'review' && analysis) {
    return (
      <div style={{ height: '100%', overflow: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{t('uploadReviewTitle')}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
            {t('uploadReviewDesc')}
          </p>

          {/* Analisi AI */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title" style={{ marginBottom: 14 }}>{t('uploadAiData')}</div>
            <div style={{ display: 'flex', gap: 20 }}>
              {/* Foto preview */}
              {previews.front && (
                <img
                  src={previews.front}
                  alt="fronte"
                  style={{ width: 120, height: 120, objectFit: 'contain', borderRadius: 10, background: 'var(--card)', flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{analysis.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  {[
                    [t('uploadFieldCat'),      CATEGORY_LABELS[analysis.category] || analysis.category],
                    [t('uploadFieldBrand'),    analysis.brand    || '—'],
                    [t('uploadFieldColor'),    analysis.color_primary || '—'],
                    [t('uploadFieldSize'),     analysis.size     || '—'],
                    [t('uploadFieldPrice'),    analysis.price ? `€${analysis.price}` : '—'],
                    [t('uploadFieldMaterial'), analysis.material || '—'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ fontSize: 12 }}>
                      <span style={{ color: 'var(--text-dim)' }}>{k}: </span>
                      <span style={{ fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {[...(analysis.style_tags || []), ...(analysis.season_tags || [])].map(t => (
                    <span key={t} className="tag tag-purple">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Capi simili già presenti */}
          {duplicates.length > 0 && (
            <div style={{
              background: 'rgba(251,191,36,0.07)',
              border: '1px solid rgba(251,191,36,0.35)',
              borderRadius: 14,
              padding: '16px 20px',
              marginBottom: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ color: '#fbbf24', display: 'flex' }}><IconAlertTriangle size={18} /></span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  {duplicates.length === 1
                    ? t('uploadDuplicateWarning')
                    : t('uploadDuplicateWarningPlural', duplicates.length)}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {duplicates.map(g => (
                  <div key={g.id} style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: 10,
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    minWidth: 200,
                    maxWidth: 280,
                  }}>
                    {/* Thumbnail */}
                    <div style={{
                      width: 52, height: 52, borderRadius: 8, flexShrink: 0,
                      background: 'var(--card)',
                      overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {g.photo_front ? (
                        <img
                          src={imgUrl(g.photo_front)}
                          alt={g.name}
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      ) : (
                        <span style={{ opacity: 0.4, color: 'var(--text-dim)', display: 'flex' }}><IconShirt size={24} /></span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {g.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                        {CATEGORY_LABELS[g.category] || g.category}
                        {g.brand && <> · {g.brand}</>}
                      </div>
                      {g.color_primary && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          {g.color_hex && <div style={{ width: 8, height: 8, borderRadius: '50%', background: g.color_hex }} />}
                          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{g.color_primary}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 12 }}>
                {t('uploadDuplicateQuestion')}
              </p>
            </div>
          )}

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16,
            }}>
              <span style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}><IconAlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {error}</span>
            </div>
          )}

          {/* Azioni */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={handleReset} className="btn btn-ghost">
              ✕ {t('cancel')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="btn btn-primary"
              style={{ minWidth: 180 }}
            >
              {duplicates.length > 0 ? t('uploadAddAnyway') : t('uploadConfirmBtn')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Upload form ────────────────────────────────────────────────────────────
  // Badge quota — renderizzato solo se il piano ha un limite (< 999)
  const QuotaBadge = () => {
    if (!uploadQuota || uploadQuota.limit === null) return null
    const UNLIMITED = 999
    if (uploadQuota.limit >= UNLIMITED) return null
    const rem   = uploadQuota.remaining ?? 0
    const lim   = uploadQuota.limit
    const extra = uploadQuota.extra ?? 0
    const pct   = Math.min(100, Math.round(((lim - rem) / lim) * 100))
    const color  = rem === 0 ? '#ef4444' : rem <= 2 ? '#f59e0b' : 'var(--primary-light)'
    const bg     = rem === 0 ? 'rgba(239,68,68,0.08)' : rem <= 2 ? 'rgba(245,158,11,0.10)' : 'var(--primary-dim)'
    const border = rem === 0 ? 'rgba(239,68,68,0.25)' : rem <= 2 ? 'rgba(245,158,11,0.3)' : 'var(--primary-border)'
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: bg, border: `1px solid ${border}`,
        borderRadius: 12, padding: '8px 14px',
        marginBottom: isMobile ? 16 : 20,
      }}>
        {/* Numero grande */}
        <div style={{ textAlign: 'center', minWidth: 36 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{rem}</div>
          <div style={{ fontSize: 10, color, opacity: 0.75, marginTop: 1, whiteSpace: 'nowrap' }}>
            {language === 'en' ? `of ${lim} today` : `di ${lim} oggi`}
          </div>
        </div>
        {/* Barra + extra */}
        <div style={{ minWidth: 80 }}>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`, background: color, transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            {rem === 0
              ? (language === 'en' ? 'Daily limit reached' : 'Limite giornaliero raggiunto')
              : (language === 'en' ? 'AI analyses remaining' : 'analisi AI rimaste')}
          </div>
          {extra > 0 && (
            <div style={{ fontSize: 10, color: '#16a34a', marginTop: 2 }}>+{extra} extra</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: isMobile ? '16px 14px' : '24px 28px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>{t('uploadSectionTitle')}</h1>
        <p className="page-subtitle" style={{ marginBottom: 12 }}>{t('uploadSectionDesc')}</p>
        <QuotaBadge />

        {/* Category picker — collapsible on mobile */}
        <div data-pagetour="upload-category" style={{ marginBottom: 16 }}>
          {isMobile ? (
            /* Mobile: compact toggle */
            <div>
              <button
                onClick={() => setShowCatPicker(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  background: 'var(--card)', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
                }}
              >
                <span>
                  {category
                    ? `📦 ${CATEGORIES.find(c => c.id === category)?.label || category}`
                    : t('uploadCatHint')}
                </span>
                <span style={{ opacity: 0.5 }}>{showCatPicker ? '▲' : '▼'}</span>
              </button>
              {showCatPicker && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, padding: '10px 0' }}>
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => { setCategory(category === cat.id ? '' : cat.id); setShowCatPicker(false) }}
                      className={`category-chip ${category === cat.id ? 'active' : ''}`}
                      style={{ fontSize: 12, padding: '5px 11px' }}
                    >
                      <span>{cat.icon}</span>{cat.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Desktop: full card */
            <div className="card">
              <div className="section-title">{t('uploadCatHint')}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(category === cat.id ? '' : cat.id)}
                    className={`category-chip ${category === cat.id ? 'active' : ''}`}
                  >
                    <span>{cat.icon}</span>
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Photo upload zones */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: isMobile ? 10 : 16,
          marginBottom: 16,
        }}>
          {STEPS.map(({ id, label, Icon, icon, desc }) => (
            <DropZone
              key={id}
              label={label}
              Icon={Icon}
              icon={icon}
              desc={isMobile && id !== 'front' ? null : desc}
              preview={previews[id]}
              required={id === 'front'}
              onFile={(file) => handleFile(id, file)}
              onDrop={(e) => handleDrop(id, e)}
              inputRef={fileRefs[id]}
              compact={isMobile}
            />
          ))}
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16,
          }}>
            <span style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}><IconAlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {error}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={() => navigate('/wardrobe')} className="btn btn-ghost">
            {t('cancel')}
          </button>
          <button
            onClick={handleAnalyze}
            disabled={!photos.front || loading}
            className="btn btn-accent"
            style={{ minWidth: isMobile ? 0 : 160, flex: isMobile ? 1 : undefined }}
          >
            {t('uploadAnalyzeBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}

function DropZone({ label, icon, Icon, desc, preview, required, onFile, onDrop, inputRef, compact }) {
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)
  const t = useT()

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { setDragging(false); onDrop(e) }}
      style={{
        border: `2px dashed ${
          preview  ? 'var(--success)' :
          dragging ? 'var(--primary)' :
          hovered  ? 'var(--primary)' :
                     'var(--border)'
        }`,
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        overflow: 'hidden',
        background: dragging ? 'var(--primary-dim)' : hovered && !preview ? 'var(--primary-hover-bg)' : 'var(--card)',
        transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
        boxShadow: (dragging || hovered) && !preview ? '0 0 0 3px var(--primary-dim)' : 'none',
        minHeight: compact ? 90 : 180,
        display: 'flex',
        flexDirection: compact ? 'row' : 'column',
      }}
    >
      {preview ? (
        compact ? (
          /* Mobile compact: image on left, label on right */
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', flex: 1 }}>
            <img src={preview} alt={label} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>✓ {label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{t('uploadDropZone')}</div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, position: 'relative' }}>
            <img src={preview} alt={label} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'rgba(16,185,129,0.9)', color: 'white',
              fontSize: 12, fontWeight: 600, padding: '6px 10px',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>✓ {label}</div>
          </div>
        )
      ) : compact ? (
        /* Mobile compact: icon left, text right */
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', flex: 1 }}>
          <div style={{ color: required ? 'var(--primary)' : 'var(--text-dim)', opacity: required ? 1 : 0.55, flexShrink: 0 }}>
            {Icon ? <Icon size={24} /> : <span style={{ fontSize: 24 }}>{icon}</span>}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: required ? 'var(--text)' : 'var(--text-muted)' }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--primary-light)', marginTop: 2 }}>{t('uploadDropZone')}</div>
          </div>
          {required && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--primary-light)', fontWeight: 700 }}>✱</span>}
        </div>
      ) : (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 20, gap: 8, textAlign: 'center',
        }}>
          <div style={{ color: 'var(--primary)' }}>
            {Icon ? <Icon size={30} /> : <span style={{ fontSize: 30 }}>{icon}</span>}
          </div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
          {desc && <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>{desc}</div>}
          <div style={{ fontSize: 11, color: 'var(--primary-light)', marginTop: 4 }}>{t('uploadDropZone')}</div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => onFile(e.target.files[0])}
      />
    </div>
  )
}
