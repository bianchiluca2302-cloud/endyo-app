import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore, { ACCENT_COLORS } from '../store/settingsStore'
import { imgUrl, fetchFollowers, fetchFollowing, redeemPromoCode } from '../api/client'

/* ── Avatar ──────────────────────────────────────────────────────────────────── */
function Avatar({ src, username, size = 72 }) {
  const [imgError, setImgError] = useState(false)
  const picSrc = src ? imgUrl(src) : null
  const initial = (username || '?')[0].toUpperCase()
  const fallback = (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, var(--primary), var(--primary-light))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 800, fontSize: size * 0.38,
      border: '2px solid var(--primary-border)',
      flexShrink: 0,
    }}>{initial}</div>
  )
  if (picSrc && !imgError) {
    return <img src={picSrc} alt={username} onError={() => setImgError(true)} style={{
      width: size, height: size, borderRadius: '50%', objectFit: 'cover',
      border: '2px solid var(--primary-border)', flexShrink: 0,
    }} />
  }
  return fallback
}

/* ── PlanBadge ───────────────────────────────────────────────────────────────── */
function PlanBadge({ plan }) {
  if (!plan || plan === 'free') return null
  const isPlus = plan === 'premium_plus'
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.03em',
      padding: '1.5px 6px', borderRadius: 99, flexShrink: 0,
      background: isPlus ? 'rgba(245,158,11,0.14)' : 'rgba(139,92,246,0.14)',
      color: isPlus ? '#f59e0b' : 'var(--primary-light)',
      border: `1px solid ${isPlus ? 'rgba(245,158,11,0.28)' : 'var(--primary-border)'}`,
    }}>
      {isPlus ? 'Plus' : 'Premium'}
    </span>
  )
}

/* ── SpecialBadge ────────────────────────────────────────────────────────────── */
const SPECIAL_BADGE_CONFIG = {
  tester:      { label: '🔧 Tester',      bg: 'rgba(16,185,129,0.14)',  color: '#10b981', border: 'rgba(16,185,129,0.28)' },
  chillington: { label: '🏚️ Chillington', bg: 'rgba(239,68,68,0.14)',   color: '#ef4444', border: 'rgba(239,68,68,0.28)' },
}
function SpecialBadge({ badge, size = 9 }) {
  if (!badge) return null
  const keys = badge.split(',').map(s => s.trim()).filter(Boolean)
  return keys.map(k => {
    const cfg = SPECIAL_BADGE_CONFIG[k]
    if (!cfg) return null
    return (
      <span key={k} style={{
        fontSize: size, fontWeight: 700, letterSpacing: '0.03em',
        padding: size > 9 ? '3px 10px' : '1.5px 6px', borderRadius: 99, flexShrink: 0,
        background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
        display: 'inline-flex', alignItems: 'center',
      }}>
        {cfg.label}
      </span>
    )
  })
}

/* ── FollowListSheet ─────────────────────────────────────────────────────────── */
function FollowListSheet({ mode, onClose, language, onSelectUser }) {
  const [users,    setUsers]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [dragY,    setDragY]    = useState(0)
  const startYRef  = useRef(0)
  const draggingRef = useRef(false)
  const sheetRef   = useRef(null)

  const en = language === 'en'

  useEffect(() => {
    setLoading(true)
    const fn = mode === 'followers' ? fetchFollowers : fetchFollowing
    fn().then(list => setUsers(list || [])).catch(() => setUsers([])).finally(() => setLoading(false))
  }, [mode])

  const onHandleTouchStart = (e) => { startYRef.current = e.touches[0].clientY; draggingRef.current = true }
  const onHandleTouchMove  = (e) => {
    if (!draggingRef.current) return
    const delta = e.touches[0].clientY - startYRef.current
    if (delta > 0) { setDragY(delta); e.preventDefault() }
  }
  const onHandleTouchEnd   = () => {
    draggingRef.current = false
    const sheetH = sheetRef.current?.offsetHeight || 400
    if (dragY > sheetH * 0.35) { setDragY(0); onClose() }
    else setDragY(0)
  }

  const q = search.toLowerCase().trim()
  const filtered = q ? users.filter(u => u.username?.toLowerCase().includes(q)) : users

  const title = mode === 'followers'
    ? (en ? 'Followers' : 'Follower')
    : (en ? 'Following' : 'Seguiti')

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 700 }} />
      <div
        ref={sheetRef}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 701,
          background: 'var(--surface)',
          borderRadius: '20px 20px 0 0',
          height: '92vh', display: 'flex', flexDirection: 'column',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: `translateY(${dragY}px)`,
          transition: dragY > 0 ? 'none' : 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        {/* Handle + header */}
        <div
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          style={{
            flexShrink: 0, touchAction: 'none', cursor: 'grab',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
            <div style={{ width: 44, height: 5, borderRadius: 99, background: 'var(--border)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 14px' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
              {title}
              {!loading && (
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-dim)', marginLeft: 8 }}>
                  {users.length}
                </span>
              )}
            </div>
            <button onClick={onClose} style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '50%',
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text)',
            }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Search */}
          <div style={{ padding: '0 16px 14px' }}>
            <div style={{ position: 'relative' }}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={2} strokeLinecap="round"
                style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={en ? 'Search…' : 'Cerca…'}
                style={{
                  width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12,
                  background: 'var(--card)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        </div>

        {/* User list */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {loading ? (
            <div style={{ padding: '32px 0', display: 'flex', justifyContent: 'center' }}>
              <div className="spinner" />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
              {search
                ? (en ? 'No results' : 'Nessun risultato')
                : (en ? `No ${title.toLowerCase()} yet` : `Nessun ${mode === 'followers' ? 'follower' : 'utente seguito'} ancora`)}
            </div>
          ) : (
            filtered.map(u => (
              <button
                key={u.id}
                onClick={() => onSelectUser(u.username)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 20px', background: 'transparent', border: 'none',
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  borderBottom: '1px solid var(--border)', textAlign: 'left',
                }}
              >
                <Avatar src={u.profile_picture} username={u.username} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      @{u.username}
                    </span>
                    <PlanBadge plan={u.plan} />
                    <SpecialBadge badge={u.special_badge} />
                  </div>
                  {u.bio && (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.bio}
                    </div>
                  )}
                </div>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={2} strokeLinecap="round">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  )
}

/* ── Stat bubble ─────────────────────────────────────────────────────────────── */
function Stat({ value, label, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        textAlign: 'center', flex: 1, padding: '14px 6px',
        cursor: onClick ? 'pointer' : 'default',
        WebkitTapHighlightColor: onClick ? 'rgba(0,0,0,0.04)' : 'transparent',
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em', color: color || 'var(--text)' }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

/* ── Menu row ────────────────────────────────────────────────────────────────── */
function MenuRow({ icon, label, sublabel, onPress, accent, danger }) {
  return (
    <button onClick={onPress} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 16px', background: 'transparent', border: 'none',
      cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      borderBottom: '1px solid var(--border)',
      textAlign: 'left',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: danger
          ? 'rgba(239,68,68,0.1)'
          : accent
            ? 'rgba(245,158,11,0.1)'
            : 'var(--card)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: danger ? '#f87171' : accent ? '#f59e0b' : 'var(--text-muted)',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: danger ? '#f87171' : 'var(--text)' }}>
          {label}
        </div>
        {sublabel && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{sublabel}</div>
        )}
      </div>
      {!danger && (
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none"
          stroke="var(--text-dim)" strokeWidth={2} strokeLinecap="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      )}
    </button>
  )
}

/* ── Section title ───────────────────────────────────────────────────────────── */
function SectionTitle({ text }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: 'var(--text-dim)',
      padding: '20px 16px 8px',
    }}>{text}</div>
  )
}

/* ── Icons ───────────────────────────────────────────────────────────────────── */
const CrownIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 20h20M5 20l-2-9 5 4 4-8 4 8 5-4-2 9"/>
  </svg>
)
const SettingsIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>
)
const PersonIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)
const LogoutIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
  </svg>
)
const GiftIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/>
    <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
  </svg>
)

/* ── Main component ──────────────────────────────────────────────────────────── */
export default function MobileProfile() {
  const navigate  = useNavigate()
  const user      = useAuthStore(s => s.user)
  const logout    = useAuthStore(s => s.logout)
  const profile   = useWardrobeStore(s => s.profile)
  const garments  = useWardrobeStore(s => s.garments)
  const outfits   = useWardrobeStore(s => s.outfits)
  const language   = useSettingsStore(s => s.language) || 'it'
  const accentColor = useSettingsStore(s => s.accentColor) || 'amber'
  const accentHex  = (ACCENT_COLORS.find(c => c.id === accentColor) || ACCENT_COLORS[0]).hex

  const [followSheet,       setFollowSheet]       = useState(null)   // null | 'followers' | 'following'
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showRedeemSheet,   setShowRedeemSheet]   = useState(false)
  const [redeemCode,        setRedeemCode]        = useState('')
  const [redeemStatus,      setRedeemStatus]      = useState(null)   // null | 'loading' | 'success' | 'error'
  const [redeemMessage,     setRedeemMessage]     = useState('')

  const handleRedeem = async () => {
    if (!redeemCode.trim()) return
    setRedeemStatus('loading')
    try {
      const res = await redeemPromoCode(redeemCode.trim())
      setRedeemStatus('success')
      setRedeemMessage(en
        ? `Code applied! +${res.reward?.upload_extra ?? 0} extra uploads unlocked.`
        : `Codice applicato! +${res.reward?.upload_extra ?? 0} upload extra sbloccati.`)
    } catch (err) {
      setRedeemStatus('error')
      const status = err?.response?.status
      setRedeemMessage(status === 404
        ? (en ? 'Code not found.' : 'Codice non trovato.')
        : status === 409
          ? (en ? 'Code already used.' : 'Codice già utilizzato.')
          : (en ? 'Something went wrong.' : 'Qualcosa è andato storto.'))
    }
  }

  const closeRedeemSheet = () => {
    setShowRedeemSheet(false)
    setRedeemCode('')
    setRedeemStatus(null)
    setRedeemMessage('')
  }

  const isPremium = user?.plan && user.plan !== 'free'
  const isPlus    = user?.plan?.startsWith('premium_plus')
  const en        = language === 'en'

  const handleLogout = () => {
    logout()
    navigate('/auth', { replace: true })
  }

  const openUserProfile = (username) => {
    setFollowSheet(null)
    navigate('/friends', { state: { openProfile: username } })
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '16px',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div onClick={() => navigate('/edit-profile')} style={{ cursor: 'pointer' }}>
            <Avatar src={profile?.profile_picture} username={user?.username} size={68} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em',
              color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {user?.username || (en ? 'User' : 'Utente')}
            </div>
            {user?.email && (
              <div style={{
                fontSize: 12, color: 'var(--text-dim)', marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {user.email}
              </div>
            )}
            {profile?.bio && (
              <div style={{
                fontSize: 12, color: 'var(--text-muted)', marginTop: 4,
                lineHeight: 1.4,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {profile.bio}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: isPremium || user?.special_badge ? 6 : 0 }}>
              {isPremium && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 10px', borderRadius: 99,
                  fontSize: 11, fontWeight: 700,
                  background: isPlus ? 'rgba(245,158,11,0.12)' : 'var(--primary-dim)',
                  border: `1px solid ${isPlus ? 'rgba(245,158,11,0.3)' : 'var(--primary-border)'}`,
                  color: isPlus ? '#f59e0b' : 'var(--primary-light)',
                }}>
                  <CrownIcon />
                  {isPlus ? 'Plus' : 'Pro'}
                </span>
              )}
              <SpecialBadge badge={user?.special_badge} size={11} />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{
          display: 'flex', marginTop: 18,
          background: 'var(--card)',
          borderRadius: 14, border: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          <Stat value={garments.length} label={en ? 'items' : 'capi'} />
          <div style={{ width: 1, background: 'var(--border)', margin: '10px 0' }} />
          <Stat value={outfits.length} label="outfit" />
          <div style={{ width: 1, background: 'var(--border)', margin: '10px 0' }} />
          <Stat
            value={profile?.following_count ?? 0}
            label={en ? 'following' : 'seguiti'}
            onClick={() => setFollowSheet('following')}
          />
          <div style={{ width: 1, background: 'var(--border)', margin: '10px 0' }} />
          <Stat
            value={profile?.followers_count ?? 0}
            label={en ? 'followers' : 'follower'}
            onClick={() => setFollowSheet('followers')}
          />
        </div>
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────────── */}
      <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}>

        {/* Account */}
        <div style={{ animation: 'slideUp 0.38s ease 60ms backwards' }}>
          <SectionTitle text="Account" />
          <div style={{
            background: 'var(--surface)', borderRadius: 16,
            marginInline: 12, overflow: 'hidden', border: '1px solid var(--border)',
          }}>
            <MenuRow
              icon={<PersonIcon />}
              label={en ? 'Edit profile' : 'Modifica profilo'}
              sublabel={en ? 'Photo, username, bio' : 'Foto, username, bio'}
              onPress={() => navigate('/edit-profile')}
            />
            <MenuRow
              icon={<CrownIcon />}
              label={isPremium
                ? (en ? 'My plan' : 'Il mio piano')
                : (en ? 'Upgrade to Premium' : 'Passa a Premium')}
              sublabel={isPremium
                ? (isPlus
                    ? (en ? 'Plus plan active' : 'Piano Plus attivo')
                    : (en ? 'Pro plan active' : 'Piano Pro attivo'))
                : (en ? 'Unlock all features' : 'Sblocca tutte le funzioni')}
              onPress={() => navigate('/premium')}
              accent
            />
            <MenuRow
              icon={<GiftIcon />}
              label={en ? 'Redeem code' : 'Riscatta codice'}
              sublabel={en ? 'Enter a promo code' : 'Inserisci un codice promozionale'}
              onPress={() => setShowRedeemSheet(true)}
            />
          </div>
        </div>

        {/* App */}
        <div style={{ animation: 'slideUp 0.38s ease 130ms backwards' }}>
          <SectionTitle text="App" />
          <div style={{
            background: 'var(--surface)', borderRadius: 16,
            marginInline: 12, overflow: 'hidden', border: '1px solid var(--border)',
          }}>
            <MenuRow
              icon={<SettingsIcon />}
              label={en ? 'Settings' : 'Impostazioni'}
              sublabel={en ? 'Language, theme, notifications' : 'Lingua, tema, notifiche'}
              onPress={() => navigate('/settings')}
            />
          </div>
        </div>

        {/* Log out */}
        <div style={{ animation: 'slideUp 0.38s ease 200ms backwards', margin: '20px 12px 0' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <MenuRow
              icon={<LogoutIcon />}
              label={en ? 'Log out' : "Esci dall'account"}
              onPress={() => setShowLogoutConfirm(true)}
              danger
            />
          </div>
        </div>
      </div>

      {/* ── Logout confirm sheet ─────────────────────────────────────────────── */}
      {showLogoutConfirm && (
        <>
          <div
            onClick={() => setShowLogoutConfirm(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 800 }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 801,
            background: 'var(--surface)',
            borderRadius: '20px 20px 0 0',
            padding: '24px 20px',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
          }}>
            <div style={{ width: 44, height: 5, borderRadius: 99, background: 'var(--border)', margin: '0 auto 20px' }} />
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>
              {en ? 'Log out?' : "Esci dall'account?"}
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 24px' }}>
              {en
                ? 'You will need to log in again to access your wardrobe.'
                : 'Dovrai accedere di nuovo per usare il tuo armadio.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%', padding: 16, borderRadius: 14,
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                  color: '#f87171', fontSize: 16, fontWeight: 700, cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {en ? 'Log out' : 'Esci'}
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  width: '100%', padding: 16, borderRadius: 14,
                  background: 'var(--card)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontSize: 16, fontWeight: 600, cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {en ? 'Cancel' : 'Annulla'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Follow sheet ─────────────────────────────────────────────────────── */}
      {followSheet && (
        <FollowListSheet
          mode={followSheet}
          language={language}
          onClose={() => setFollowSheet(null)}
          onSelectUser={openUserProfile}
        />
      )}

      {/* ── Redeem code sheet ────────────────────────────────────────────────── */}
      {showRedeemSheet && (
        <>
          <div
            onClick={closeRedeemSheet}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 800 }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 801,
            background: 'var(--surface)',
            borderRadius: '20px 20px 0 0',
            padding: '24px 20px',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
          }}>
            <div style={{ width: 44, height: 5, borderRadius: 99, background: 'var(--border)', margin: '0 auto 20px' }} />
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>
              {en ? 'Redeem code' : 'Riscatta codice'}
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 20px' }}>
              {en ? 'Enter your promo code below.' : 'Inserisci il tuo codice promozionale qui sotto.'}
            </p>

            {redeemStatus === 'success' ? (
              <div style={{
                padding: '16px', borderRadius: 14, marginBottom: 16,
                background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
                color: '#10b981', fontSize: 14, fontWeight: 500, lineHeight: 1.5,
              }}>
                {redeemMessage}
              </div>
            ) : redeemStatus === 'error' ? (
              <div style={{
                padding: '16px', borderRadius: 14, marginBottom: 16,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                color: '#f87171', fontSize: 14, fontWeight: 500, lineHeight: 1.5,
              }}>
                {redeemMessage}
              </div>
            ) : null}

            {redeemStatus !== 'success' && (
              <>
                <input
                  value={redeemCode}
                  onChange={e => setRedeemCode(e.target.value.toUpperCase())}
                  placeholder={en ? 'e.g. CHILLINGTON50' : 'es. CHILLINGTON50'}
                  autoCapitalize="characters"
                  style={{
                    width: '100%', padding: '14px 16px', borderRadius: 14,
                    background: 'var(--card)', border: '1px solid var(--border)',
                    color: 'var(--text)', fontSize: 16, fontWeight: 600,
                    letterSpacing: '0.05em', outline: 'none', boxSizing: 'border-box',
                    marginBottom: 12,
                  }}
                />
                <button
                  onClick={handleRedeem}
                  disabled={redeemStatus === 'loading' || !redeemCode.trim()}
                  style={{
                    width: '100%', padding: 16, borderRadius: 14,
                    background: accentHex, border: 'none',
                    color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
                    opacity: (redeemStatus === 'loading' || !redeemCode.trim()) ? 0.5 : 1,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {redeemStatus === 'loading'
                    ? (en ? 'Applying…' : 'Applicazione…')
                    : (en ? 'Apply' : 'Applica')}
                </button>
              </>
            )}

            {redeemStatus === 'success' && (
              <button
                onClick={closeRedeemSheet}
                style={{
                  width: '100%', padding: 16, borderRadius: 14,
                  background: accentHex, border: 'none',
                  color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {en ? 'Done' : 'Fatto'}
              </button>
            )}

            <button
              onClick={closeRedeemSheet}
              style={{
                width: '100%', padding: 14, borderRadius: 14, marginTop: 10,
                background: 'var(--card)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {en ? 'Cancel' : 'Annulla'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
