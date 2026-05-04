import { NavLink } from 'react-router-dom'
import { useState, useCallback, useEffect } from 'react'
import useWardrobeStore from '../store/wardrobeStore'
import useAuthStore from '../store/authStore'
import { useT } from '../i18n'
const logoUrl = './Endyoapp.png?v=3'
import { imgUrl, getAdBrands } from '../api/client'
import useIsMobile from '../hooks/useIsMobile'

// ── Ad slot navbar ────────────────────────────────────────────────────────────
const ADSENSE_CLIENT_ID_NAV = 'ca-pub-XXXXXXXXXXXXXXXXX'  // ← sostituisci
const ADSENSE_SLOT_ID_NAV   = 'YYYYYYYYYY'                // ← slot verticale navbar
const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')

function NavAdSlot({ plan }) {
  const [ad, setAd]   = useState(null)
  const [idx, setIdx] = useState(0)
  const [ads, setAds] = useState([])

  const load = useCallback(() => {
    getAdBrands().then(data => { if (data?.length) setAds(data) }).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const rot = setInterval(() => setIdx(i => i + 1), 45000)
    const rel = setInterval(load, 300000)
    return () => { clearInterval(rot); clearInterval(rel) }
  }, [load])

  useEffect(() => {
    if (ads.length) setAd(ads[idx % ads.length])
  }, [ads, idx])

  // AdSense su web
  useEffect(() => {
    if (!isElectron && !ADSENSE_CLIENT_ID_NAV.includes('XXX')) {
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}) } catch {}
    }
  }, [])

  // Premium Plus: nessuna pubblicità (incl. variante annuale)
  if (plan === 'premium_plus' || plan === 'premium_plus_annual') return null

  // Web + AdSense configurato
  if (!isElectron && !ADSENSE_CLIENT_ID_NAV.includes('XXX')) {
    return (
      <ins className="adsbygoogle"
        style={{ display: 'block', width: 200, height: 200 }}
        data-ad-client={ADSENSE_CLIENT_ID_NAV}
        data-ad-slot={ADSENSE_SLOT_ID_NAV}
      />
    )
  }

  // Electron con brand ad
  if (ad) {
    return (
      <a
        href={ad.buy_url || '#'} target="_blank" rel="noopener noreferrer"
        style={{
          display: 'block', borderRadius: 10, overflow: 'hidden',
          border: '1px solid var(--border)', textDecoration: 'none',
          color: 'inherit', background: 'var(--card)',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        {ad.photo_url && (
          <img src={imgUrl(ad.photo_url)} alt={ad.name}
            style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
          />
        )}
        <div style={{ padding: '7px 9px 8px' }}>
          <div style={{ fontSize: 9, color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
            Sponsorizzato · {ad.brand_name}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ad.name}
          </div>
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {ad.price && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ad.currency}{ad.price}</span>}
            <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--primary)', color: 'white', borderRadius: 5, padding: '2px 8px' }}>
              Scopri →
            </span>
          </div>
        </div>
      </a>
    )
  }

  // Placeholder se non ci sono brand
  return (
    <div style={{
      borderRadius: 10, border: '1px dashed var(--border)',
      padding: '12px 10px', textAlign: 'center',
      color: 'var(--text-dim)', fontSize: 10, lineHeight: 1.4,
    }}>
      <div style={{ fontSize: 18, marginBottom: 4, opacity: 0.4 }}>📢</div>
      Spazio pubblicitario
    </div>
  )
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

const IconWardrobe = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5"/>
    <rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/>
    <rect x="14" y="14" width="7" height="7" rx="1.5"/>
  </svg>
)

const IconUpload = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
)

const IconOutfits = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
)

const IconFriends = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)

const IconCrown = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 20h20M5 20l-2-9 5 4 4-8 4 8 5-4-2 9" />
  </svg>
)

const IconSettings = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)

// ── Nav link generico con hover accent ────────────────────────────────────────
function NavItem({ to, icon: Icon, label, tourId, isMobile }) {
  const [hovered, setHovered] = useState(false)

  // ── Mobile: icona + label verticale ──────────────────────────────────────
  if (isMobile) {
    return (
      <NavLink
        to={to}
        {...(tourId ? { 'data-tour': tourId } : {})}
        style={({ isActive }) => ({
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          minWidth: 52,
          flexShrink: 0,
          padding: '6px 4px',
          textDecoration: 'none',
          color: isActive ? 'var(--primary-light)' : 'var(--text-dim)',
          borderTop: isActive ? '2px solid var(--primary)' : '2px solid transparent',
          background: 'transparent',
          transition: 'color 0.15s',
          userSelect: 'none',
        })}
      >
        {({ isActive }) => (
          <>
            <span style={{ display: 'flex', alignItems: 'center', color: isActive ? 'var(--primary-light)' : 'var(--text-dim)' }}>
              <Icon size={19} />
            </span>
            <span style={{ fontSize: 9, fontWeight: isActive ? 600 : 400, lineHeight: 1, textAlign: 'center', whiteSpace: 'nowrap' }}>
              {label}
            </span>
          </>
        )}
      </NavLink>
    )
  }

  // ── Desktop: sidebar item ─────────────────────────────────────────────────
  return (
    <NavLink
      to={to}
      {...(tourId ? { 'data-tour': tourId } : {})}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '9px 12px',
        borderRadius: 9,
        textDecoration: 'none',
        fontSize: 13.5,
        fontWeight: isActive ? 600 : 450,
        letterSpacing: isActive ? '-0.01em' : '0',
        color: isActive ? 'var(--text)' : hovered ? 'var(--text-muted)' : 'var(--text-dim)',
        background: isActive
          ? 'var(--nav-active-bg)'
          : hovered
            ? 'var(--primary-hover-bg)'
            : 'transparent',
        position: 'relative',
        transition: 'all 0.15s ease',
        userSelect: 'none',
      })}
    >
      {({ isActive }) => (
        <>
          {/* Active accent bar */}
          {isActive && (
            <span style={{
              position: 'absolute',
              left: 0, top: '20%', bottom: '20%',
              width: 3,
              borderRadius: '0 3px 3px 0',
              background: 'var(--primary)',
            }} />
          )}
          <span style={{
            color: isActive || hovered ? 'var(--primary)' : 'inherit',
            display: 'flex',
            alignItems: 'center',
            opacity: isActive ? 1 : hovered ? 0.85 : 0.55,
            transition: 'color 0.15s, opacity 0.15s',
          }}>
            <Icon size={17} />
          </span>
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

// ── Link Premium con hover accent ─────────────────────────────────────────────
function PremiumNavItem({ user }) {
  const [hovered, setHovered] = useState(false)
  const isPlusUser = user?.plan?.startsWith('premium_plus')

  return (
    <NavLink
      to="/premium"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 11,
        padding: '9px 12px', borderRadius: 9, textDecoration: 'none',
        fontSize: 13.5, fontWeight: isActive ? 600 : 450,
        letterSpacing: isActive ? '-0.01em' : '0',
        color: isPlusUser
          ? (isActive ? '#f59e0b' : hovered ? '#f59e0b' : '#d97706')
          : (isActive ? 'var(--text)' : hovered ? 'var(--text-muted)' : 'var(--text-dim)'),
        background: isActive
          ? 'var(--nav-active-bg)'
          : hovered
            ? 'var(--primary-hover-bg)'
            : 'transparent',
        position: 'relative', transition: 'all 0.15s ease', userSelect: 'none',
      })}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span style={{
              position: 'absolute', left: 0, top: '20%', bottom: '20%',
              width: 3, borderRadius: '0 3px 3px 0',
              background: isPlusUser ? '#f59e0b' : 'var(--primary)',
            }} />
          )}
          <span style={{
            display: 'flex', alignItems: 'center',
            color: isActive || hovered ? (isPlusUser ? '#f59e0b' : 'var(--primary)') : 'inherit',
            opacity: isActive ? 1 : hovered ? 0.85 : 0.55,
            transition: 'color 0.15s, opacity 0.15s',
          }}>
            <IconCrown size={17} />
          </span>
          <span>Premium</span>
          {/* Badge piano attivo */}
          {user?.plan && user.plan !== 'free' && (
            <span style={{
              marginLeft: 'auto',
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '2px 7px', borderRadius: 99,
              background: user.plan?.startsWith('premium_plus')
                ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
                : 'linear-gradient(135deg, var(--primary), #c084fc)',
              color: 'white',
            }}>
              {user.plan?.startsWith('premium_plus') ? 'Plus' : 'Pro'}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

// ── User avatar ───────────────────────────────────────────────────────────────
function UserAvatar({ username, profilePicture, small }) {
  const picSrc = profilePicture ? imgUrl(profilePicture) : null
  const size   = small ? 22 : 32

  const initials = (username || '?')
    .split(/[._-]/)
    .map(p => p[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase()

  if (picSrc) {
    return (
      <div style={{
        width: size, height: size,
        borderRadius: '50%',
        border: `${small ? 1.5 : 2}px solid var(--primary)`,
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        <img
          src={picSrc}
          alt={username}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
      </div>
    )
  }

  return (
    <div style={{
      width: size, height: size,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, var(--primary), #c084fc)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: small ? 9 : 12, fontWeight: 700, color: 'white',
      flexShrink: 0,
      letterSpacing: '0.02em',
    }}>
      {initials}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Navbar() {
  const garments = useWardrobeStore(s => s.garments)
  const outfits  = useWardrobeStore(s => s.outfits)
  const profile  = useWardrobeStore(s => s.profile)
  const user     = useAuthStore(s => s.user)
  const t        = useT()
  const isMobile = useIsMobile()

  const LINKS = [
    { to: '/wardrobe', icon: IconWardrobe, label: t('navWardrobe'), tourId: 'nav-wardrobe' },
    { to: '/upload',   icon: IconUpload,   label: t('navUpload'),   tourId: 'nav-upload'   },
    { to: '/outfits',  icon: IconOutfits,  label: t('navOutfits'),  tourId: 'nav-outfits'  },
    { to: '/friends',  icon: IconFriends,  label: t('navFriends'),  tourId: 'nav-friends'  },
    // Shopping Advisor rimosso dalla nav: accessibile dal bottone nell'header Armadio
  ]

  // ── Mobile: bottom horizontal nav bar (scrollable, 8 items) ─────────────────
  if (isMobile) {
    const isPlusUser = user?.plan?.startsWith('premium_plus')
    return (
      <nav style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        height: 58,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        zIndex: 200,
        userSelect: 'none',
        paddingBottom: 'env(safe-area-inset-bottom)',
        overflowX: 'auto',
        overflowY: 'hidden',
        // hide scrollbar
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}>
        {LINKS.map(l => (
          <NavItem key={l.to} to={l.to} icon={l.icon} label={l.label} tourId={l.tourId} isMobile />
        ))}
        {/* Premium */}
        <NavLink
          to="/premium"
          style={({ isActive }) => ({
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, minWidth: 52, padding: '6px 4px', textDecoration: 'none', flexShrink: 0,
            color: isActive ? '#f59e0b' : isPlusUser ? '#d97706' : 'var(--text-dim)',
            borderTop: isActive ? '2px solid #f59e0b' : '2px solid transparent',
            background: 'transparent', transition: 'color 0.15s',
          })}
        >
          {({ isActive }) => (
            <>
              <span style={{ display: 'flex', color: 'inherit' }}><IconCrown size={19} /></span>
              <span style={{ fontSize: 9, fontWeight: isActive ? 600 : 400, lineHeight: 1, textAlign: 'center', whiteSpace: 'nowrap' }}>Premium</span>
            </>
          )}
        </NavLink>
        {/* Settings */}
        <NavItem to="/settings" icon={IconSettings} label={t('navSettings')} isMobile />
        {/* Profile tab */}
        <NavLink
          to="/profile"
          data-tour="nav-profile"
          style={({ isActive }) => ({
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, minWidth: 52, padding: '6px 4px', textDecoration: 'none', flexShrink: 0,
            color: isActive ? 'var(--primary-light)' : 'var(--text-dim)',
            borderTop: isActive ? '2px solid var(--primary)' : '2px solid transparent',
            background: 'transparent', transition: 'color 0.15s',
          })}
        >
          {({ isActive }) => (
            <>
              <UserAvatar username={user?.username} profilePicture={profile?.profile_picture} small />
              <span style={{ fontSize: 9, fontWeight: isActive ? 600 : 400, lineHeight: 1, textAlign: 'center', whiteSpace: 'nowrap', color: isActive ? 'var(--primary-light)' : 'var(--text-dim)' }}>
                Profilo
              </span>
            </>
          )}
        </NavLink>
      </nav>
    )
  }

  // ── Desktop: vertical sidebar ─────────────────────────────────────────────
  return (
    <nav style={{
      width: 220,
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '20px 10px 16px',
      flexShrink: 0,
      userSelect: 'none',
    }}>

      {/* ── Logo ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '4px 6px 20px',
        marginBottom: 4,
      }}>
        <img
          src={logoUrl}
          alt="Endyo"
          style={{ width: 32, height: 32, borderRadius: 9, objectFit: 'contain', flexShrink: 0 }}
        />
        <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--primary-light)' }}>
          Endyo
        </div>
      </div>

      {/* ── Main nav ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: '0.1em',
          color: 'var(--text-dim)',
          padding: '0 12px',
          marginBottom: 6,
          textTransform: 'uppercase',
        }}>
          {t('navMenuLabel') || 'Menu'}
        </div>

        {LINKS.map(l => (
          <NavItem key={l.to} to={l.to} icon={l.icon} label={l.label} tourId={l.tourId} />
        ))}
      </div>

      {/* ── Premium + Settings ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 12 }}>
        <PremiumNavItem user={user} />
        <NavItem to="/settings" icon={IconSettings} label={t('navSettings')} tourId="nav-settings" />
      </div>

      {/* ── Ad slot ── */}
      {!user?.plan?.startsWith('premium_plus') && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', opacity: 0.45, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, paddingLeft: 2 }}>
            Annunci
          </div>
          <NavAdSlot plan={user?.plan} />
        </div>
      )}

      {/* ── User section ── */}
      <NavLink
        to="/profile"
        data-tour="nav-profile"
        style={{ textDecoration: 'none' }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 10px',
          borderRadius: 10,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          transition: 'border-color 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <UserAvatar username={user?.username} profilePicture={profile?.profile_picture} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: 1, minWidth: 0,
              }}>
                {user?.username || 'Utente'}
              </div>
              {/* Piano badge */}
              {user?.plan?.startsWith('premium_plus') && (
                <span style={{
                  fontSize: 8, fontWeight: 800, letterSpacing: '0.04em',
                  background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                  color: 'white', padding: '2px 6px', borderRadius: 99,
                  flexShrink: 0,
                }}>PLUS</span>
              )}
              {(user?.plan === 'premium' || user?.plan === 'premium_annual') && (
                <span style={{
                  fontSize: 8, fontWeight: 800, letterSpacing: '0.04em',
                  background: 'linear-gradient(135deg, var(--primary), #c084fc)',
                  color: 'white', padding: '2px 6px', borderRadius: 99,
                  flexShrink: 0,
                }}>PRO</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {garments.length} {t('navItemsLabel') || 'capi'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', opacity: 0.4 }}>·</span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {outfits.length} {t('navOutfitsLabel') || 'outfit'}
              </span>
            </div>
          </div>
        </div>
      </NavLink>
    </nav>
  )
}
