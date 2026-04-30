/**
 * Premium — pagina di abbonamento Endyo.
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import useSettingsStore from '../store/settingsStore'
import { useT } from '../i18n'
import { fetchChatQuota, upgradeUserPlan, cancelScheduledDowngrade, startStripeCheckout } from '../api/client'
import useIsMobile from '../hooks/useIsMobile'

// ── Helpers ───────────────────────────────────────────────────────────────────
const planFamily = (p) => {
  if (!p || p === 'free') return 'free'
  if (p.startsWith('premium_plus')) return 'premium_plus'
  if (p.startsWith('premium'))      return 'premium'
  return 'free'
}

const fmtDate = (iso, lang = 'it') => {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'it-IT', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ── Icone ─────────────────────────────────────────────────────────────────────
const IconCheck = ({ size = 15, color = 'var(--primary)' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
const IconX = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="var(--text-dim)" strokeWidth={2.5} strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
const IconCrown = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 20h20M5 20l-2-9 5 4 4-8 4 8 5-4-2 9" />
  </svg>
)
const IconStar = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)
const IconClock = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)
const IconInfo = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)

// ── Tabella comparativa ───────────────────────────────────────────────────────
function FeatureRow({ label, free, premium, premiumPlus }) {
  const cell = (val) => {
    if (val === true)  return <IconCheck />
    if (val === false) return <IconX />
    return <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{val}</span>
  }
  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <td style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text-muted)' }}>{label}</td>
      <td style={{ padding: '10px 12px', textAlign: 'center' }}>{cell(free)}</td>
      <td style={{ padding: '10px 12px', textAlign: 'center', background: 'var(--primary-hover-bg)' }}>{cell(premium)}</td>
      <td style={{ padding: '10px 12px', textAlign: 'center', background: 'rgba(251,191,36,0.06)' }}>{cell(premiumPlus)}</td>
    </tr>
  )
}

// ── FAQ accordion (animato, uno solo aperto alla volta) ───────────────────────
function FaqItem({ question, answer, isOpen, onToggle }) {
  const bodyRef = useRef(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (bodyRef.current) {
      setHeight(isOpen ? bodyRef.current.scrollHeight : 0)
    }
  }, [isOpen])

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${isOpen ? 'var(--primary-border)' : 'var(--border)'}`,
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
      boxShadow: isOpen ? '0 0 0 3px var(--primary-dim)' : 'none',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', background: 'none', border: 'none',
          padding: '14px 18px', cursor: 'pointer', textAlign: 'left',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>
          {question}
        </span>
        <span style={{
          fontSize: 18, color: isOpen ? 'var(--primary)' : 'var(--text-dim)',
          fontWeight: 300, flexShrink: 0,
          transition: 'transform 0.22s ease, color 0.18s ease',
          display: 'inline-block',
          transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
          lineHeight: 1,
        }}>+</span>
      </button>
      <div style={{
        maxHeight: height,
        overflow: 'hidden',
        transition: 'max-height 0.28s ease',
      }}>
        <div ref={bodyRef} style={{
          padding: '0 18px 14px',
          fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6,
        }}>
          {answer}
        </div>
      </div>
    </div>
  )
}

// ── Modal conferma downgrade al Free ─────────────────────────────────────────
function DowngradeConfirmModal({ isOpen, onConfirm, onCancel, expiryDate, planName, loading, lang }) {
  if (!isOpen) return null
  const isIT = lang !== 'en'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          padding: '28px 28px 24px',
          maxWidth: 420, width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Icona */}
        <div style={{
          width: 52, height: 52, borderRadius: '50%', margin: '0 auto 18px',
          background: 'rgba(245,158,11,0.1)', border: '2px solid rgba(245,158,11,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#f59e0b',
        }}>
          <IconInfo size={22} />
        </div>

        <h3 style={{
          fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em',
          textAlign: 'center', marginBottom: 12,
        }}>
          {isIT ? 'Rinnovo automatico disattivato' : 'Auto-renewal disabled'}
        </h3>

        <p style={{
          fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65,
          textAlign: 'center', marginBottom: 16,
        }}>
          {isIT
            ? <>Il rinnovo automatico verrà <strong style={{ color: 'var(--text)' }}>disattivato</strong>. Il piano <strong style={{ color: 'var(--text)' }}>{planName}</strong> rimarrà attivo{expiryDate ? <> fino al <strong style={{ color: '#f59e0b' }}>{expiryDate}</strong></> : ''}, dopodiché il tuo account passerà automaticamente al piano Free.</>
            : <>Auto-renewal will be <strong style={{ color: 'var(--text)' }}>disabled</strong>. Your <strong style={{ color: 'var(--text)' }}>{planName}</strong> plan stays active{expiryDate ? <> until <strong style={{ color: '#f59e0b' }}>{expiryDate}</strong></> : ''}, after which your account will automatically switch to the Free plan.</>
          }
        </p>

        {/* Nota riattivazione */}
        <div style={{
          background: 'var(--primary-dim)',
          border: '1px solid var(--primary-border)',
          borderRadius: 10, padding: '10px 14px',
          fontSize: 12, color: 'var(--text-muted)',
          lineHeight: 1.5, marginBottom: 22,
          display: 'flex', gap: 9, alignItems: 'flex-start',
        }}>
          <span style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }}>
            <IconInfo size={13} />
          </span>
          <span>
            {isIT
              ? <>Puoi riattivare il piano in qualsiasi momento premendo <strong style={{ color: 'var(--primary)' }}>"Annulla programmazione"</strong> sotto il piano {planName} nella stessa pagina.</>
              : <>You can reactivate your plan at any time by pressing <strong style={{ color: 'var(--primary)' }}>"Cancel schedule"</strong> under the {planName} plan on this page.</>
            }
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            className="btn btn-ghost"
            style={{ flex: 1, fontSize: 13, padding: '11px 0' }}
          >
            {isIT ? '← Rimani su ' + planName : '← Keep ' + planName}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="btn"
            style={{
              flex: 1, fontSize: 13, padding: '11px 0',
              background: 'rgba(245,158,11,0.15)',
              color: '#f59e0b',
              border: '1px solid rgba(245,158,11,0.35)',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading
              ? (isIT ? 'Conferma…' : 'Confirming…')
              : (isIT ? 'Conferma downgrade' : 'Confirm downgrade')
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Pricing card ──────────────────────────────────────────────────────────────
function PlanCard({ plan, currentPlan, billing, onUpgrade, onRequestDowngrade, onCancelDowngrade, loading, planExpiresAt, scheduledDowngradeTo, lang, t }) {
  const [hovered, setHovered] = useState(false)
  const family    = planFamily(currentPlan)
  const isCurrent = plan.family === family && (
    plan.family === 'free' ||
    (billing === 'monthly' && !currentPlan.endsWith('_annual')) ||
    (billing === 'annual'  &&  currentPlan.endsWith('_annual'))
  )
  const isPopular = plan.family === 'premium'
  const isGold    = plan.family === 'premium_plus'
  const isFree    = plan.family === 'free'

  const price   = billing === 'annual' && !isFree ? plan.priceAnnual  : plan.priceMonthly
  const priceId = billing === 'annual' && !isFree ? plan.idAnnual     : plan.idMonthly

  const isDowngradeScheduled = scheduledDowngradeTo === 'free'
  const expiryLabel = planExpiresAt ? fmtDate(planExpiresAt, lang) : null

  const borderColor = isCurrent
    ? (isGold ? '#f59e0b' : 'var(--primary)')
    : hovered
      ? isGold ? 'rgba(251,191,36,0.6)' : 'var(--primary)'
      : isGold ? 'rgba(251,191,36,0.35)' : 'var(--border)'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, height: '100%', background: 'var(--surface)',
        border: `2px solid ${borderColor}`,
        borderRadius: 18, overflow: 'hidden',
        position: 'relative', display: 'flex', flexDirection: 'column',
        transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
        boxShadow: isCurrent
          ? isGold ? '0 0 0 4px rgba(251,191,36,0.1)' : '0 0 0 4px var(--primary-dim)'
          : hovered ? '0 0 0 3px var(--primary-dim)' : 'none',
      }}
    >
      {/* Badge */}
      {isCurrent ? (
        <div style={{
          position: 'absolute', top: 14, right: 14,
          background: isGold ? 'rgba(251,191,36,0.15)' : 'var(--primary-dim)',
          color: isGold ? '#f59e0b' : 'var(--primary)',
          fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
          padding: '3px 10px', borderRadius: 99,
          border: `1px solid ${isGold ? 'rgba(251,191,36,0.3)' : 'var(--primary-border)'}`,
        }}>
          {t('premiumCurrentPlan')}
        </div>
      ) : isPopular ? (
        <div style={{
          position: 'absolute', top: 14, right: 14,
          background: 'linear-gradient(135deg, var(--primary), #c084fc)',
          color: 'white', fontSize: 9.5, fontWeight: 800,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          padding: '3px 10px', borderRadius: 99,
        }}>{t('premiumPopularBadge')}</div>
      ) : isGold ? (
        <div style={{
          position: 'absolute', top: 14, right: 14,
          background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
          color: 'white', fontSize: 9.5, fontWeight: 800,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          padding: '3px 10px', borderRadius: 99,
        }}>{t('premiumBestValueBadge')}</div>
      ) : null}

      {/* Header */}
      <div style={{
        padding: '24px 24px 18px',
        background: isGold
          ? 'linear-gradient(135deg, rgba(251,191,36,0.07), rgba(245,158,11,0.03))'
          : isPopular ? 'linear-gradient(135deg, var(--primary-dim), rgba(192,132,252,0.03))'
          : 'transparent',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          color: isGold ? '#f59e0b' : isPopular ? 'var(--primary)' : 'var(--text-muted)',
          marginBottom: 10,
        }}>
          {isGold ? <IconStar size={16} /> : isPopular ? <IconCrown size={16} /> : null}
          <span style={{ fontSize: 13, fontWeight: 700 }}>{plan.name}</span>
        </div>

        {isFree ? (
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', marginBottom: 4 }}>
            {t('premiumFreePrice')}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 2 }}>
              <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)' }}>
                €{billing === 'annual' ? (price / 12).toFixed(2) : price.toFixed(2)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 500 }}>
                {t('premiumPerMonth')}
              </span>
            </div>
            {billing === 'annual' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'nowrap', marginBottom: 2 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {/* chiamata corretta: t(key, arg) non t(key)(arg) */}
                  {t('premiumBilledAnnually', price.toFixed(2))}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                  color: '#16a34a', background: 'rgba(34,197,94,0.12)',
                  padding: '2px 7px', borderRadius: 99, whiteSpace: 'nowrap',
                }}>
                  {t('premiumSaving', (plan.priceMonthly * 12 - price).toFixed(2))}
                </span>
              </div>
            )}
          </>
        )}

        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: '8px 0 0' }}>
          {plan.tagline}
        </p>
      </div>

      {/* Features */}
      <div style={{ padding: '4px 24px 16px', flex: 1 }}>
        {plan.features.map((f, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '7px 0',
            borderBottom: i < plan.features.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>
              {f.included
                ? <IconCheck size={14} color={isGold ? '#f59e0b' : 'var(--primary)'} />
                : <IconX size={14} />}
            </span>
            <span style={{ fontSize: 12.5, color: f.included ? 'var(--text)' : 'var(--text-dim)', lineHeight: 1.4 }}>
              {f.label}
            </span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ padding: '0 24px 22px' }}>
        {isCurrent ? (
          <>
            <div style={{
              textAlign: 'center', padding: '11px 0', fontSize: 13, fontWeight: 600,
              color: isGold ? '#f59e0b' : 'var(--primary)',
              background: isGold ? 'rgba(251,191,36,0.07)' : 'var(--primary-hover-bg)',
              borderRadius: 10,
              border: `1px solid ${isGold ? 'rgba(251,191,36,0.2)' : 'var(--primary-border)'}`,
            }}>
              {t('premiumCurrentPlanBadge')}
            </div>
            {expiryLabel && (
              <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.4 }}>
                {isDowngradeScheduled ? (
                  <span style={{ color: '#f59e0b' }}>
                    <IconClock size={11} /> {t('premiumDowngradeScheduled', expiryLabel)}
                    {' '}·{' '}
                    <button
                      onClick={onCancelDowngrade}
                      disabled={loading}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--primary)', fontSize: 10.5, fontWeight: 700,
                        padding: 0, textDecoration: 'underline',
                      }}
                    >
                      {t('premiumCancelDowngrade')}
                    </button>
                  </span>
                ) : (
                  <>{t('premiumExpiresOn', expiryLabel)}</>
                )}
              </div>
            )}
          </>
        ) : isFree ? (
          family !== 'free' ? (
            isDowngradeScheduled ? (
              <div style={{
                textAlign: 'center', padding: '11px 14px', fontSize: 12, fontWeight: 600,
                color: '#f59e0b',
                background: 'rgba(245,158,11,0.07)',
                borderRadius: 10, border: '1px solid rgba(245,158,11,0.2)',
                lineHeight: 1.4,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 4 }}>
                  <IconClock size={12} />
                  <span>{t('premiumDowngradePlanned')}</span>
                </div>
                {expiryLabel && (
                  <div style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--text-dim)' }}>
                    {t('premiumActiveUntil', expiryLabel)}
                  </div>
                )}
              </div>
            ) : (
              /* Torna al Free → apre il modal di conferma */
              <button
                onClick={onRequestDowngrade}
                disabled={loading}
                className="btn btn-ghost"
                style={{ width: '100%', fontSize: 12, padding: '11px 0', opacity: loading ? 0.7 : 1 }}
              >
                {t('premiumBackToFree')}
              </button>
            )
          ) : (
            <div style={{ textAlign: 'center', padding: '11px 0', fontSize: 12, color: 'var(--text-dim)' }}>
              {t('premiumAlwaysAvailable')}
            </div>
          )
        ) : (
          <>
            <button
              onClick={() => onUpgrade(priceId)}
              disabled={loading}
              className="btn btn-primary"
              style={{
                width: '100%', fontSize: 13, padding: '12px 0',
                background: isGold
                  ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
                  : 'linear-gradient(135deg, var(--primary), #c084fc)',
                border: 'none',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? t('premiumActivating') : t('premiumActivate', plan.name)}
            </button>
            <p style={{
              fontSize: 10.5, color: 'var(--text-dim)', textAlign: 'center',
              margin: '8px 0 0', lineHeight: 1.4,
            }}>
              {t('premiumCancelNote')}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Componente principale ─────────────────────────────────────────────────────
export default function Premium() {
  const user       = useAuthStore(s => s.user)
  const updateUser = useAuthStore(s => s.updateUser)
  const lang       = useSettingsStore(s => s.language || 'it')
  const t          = useT()
  const isMobile   = useIsMobile()
  const navigate   = useNavigate()

  const [currentPlan,         setCurrentPlan]         = useState(user?.plan || 'free')
  const [billing,              setBilling]              = useState('monthly')
  const [loading,              setLoading]              = useState(false)
  const [toast,                setToast]                = useState(null)
  const [planExpiresAt,        setPlanExpiresAt]        = useState(null)
  const [scheduledDowngradeTo, setScheduledDowngradeTo] = useState(null)
  const [openFaq,              setOpenFaq]              = useState(null)
  const [showDowngradeModal,   setShowDowngradeModal]   = useState(false)

  useEffect(() => {
    // Rimuovi i parametri Stripe dall'URL senza creare una nuova voce nella cronologia,
    // così premere "indietro" torna all'app invece che alla landing o a Stripe.
    const params = new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '')
    if (params.get('success') === '1') {
      showToast('success', lang === 'en'
        ? '🎉 Payment confirmed! Your plan is now active.'
        : '🎉 Pagamento confermato! Il tuo piano è ora attivo.')
      navigate('/premium', { replace: true })
    } else if (params.get('cancelled') === '1') {
      showToast('info', lang === 'en'
        ? 'Payment cancelled. No charge was made.'
        : 'Pagamento annullato. Non ti è stato addebitato nulla.')
      navigate('/premium', { replace: true })
    }

    fetchChatQuota().then(q => {
      setCurrentPlan(q.plan)
      setPlanExpiresAt(q.plan_expires_at || null)
      setScheduledDowngradeTo(q.scheduled_downgrade_to || null)
      if (q.plan?.endsWith('_annual')) setBilling('annual')
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 6000)
  }

  const handleUpgrade = async (planId) => {
    // Downgrade a Free: usa endpoint interno direttamente
    if (planId === 'free') {
      setLoading(true)
      try {
        const data = await upgradeUserPlan('free')
        setCurrentPlan(data.plan)
        setPlanExpiresAt(data.plan_expires_at || null)
        setScheduledDowngradeTo(data.scheduled_downgrade_to || null)
        updateUser({ ...user, plan: data.plan })
        if (data.scheduled_downgrade_to === 'free') {
          const d = fmtDate(data.plan_expires_at, lang)
          showToast('info', t('premiumDowngradeScheduled', d))
        } else {
          showToast('info', lang === 'en' ? 'Free plan restored.' : 'Piano Free ripristinato.')
        }
      } catch (e) {
        const msg = e?.response?.data?.detail || (lang === 'en'
          ? 'Error. Please try again.'
          : "Errore. Riprova tra un momento.")
        showToast('error', msg)
      } finally {
        setLoading(false)
      }
      return
    }

    // Piani a pagamento: redirect a Stripe Checkout
    setLoading(true)
    try {
      const { checkout_url } = await startStripeCheckout(planId)
      window.location.href = checkout_url
    } catch (e) {
      const msg = e?.response?.data?.detail || (lang === 'en'
        ? 'Payment error. Please try again.'
        : "Errore nel pagamento. Riprova tra un momento.")
      showToast('error', msg)
      setLoading(false)
    }
  }

  // Apre il modal di conferma prima del downgrade al Free
  const handleRequestDowngrade = () => {
    setShowDowngradeModal(true)
  }

  // Confermato dall'utente nel modal → esegue il downgrade
  const handleConfirmDowngrade = async () => {
    setLoading(true)
    try {
      const data = await upgradeUserPlan('free')
      setCurrentPlan(data.plan)
      setPlanExpiresAt(data.plan_expires_at || null)
      setScheduledDowngradeTo(data.scheduled_downgrade_to || null)
      updateUser({ ...user, plan: data.plan })
      setShowDowngradeModal(false)

      if (data.scheduled_downgrade_to === 'free') {
        const d = fmtDate(data.plan_expires_at, lang)
        showToast('info', lang === 'en'
          ? `Auto-renewal disabled. Premium stays active until ${d}.`
          : `Rinnovo automatico disattivato. Il Premium rimane attivo fino al ${d}.`)
      } else {
        showToast('info', lang === 'en' ? 'Free plan restored.' : 'Piano Free ripristinato.')
      }
    } catch (e) {
      const msg = e?.response?.data?.detail || (lang === 'en' ? 'Error. Please retry.' : 'Errore. Riprova.')
      showToast('error', msg)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelDowngrade = async () => {
    setLoading(true)
    try {
      const data = await cancelScheduledDowngrade()
      setCurrentPlan(data.plan)
      setPlanExpiresAt(data.plan_expires_at || null)
      setScheduledDowngradeTo(data.scheduled_downgrade_to || null)
      updateUser({ ...user, plan: data.plan })
      const d = fmtDate(data.plan_expires_at, lang)
      showToast('success', lang === 'en'
        ? `Downgrade cancelled. Plan active until ${d}.`
        : `Downgrade annullato. Piano attivo fino al ${d}.`)
    } catch (e) {
      showToast('error', lang === 'en' ? 'Error. Please retry.' : 'Errore. Riprova.')
    } finally {
      setLoading(false)
    }
  }

  // Nome del piano corrente (per il modal)
  const currentPlanName = planFamily(currentPlan) === 'premium_plus' ? 'Premium Plus' : 'Premium'

  const PLANS = [
    {
      family: 'free',
      idMonthly: 'free', idAnnual: 'free',
      name: 'Free',
      priceMonthly: 0, priceAnnual: 0,
      tagline: lang === 'en'
        ? 'Start building your digital wardrobe.'
        : 'Per iniziare a costruire il tuo armadio digitale.',
      features: lang === 'en' ? [
        { label: '2 AI stylist requests/day · 8/week',     included: true  },
        { label: '1 Shopping Advisor/day · 4/week',        included: true  },
        { label: 'Unlimited digital closet',               included: true  },
        { label: 'Outfit builder',                         included: true  },
        { label: 'Social feed',                            included: true  },
        { label: 'Colour season analysis',                 included: false },
        { label: 'Ads-free experience',                    included: false },
        { label: 'AI response priority',                   included: false },
      ] : [
        { label: '2 richieste stylist/giorno · 8/sett',    included: true  },
        { label: '1 Shopping Advisor/giorno · 4/sett',     included: true  },
        { label: 'Armadio digitale illimitato',            included: true  },
        { label: 'Outfit builder',                         included: true  },
        { label: 'Social feed',                            included: true  },
        { label: 'Analisi armocromia AI',                  included: false },
        { label: 'Annunci pubblicitari',                   included: false },
        { label: 'Priorità risposte AI',                   included: false },
      ],
    },
    {
      family: 'premium',
      idMonthly: 'premium', idAnnual: 'premium_annual',
      name: 'Premium',
      priceMonthly: 4.99, priceAnnual: 47.99,
      tagline: lang === 'en'
        ? 'For those who want the AI stylist always at hand.'
        : 'Per chi vuole lo stylist AI sempre a portata di mano.',
      features: lang === 'en' ? [
        { label: '30 AI stylist requests/day · 120/week', included: true  },
        { label: '5 Shopping Advisor/day · 20/week',      included: true  },
        { label: 'Colour season analysis (2×/week)',      included: true  },
        { label: 'Unlimited digital closet',              included: true  },
        { label: 'Advanced outfit builder',               included: true  },
        { label: 'Social feed',                           included: true  },
        { label: 'Ads-free experience',                   included: false },
        { label: 'AI response priority',                  included: true  },
      ] : [
        { label: '30 richieste stylist/giorno · 120/sett', included: true  },
        { label: '5 Shopping Advisor/giorno · 20/sett',    included: true  },
        { label: 'Armocromia AI (2×/settimana)',            included: true  },
        { label: 'Armadio digitale illimitato',            included: true  },
        { label: 'Outfit builder avanzato',                included: true  },
        { label: 'Social feed',                            included: true  },
        { label: 'Annunci pubblicitari',                   included: false },
        { label: 'Priorità risposte AI',                   included: true  },
      ],
    },
    {
      family: 'premium_plus',
      idMonthly: 'premium_plus', idAnnual: 'premium_plus_annual',
      name: 'Premium Plus',
      priceMonthly: 9.99, priceAnnual: 95.99,
      tagline: lang === 'en'
        ? 'The complete Endyo experience, distraction-free.'
        : "L'esperienza Endyo completa, senza distrazioni.",
      features: lang === 'en' ? [
        { label: '60 AI stylist requests/day · 240/week', included: true },
        { label: '10 Shopping Advisor/day · 40/week',     included: true },
        { label: 'Colour season analysis (5×/week)',      included: true },
        { label: 'Unlimited digital closet',              included: true },
        { label: 'Advanced outfit builder',               included: true },
        { label: 'Social feed',                           included: true },
        { label: 'Zero ads',                              included: true },
        { label: 'Maximum AI priority',                   included: true },
      ] : [
        { label: '60 richieste stylist/giorno · 240/sett', included: true },
        { label: '10 Shopping Advisor/giorno · 40/sett',   included: true },
        { label: 'Armocromia AI (5×/settimana)',            included: true },
        { label: 'Armadio digitale illimitato',            included: true },
        { label: 'Outfit builder avanzato',                included: true },
        { label: 'Social feed',                            included: true },
        { label: 'Zero annunci pubblicitari',              included: true },
        { label: 'Priorità massima AI',                    included: true },
      ],
    },
  ]

  const faqItems = t('premiumFaq')

  const tableRows = lang === 'en' ? [
    { label: 'Stylist AI/day',         free: '2',     premium: '30',   premiumPlus: '60' },
    { label: 'Stylist AI/week',        free: '8',     premium: '120',  premiumPlus: '240' },
    { label: 'Shopping Advisor/day',   free: '1',     premium: '5',    premiumPlus: '10' },
    { label: 'Shopping Advisor/week',  free: '4',     premium: '20',   premiumPlus: '40' },
    { label: 'Colour season analysis/week', free: '—', premium: '2',   premiumPlus: '5' },
    { label: 'Digital wardrobe',       free: true,    premium: true,   premiumPlus: true },
    { label: 'Outfit builder',         free: true,    premium: true,   premiumPlus: true },
    { label: 'Social feed',            free: true,    premium: true,   premiumPlus: true },
    { label: 'Zero ads',               free: false,   premium: false,  premiumPlus: true },
    { label: 'AI priority',            free: false,   premium: true,   premiumPlus: true },
    { label: 'Monthly price',          free: 'Free',  premium: '€4.99',  premiumPlus: '€9.99' },
    { label: 'Annual price',           free: 'Free',  premium: '€47.99', premiumPlus: '€95.99' },
  ] : [
    { label: 'Stylist AI/giorno',      free: '2',      premium: '30',   premiumPlus: '60' },
    { label: 'Stylist AI/settimana',   free: '8',      premium: '120',  premiumPlus: '240' },
    { label: 'Shopping Advisor/giorno', free: '1',     premium: '5',    premiumPlus: '10' },
    { label: 'Shopping Advisor/sett',  free: '4',      premium: '20',   premiumPlus: '40' },
    { label: 'Armocromia AI/settimana', free: '—',     premium: '2',    premiumPlus: '5' },
    { label: 'Armadio digitale',       free: true,     premium: true,   premiumPlus: true },
    { label: 'Outfit builder',         free: true,     premium: true,   premiumPlus: true },
    { label: 'Social feed',            free: true,     premium: true,   premiumPlus: true },
    { label: 'Zero annunci',           free: false,    premium: false,  premiumPlus: true },
    { label: 'Priorità risposte AI',   free: false,    premium: true,   premiumPlus: true },
    { label: 'Prezzo mensile',         free: 'Gratis', premium: '€4.99',  premiumPlus: '€9.99' },
    { label: 'Prezzo annuale',         free: 'Gratis', premium: '€47.99', premiumPlus: '€95.99' },
  ]

  return (
    <div style={{
      maxWidth: 860, margin: '0 auto',
      padding: isMobile ? '16px 16px' : '32px 24px 60px',
      paddingBottom: isMobile ? 'calc(env(safe-area-inset-bottom, 0px) + 140px)' : '60px',
      animation: 'slideUp 0.32s ease backwards',
    }}>

      {/* Back button su mobile */}
      {isMobile && (
        <button
          onClick={() => navigate(-1)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--primary-light)', fontSize: 15, fontWeight: 600,
            padding: '0 0 20px', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          {lang === 'en' ? 'Back' : 'Indietro'}
        </button>
      )}

      {/* Modal conferma downgrade */}
      <DowngradeConfirmModal
        isOpen={showDowngradeModal}
        onConfirm={handleConfirmDowngrade}
        onCancel={() => setShowDowngradeModal(false)}
        expiryDate={planExpiresAt ? fmtDate(planExpiresAt, lang) : null}
        planName={currentPlanName}
        loading={loading}
        lang={lang}
      />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'success' ? '#166534' : toast.type === 'info' ? '#1e3a5f' : '#7f1d1d',
          color: 'white', padding: '12px 22px', borderRadius: 12,
          fontSize: 13, fontWeight: 600, zIndex: 9999,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          border: `1px solid ${toast.type === 'success' ? '#15803d' : toast.type === 'info' ? '#1d4ed8' : '#991b1b'}`,
          maxWidth: 480, textAlign: 'center',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'var(--primary-dim)',
          border: '1px solid var(--primary-border)',
          borderRadius: 99, padding: '6px 16px', marginBottom: 18,
          color: 'var(--primary)', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
        }}>
          <IconCrown size={13} />
          {t('premiumBadge')}
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', marginBottom: 10, lineHeight: 1.15 }}>
          {t('premiumTitle')}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 460, margin: '0 auto 24px' }}>
          {t('premiumSubtitle')}
        </p>

        {/* Toggle mensile / annuale */}
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 99, padding: 4,
        }}>
          {['monthly', 'annual'].map(b => (
            <button
              key={b}
              onClick={() => setBilling(b)}
              style={{
                padding: '7px 20px', borderRadius: 99, border: 'none',
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.18s ease',
                background: billing === b ? 'var(--primary)' : 'transparent',
                color: billing === b ? 'white' : 'var(--text-dim)',
              }}
            >
              {b === 'monthly' ? t('premiumBillingMonthly') : t('premiumBillingAnnual')}
              {b === 'annual' && (
                <span style={{
                  marginLeft: 7, fontSize: 9.5, fontWeight: 800,
                  background: billing === 'annual' ? 'rgba(255,255,255,0.22)' : 'rgba(34,197,94,0.15)',
                  color: billing === 'annual' ? 'white' : '#16a34a',
                  padding: '1px 6px', borderRadius: 99,
                }}>
                  ~20% off
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Piano cards */}
      <div style={isMobile ? {
        display: 'flex', gap: 16, marginBottom: 48,
        overflowX: 'auto',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 8,
        paddingLeft: 4, paddingRight: 4,
        /* Hide scrollbar */
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      } : {
        display: 'flex', gap: 16, alignItems: 'stretch', marginBottom: 48,
      }}>
        <style>{`
          .plan-cards-scroll::-webkit-scrollbar { display: none; }
        `}</style>
        {PLANS.map(plan => (
          <div key={plan.family} style={isMobile ? {
            minWidth: '82vw', scrollSnapAlign: 'center', flexShrink: 0,
            display: 'flex', flexDirection: 'column',
          } : { flex: 1, display: 'flex', flexDirection: 'column' }}>
            <PlanCard
              plan={plan}
              currentPlan={currentPlan}
              billing={billing}
              onUpgrade={handleUpgrade}
              onRequestDowngrade={handleRequestDowngrade}
              onCancelDowngrade={handleCancelDowngrade}
              loading={loading}
              planExpiresAt={planExpiresAt}
              scheduledDowngradeTo={scheduledDowngradeTo}
              lang={lang}
              t={t}
            />
          </div>
        ))}
      </div>

      {/* Tabella comparativa */}
      <div style={{
        background: 'var(--surface)', borderRadius: 16,
        border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 36,
      }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
            {t('premiumCompareTitle')}
          </h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--card)' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11.5, color: 'var(--text-dim)', fontWeight: 600 }}>
                {t('premiumFeatureLabel')}
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11.5, color: 'var(--text-dim)', fontWeight: 600 }}>Free</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11.5, color: 'var(--primary)', fontWeight: 700, background: 'var(--primary-hover-bg)' }}>Premium</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11.5, color: '#f59e0b', fontWeight: 700, background: 'rgba(251,191,36,0.06)' }}>Premium Plus</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, i) => (
              <FeatureRow key={i} label={row.label} free={row.free} premium={row.premium} premiumPlus={row.premiumPlus} />
            ))}
          </tbody>
        </table>
      </div>

      {/* FAQ — accordion animato */}
      <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 14 }}>
        {t('premiumFaqTitle')}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.isArray(faqItems) && faqItems.map((item, i) => (
          <FaqItem
            key={i}
            question={item.q}
            answer={item.a}
            isOpen={openFaq === i}
            onToggle={() => setOpenFaq(openFaq === i ? null : i)}
          />
        ))}
      </div>
    </div>
  )
}
