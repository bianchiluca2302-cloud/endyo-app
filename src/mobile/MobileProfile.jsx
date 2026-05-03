import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import useWardrobeStore from '../store/wardrobeStore'
import useSettingsStore from '../store/settingsStore'
import { imgUrl } from '../api/client'

/* ── Avatar ──────────────────────────────────────────────────────────────────── */
function Avatar({ src, username, size = 72 }) {
  const picSrc = src ? imgUrl(src) : null
  const initial = (username || '?')[0].toUpperCase()
  if (picSrc) {
    return <img src={picSrc} alt={username} style={{
      width: size, height: size, borderRadius: '50%', objectFit: 'cover',
      border: '3px solid var(--primary-border)',
    }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, var(--primary), var(--primary-light))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 800, fontSize: size * 0.38,
      border: '3px solid var(--primary-border)',
      flexShrink: 0,
    }}>{initial}</div>
  )
}

/* ── Stat bubble ─────────────────────────────────────────────────────────────── */
function Stat({ value, label, color }) {
  return (
    <div style={{ textAlign: 'center', flex: 1, padding: '14px 6px' }}>
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
const ShoppingIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 01-8 0"/>
  </svg>
)
const LogoutIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
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
  const language  = useSettingsStore(s => s.language) || 'it'

  const isPremium = user?.plan && user.plan !== 'free'
  const isPlus    = user?.plan?.startsWith('premium_plus')

  const handleLogout = () => {
    logout()
    navigate('/auth', { replace: true })
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 16px 16px',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar src={profile?.profile_picture} username={user?.username} size={68} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em',
              color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {user?.username || (language === 'en' ? 'User' : 'Utente')}
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
            {isPremium && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                marginTop: 6, padding: '3px 10px', borderRadius: 99,
                fontSize: 11, fontWeight: 700,
                background: isPlus ? 'rgba(245,158,11,0.12)' : 'var(--primary-dim)',
                border: `1px solid ${isPlus ? 'rgba(245,158,11,0.3)' : 'var(--primary-border)'}`,
                color: isPlus ? '#f59e0b' : 'var(--primary-light)',
              }}>
                <CrownIcon />
                {isPlus ? 'Plus' : 'Pro'}
              </span>
            )}
          </div>
        </div>

        {/* Stats — capi, outfit, follower */}
        <div style={{
          display: 'flex', marginTop: 18,
          background: 'var(--card)',
          borderRadius: 14, border: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          <Stat value={garments.length} label={language === 'en' ? 'items' : 'capi'} />
          <div style={{ width: 1, background: 'var(--border)', margin: '10px 0' }} />
          <Stat value={outfits.length} label="outfit" />
          <div style={{ width: 1, background: 'var(--border)', margin: '10px 0' }} />
          <Stat value={profile?.followers_count || 0} label={language === 'en' ? 'followers' : 'follower'} />
        </div>
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────────── */}
      <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>

        {/* Account */}
        <div style={{ animation: 'slideUp 0.38s ease 60ms backwards' }}>
          <SectionTitle text="Account" />
          <div style={{
            background: 'var(--surface)', borderRadius: 16,
            marginInline: 12, overflow: 'hidden', border: '1px solid var(--border)',
          }}>
            <MenuRow
              icon={<PersonIcon />}
              label={language === 'en' ? 'Edit profile' : 'Modifica profilo'}
              sublabel={language === 'en' ? 'Photo, username, bio' : 'Foto, username, bio'}
              onPress={() => navigate('/edit-profile')}
            />
            <MenuRow
              icon={<CrownIcon />}
              label={isPremium
                ? (language === 'en' ? 'My plan' : 'Il mio piano')
                : (language === 'en' ? 'Upgrade to Premium' : 'Passa a Premium')}
              sublabel={isPremium
                ? (isPlus
                    ? (language === 'en' ? 'Plus plan active' : 'Piano Plus attivo')
                    : (language === 'en' ? 'Pro plan active' : 'Piano Pro attivo'))
                : (language === 'en' ? 'Unlock all features' : 'Sblocca tutte le funzioni')}
              onPress={() => navigate('/premium')}
              accent
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
              label={language === 'en' ? 'Settings' : 'Impostazioni'}
              sublabel={language === 'en' ? 'Language, theme, notifications' : 'Lingua, tema, notifiche'}
              onPress={() => navigate('/settings')}
            />
          </div>
        </div>

        {/* Log out */}
        <div style={{ animation: 'slideUp 0.38s ease 200ms backwards', margin: '20px 12px 0' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <MenuRow
              icon={<LogoutIcon />}
              label={language === 'en' ? 'Log out' : "Esci dall'account"}
              onPress={handleLogout}
              danger
            />
          </div>
        </div>
      </div>

    </div>
  )
}
