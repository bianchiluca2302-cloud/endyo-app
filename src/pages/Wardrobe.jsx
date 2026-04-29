import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import GarmentCard from '../components/GarmentCard'
import GarmentDetailModal from '../components/GarmentDetailModal'
import WardrobeAnalysis from '../components/WardrobeAnalysis'
import PageTutorial from '../components/PageTutorial'
import Shopping from './Shopping'

const getWardrobeTour = (lang) => lang === 'en' ? [
  {
    title: 'Search and filter',
    body: 'Find any item by name, brand or colour. Use the category chips for a one-click filter.',
    target: '[data-pagetour="wardrobe-search"]',
    position: 'bottom',
  },
  {
    title: 'Wardrobe Analysis',
    body: 'Charts on categories, colours and brands — plus suggestions on what to add.',
    target: '[data-pagetour="wardrobe-analysis"]',
    position: 'left',
  },
  {
    title: 'Shopping Advisor',
    body: 'Evaluate a new item before buying: the AI checks how well it fits your wardrobe.',
    target: '[data-pagetour="wardrobe-shopping"]',
    position: 'left',
    cta: 'Got it →',
  },
] : [
  {
    title: 'Cerca e filtra',
    body: 'Trova un capo per nome, brand o colore. Usa i chip categoria per filtrare in un click.',
    target: '[data-pagetour="wardrobe-search"]',
    position: 'bottom',
  },
  {
    title: 'Analisi Armadio',
    body: 'Grafici su categorie, colori e brand — più suggerimenti su cosa aggiungere.',
    target: '[data-pagetour="wardrobe-analysis"]',
    position: 'left',
  },
  {
    title: 'Shopping Advisor',
    body: 'Valuta un capo prima di comprarlo: l\'AI verifica quanto si abbina al tuo guardaroba.',
    target: '[data-pagetour="wardrobe-shopping"]',
    position: 'left',
    cta: 'Capito →',
  },
]
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import { useT, useCategoryFilters } from '../i18n'
import { IconCamera, IconSparkle, IconUsers, IconCheck, IconSearch, IconTshirt } from '../components/Icons'
import useIsMobile from '../hooks/useIsMobile'

// ── Onboarding step card ──────────────────────────────────────────────────────
function OnboardingStep({ num, icon, title, desc, done, cta, doneLabel, onClick }) {
  return (
    <div style={{
      background: done ? 'rgba(16,185,129,0.06)' : 'var(--card)',
      border: `1px solid ${done ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
      borderRadius: 14,
      padding: '20px 22px',
      display: 'flex',
      gap: 16,
      alignItems: 'flex-start',
      opacity: done ? 0.7 : 1,
      transition: 'var(--transition)',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
        background: done
          ? 'var(--success)'
          : 'linear-gradient(135deg, var(--primary), #c084fc)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white',
      }}>
        {done ? <IconCheck size={18} /> : icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
          {num}. {title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: cta ? 12 : 0 }}>
          {desc}
        </div>
        {cta && !done && (
          <button onClick={onClick} className="btn btn-primary" style={{ fontSize: 12, padding: '7px 14px' }}>
            {cta} →
          </button>
        )}
        {done && (
          <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}><IconCheck size={13} /> {doneLabel || 'Completato'}</span>
        )}
      </div>
    </div>
  )
}

// ── Welcome screen (primo avvio) ──────────────────────────────────────────────
function WelcomeScreen({ hasGarments, hasProfile, navigate, t }) {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 40px',
    }}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, var(--primary), #c084fc)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white',
          }}>
            <IconSparkle size={36} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', marginBottom: 8 }}>
            {t('wardrobeWelcomeTitle')}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>
            {t('wardrobeWelcomeDesc')}
          </p>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          <OnboardingStep
            num={1}
            icon={<IconCamera size={20} />}
            title={t('wardrobeStep1Title')}
            desc={t('wardrobeStep1Desc')}
            done={hasGarments}
            cta={t('wardrobeStep1Cta')}
            doneLabel={t('wardrobeStepDone')}
            onClick={() => navigate('/upload')}
          />
          <OnboardingStep
            num={2}
            icon={<IconSparkle size={20} />}
            title={t('wardrobeStep2Title')}
            desc={t('wardrobeStep2Desc')}
            done={false}
            cta={hasGarments ? t('wardrobeStep2Cta') : null}
            doneLabel={t('wardrobeStepDone')}
            onClick={() => navigate('/outfits')}
          />
          <OnboardingStep
            num={3}
            icon={<IconUsers size={20} />}
            title={t('wardrobeStep3Title')}
            desc={t('wardrobeStep3Desc')}
            done={false}
            cta={t('wardrobeStep3Cta')}
            doneLabel={t('wardrobeStepDone')}
            onClick={() => navigate('/friends')}
          />
        </div>

        {/* Quick action */}
        {!hasGarments && (
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => navigate('/upload')}
              className="btn btn-accent"
              style={{ fontSize: 14, padding: '12px 28px', borderRadius: 10 }}
            >
              {t('wardrobeAddFirst')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Wardrobe() {
  const navigate    = useNavigate()
  const garments    = useWardrobeStore(s => s.garments)
  const loading     = useWardrobeStore(s => s.loading)
  const profile     = useWardrobeStore(s => s.profile)
  const getGarmentsByCategory = useWardrobeStore(s => s.getGarmentsByCategory)
  const compactCards = useSettingsStore(s => s.compactCards)
  const language     = useSettingsStore(s => s.language) || 'it'
  const t = useT()
  const CATEGORIES = useCategoryFilters()
  const WARDROBE_TOUR = getWardrobeTour(language)

  const isMobile = useIsMobile()

  const [activeCat,    setActiveCat]    = useState('all')
  const [activeBrand,  setActiveBrand]  = useState(null)
  const [activeColor,  setActiveColor]  = useState(null)
  const [search,       setSearch]       = useState('')
  const [detailGarment, setDetailGarment] = useState(null)
  const [showAnalysis,  setShowAnalysis]  = useState(false)
  const [showShopping,  setShowShopping]  = useState(false)
  // On mobile, categories are collapsed by default
  const [showAllCats, setShowAllCats]   = useState(!isMobile)

  // Chiudi il modale se il capo viene eliminato dallo store
  useEffect(() => {
    if (detailGarment && !garments.find(g => g.id === detailGarment.id)) {
      setDetailGarment(null)
    }
  }, [garments, detailGarment])

  const hasProfile  = !!(profile?.avatar_photo || profile?.name)
  const hasGarments = garments.length > 0

  // Marche e colori disponibili tra i capi presenti
  const availableBrands = [...new Set(
    garments.map(g => g.brand).filter(Boolean)
  )].sort()

  const availableColors = [...new Map(
    garments
      .filter(g => g.color_primary)
      .map(g => [g.color_primary.toLowerCase(), { label: g.color_primary, hex: g.color_hex || null }])
  ).values()]

  const filtered = getGarmentsByCategory(activeCat).filter(g => {
    if (activeBrand && (g.brand || '').toLowerCase() !== activeBrand.toLowerCase()) return false
    if (activeColor && (g.color_primary || '').toLowerCase() !== activeColor.toLowerCase()) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      g.name.toLowerCase().includes(q) ||
      (g.brand || '').toLowerCase().includes(q) ||
      (g.color_primary || '').toLowerCase().includes(q) ||
      (g.style_tags || []).some(t => t.includes(q))
    )
  })

  const countByCat = (cat) => garments.filter(g => g.category === cat).length

  const hasActiveFilters = activeBrand || activeColor
  const clearFilters = () => { setActiveBrand(null); setActiveColor(null) }

// ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <div style={{ fontSize: 14 }}>{t('wardrobeLoading')}</div>
        </div>
      </div>
    )
  }

  // ── Welcome / Onboarding (nessun capo E nessun profilo) ──────────────────
  if (!hasGarments && !hasProfile) {
    return <WelcomeScreen hasGarments={hasGarments} hasProfile={hasProfile} navigate={navigate} t={t} />
  }

  // ── Profilo ok ma armadio vuoto → prompt specifico ───────────────────────
  if (!hasGarments) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <div style={{ marginBottom: 16, color: 'var(--text-dim)', opacity: 0.4, display: 'flex', justifyContent: 'center' }}><IconTshirt size={56} /></div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{t('wardrobeEmpty')}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
            {t('wardrobeEmptyHint')}
          </p>
          <button onClick={() => navigate('/upload')} className="btn btn-primary" style={{ fontSize: 14, padding: '11px 24px' }}>
            {t('wardrobeAddCta')}
          </button>
        </div>
      </div>
    )
  }

  // ── Armadio con capi ─────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {!isMobile && <PageTutorial pageId="wardrobe" steps={WARDROBE_TOUR} />}
      {/* Header */}
      <div style={{
        padding: isMobile ? '14px 14px 12px' : '24px 28px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 className="page-title">{t('wardrobeTitle')}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <span className="page-subtitle">{t('wardrobeItemCount', garments.length)}</span>
              {!hasProfile && (
                <button
                  onClick={() => navigate('/profile')}
                  className="badge badge-accent"
                  style={{ cursor: 'pointer', border: 'none', fontWeight: 550 }}
                >
                  {t('wardrobeTryonHint')}
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              data-pagetour="wardrobe-analysis"
              onClick={() => setShowAnalysis(true)}
              className="btn btn-ghost btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              {!isMobile && t('wardrobeAnalysisBtn')}
            </button>
            <button
              data-pagetour="wardrobe-shopping"
              onClick={() => setShowShopping(true)}
              className="btn btn-primary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {/* shopping bag icon */}
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              {t('navShopping')}
            </button>
          </div>
        </div>

        <input
          data-pagetour="wardrobe-search"
          className="input"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 14 }}
          onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-dim)' }}
          onBlur={e => { e.target.style.borderColor = ''; e.target.style.boxShadow = '' }}
        />

        {/* Filtro categoria */}
        <div style={{ marginBottom: 10 }}>
          {/* Su mobile: mostra solo "Tutti" + toggle per espandere */}
          {isMobile ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* "Tutti" sempre visibile */}
              <button
                onClick={() => { setActiveCat('all'); setShowAllCats(false) }}
                className={`category-chip ${activeCat === 'all' ? 'active' : ''}`}
                style={{ justifyContent: 'center' }}
              >
                <span>{CATEGORIES[0]?.icon}</span>
                {CATEGORIES[0]?.label}
              </button>
              {/* Categoria attiva se non è "all" */}
              {activeCat !== 'all' && (() => {
                const cat = CATEGORIES.find(c => c.id === activeCat)
                return cat ? (
                  <button
                    key={cat.id}
                    className="category-chip active"
                    onClick={() => setShowAllCats(v => !v)}
                    style={{ justifyContent: 'center' }}
                  >
                    <span>{cat.icon}</span>{cat.label}
                    <span style={{ background: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: 10, padding: '1px 6px', fontSize: 11 }}>
                      {countByCat(cat.id)}
                    </span>
                  </button>
                ) : null
              })()}
              {/* Toggle mostra tutte */}
              <button
                onClick={() => setShowAllCats(v => !v)}
                style={{
                  fontSize: 11, padding: '5px 10px', borderRadius: 20,
                  border: '1px solid var(--border)', background: showAllCats ? 'var(--primary-dim)' : 'transparent',
                  color: showAllCats ? 'var(--primary-light)' : 'var(--text-dim)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {showAllCats ? '▲' : '▼'} {showAllCats ? 'Nascondi' : 'Filtri'}
              </button>
              {/* Categorie espanse */}
              {showAllCats && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: '100%', marginTop: 6 }}>
                  {CATEGORIES.slice(1).map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => { setActiveCat(cat.id); setShowAllCats(false) }}
                      className={`category-chip ${activeCat === cat.id ? 'active' : ''}`}
                      style={{ justifyContent: 'center', fontSize: 11, padding: '4px 10px' }}
                    >
                      <span>{cat.icon}</span>{cat.label}
                      <span style={{
                        background: activeCat === cat.id ? 'rgba(255,255,255,0.2)' : 'var(--border)',
                        color: activeCat === cat.id ? 'white' : 'var(--text-dim)',
                        borderRadius: 10, padding: '1px 5px', fontSize: 10,
                      }}>{countByCat(cat.id)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCat(cat.id)}
                  className={`category-chip ${activeCat === cat.id ? 'active' : ''}`}
                  style={{ justifyContent: 'center' }}
                >
                  <span>{cat.icon}</span>
                  {cat.label}
                  {cat.id !== 'all' && (
                    <span style={{
                      background: activeCat === cat.id ? 'rgba(255,255,255,0.2)' : 'var(--border)',
                      color: activeCat === cat.id ? 'white' : 'var(--text-dim)',
                      borderRadius: 10, padding: '1px 6px', fontSize: 11,
                    }}>
                      {countByCat(cat.id)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filtro marca */}
        {availableBrands.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{t('filterBrand')}</span>
            {availableBrands.map(brand => (
              <button
                key={brand}
                onClick={() => setActiveBrand(activeBrand === brand ? null : brand)}
                className={`category-chip ${activeBrand === brand ? 'active' : ''}`}
                style={{ fontSize: 11, padding: '3px 10px' }}
              >
                {brand}
              </button>
            ))}
          </div>
        )}

        {/* Filtro colore */}
        {availableColors.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: hasActiveFilters ? 8 : 0 }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{t('filterColor')}</span>
            {availableColors.map(({ label, hex }) => (
              <button
                key={label}
                onClick={() => setActiveColor(activeColor === label ? null : label)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', fontSize: 11, borderRadius: 20,
                  border: `1px solid ${activeColor === label ? 'var(--primary)' : 'var(--border)'}`,
                  background: activeColor === label ? 'var(--primary-dim)' : 'transparent',
                  color: activeColor === label ? 'var(--primary-light)' : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'var(--transition)',
                }}
              >
                {hex && (
                  <div style={{
                    width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                    background: hex, border: '1px solid rgba(255,255,255,0.15)',
                  }} />
                )}
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Reset filtri attivi */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            onFocus={e => { e.currentTarget.style.outline = '2px solid var(--primary)'; e.currentTarget.style.outlineOffset = '2px'; e.currentTarget.style.boxShadow = '0 0 0 4px var(--primary-dim)' }}
            onBlur={e => { e.currentTarget.style.outline = ''; e.currentTarget.style.outlineOffset = ''; e.currentTarget.style.boxShadow = '' }}
            style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 20,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-dim)', cursor: 'pointer',
            }}
          >
            {t('wardrobeRemoveFilters')}
          </button>
        )}
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '12px 14px' : '20px 28px' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="icon" style={{ display: 'flex', justifyContent: 'center' }}><IconSearch size={40} /></div>
            <h3>{t('wardrobeNoResults')}</h3>
            <p>{t('wardrobeNoResultsHint')}</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile
              ? 'repeat(auto-fill, minmax(120px, 1fr))'
              : `repeat(auto-fill, minmax(${compactCards ? 150 : 200}px, 1fr))`,
            gap: isMobile ? 8 : compactCards ? 10 : 16,
          }}>
            {filtered.map(g => (
              <GarmentCard
                key={g.id}
                garment={g}
                onClick={() => setDetailGarment(g)}
                compact={compactCards}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modale dettaglio capo */}
      {detailGarment && (
        <GarmentDetailModal
          garment={detailGarment}
          onClose={() => setDetailGarment(null)}
        />
      )}

      {/* Analisi armadio */}
      {showAnalysis && (
        <WardrobeAnalysis onClose={() => setShowAnalysis(false)} />
      )}

      {/* Shopping Advisor overlay */}
      {showShopping && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
          onClick={e => { if (e.target === e.currentTarget) setShowShopping(false) }}
        >
          <div style={{
            background: 'var(--surface)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            width: '100%', maxWidth: 780,
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
          }}>
            <Shopping onClose={() => setShowShopping(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
