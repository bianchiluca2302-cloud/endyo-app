import { NavLink } from 'react-router-dom'
import useWardrobeStore from '../store/wardrobeStore'
import useAuthStore from '../store/authStore'
import useSettingsStore from '../store/settingsStore'
import { imgUrl } from '../api/client'
import { useT } from '../i18n'

/* ── Icons ───────────────────────────────────────────────────────────────────── */
const WardrobeIcon = ({ filled }) => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={filled ? 2.2 : 1.75} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5"
      fill={filled ? 'currentColor' : 'none'} fillOpacity={filled ? 0.18 : 0}/>
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"
      fill={filled ? 'currentColor' : 'none'} fillOpacity={filled ? 0.18 : 0}/>
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"
      fill={filled ? 'currentColor' : 'none'} fillOpacity={filled ? 0.18 : 0}/>
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"
      fill={filled ? 'currentColor' : 'none'} fillOpacity={filled ? 0.18 : 0}/>
  </svg>
)

const OutfitIcon = ({ filled }) => (
  <svg width={22} height={22} viewBox="0 0 24 24" stroke="currentColor"
    strokeWidth={filled ? 2.2 : 1.75} strokeLinecap="round" strokeLinejoin="round"
    fill={filled ? 'currentColor' : 'none'} fillOpacity={filled ? 0.18 : 0}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
)

const FriendsIcon = ({ filled }) => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={filled ? 2.2 : 1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
    <circle cx="9" cy="7" r="4" fill={filled ? 'currentColor' : 'none'} fillOpacity={filled ? 0.15 : 0}/>
    <path d="M23 21v-2a4 4 0 00-3-3.87"/>
    <path d="M16 3.13a4 4 0 010 7.75"/>
  </svg>
)

/* ── Avatar mini per il tab Profilo ─────────────────────────────────────────── */
function ProfileTab({ isActive }) {
  const t       = useT()
  const lang    = useSettingsStore(s => s.language) || 'it'
  const user    = useAuthStore(s => s.user)
  const profile = useWardrobeStore(s => s.profile)
  const picSrc  = profile?.profile_picture ? imgUrl(profile.profile_picture) : null
  const profileLabel = lang === 'en' ? 'Profile' : 'Profilo'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      {picSrc ? (
        <img src={picSrc} alt="profilo" style={{
          width: 27, height: 27, borderRadius: '50%', objectFit: 'cover',
          border: `2.5px solid ${isActive ? 'var(--primary-light)' : 'var(--border)'}`,
          transition: 'border-color 0.2s',
        }} />
      ) : (
        <div style={{
          width: 27, height: 27, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--primary), var(--primary-light))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `2.5px solid ${isActive ? 'var(--primary-light)' : 'var(--border)'}`,
          fontSize: 11, fontWeight: 700, color: '#fff',
          transition: 'border-color 0.2s',
        }}>
          {(user?.username || '?')[0].toUpperCase()}
        </div>
      )}
      <span style={{
        fontSize: 10, fontWeight: isActive ? 700 : 500, lineHeight: 1,
        color: isActive ? 'var(--primary-light)' : 'var(--text-dim)',
        transition: 'color 0.15s',
      }}>{profileLabel}</span>
    </div>
  )
}

/* ── Tab item style ──────────────────────────────────────────────────────────── */
const tabItem = {
  flex: 1,
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  gap: 4,
  textDecoration: 'none',
  padding: '10px 4px 6px',
  userSelect: 'none', WebkitUserSelect: 'none',
  transition: 'color 0.15s',
  WebkitTapHighlightColor: 'transparent',
  minHeight: 56,
}
const tabLabel = { fontSize: 10, fontWeight: 500, lineHeight: 1 }

/* ── Component ───────────────────────────────────────────────────────────────── */
export default function MobileTabBar() {
  const t    = useT()
  const pb   = 'env(safe-area-inset-bottom, 0px)'

  return (
    <nav style={{
      height: 'calc(58px + env(safe-area-inset-bottom, 0px))',
      flexShrink: 0,
      background: 'var(--surface)',
      backdropFilter: 'blur(28px)',
      WebkitBackdropFilter: 'blur(28px)',
      display: 'flex', alignItems: 'stretch',
      zIndex: 500,
      overflow: 'visible',
      /* Nessun borderTop globale — ogni gruppo lo ha individualmente */
    }}>

      {/* ── LEFT GROUP: Armadio + Outfit ──────────────────────────────────────── */}
      <div style={{
        flex: 2, display: 'flex', alignItems: 'stretch',
        paddingBottom: pb,
        borderTop: '1px solid var(--border)',
      }}>
        <NavLink data-mobiletour="tab-wardrobe" to="/wardrobe" style={({ isActive }) => ({
          ...tabItem, color: isActive ? 'var(--primary-light)' : 'var(--text-dim)',
        })}>
          {({ isActive }) => (
            <>
              <WardrobeIcon filled={isActive} />
              <span style={{ ...tabLabel, fontWeight: isActive ? 700 : 500 }}>{t('navWardrobe')}</span>
            </>
          )}
        </NavLink>

        <NavLink data-mobiletour="tab-outfit" to="/outfits" style={({ isActive }) => ({
          ...tabItem, color: isActive ? 'var(--primary-light)' : 'var(--text-dim)',
        })}>
          {({ isActive }) => (
            <>
              <OutfitIcon filled={isActive} />
              <span style={{ ...tabLabel, fontWeight: isActive ? 700 : 500 }}>{t('navOutfits')}</span>
            </>
          )}
        </NavLink>
      </div>

      {/* ── CENTER: + button sporge verso l'alto, bordo continuo ─────────────── */}
      <div style={{
        flex: 1.1,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingBottom: pb,
        overflow: 'visible',
        position: 'relative',
        borderTop: '1px solid var(--border)',
      }}>
        {/* Nessun arco — il bordo corre dritto, il tasto + sporge dall'alto */}

        <NavLink data-mobiletour="tab-upload" to="/upload" style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'flex-end',
          marginBottom: 6,
          textDecoration: 'none',
          WebkitTapHighlightColor: 'transparent',
          position: 'relative', zIndex: 2,
        }}>
          {({ isActive }) => (
            <div style={{
              width: 54, height: 54, borderRadius: '50%',
              background: isActive
                ? 'linear-gradient(135deg, rgba(76,29,149,0.95), var(--primary))'
                : 'linear-gradient(135deg, var(--primary), var(--primary))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 20px var(--primary-shadow)',
              color: '#fff',
              border: '3px solid var(--bg)',
              transform: isActive ? 'scale(0.92) translateY(-8px)' : 'translateY(-8px)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}>
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth={2.2} strokeLinecap="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </div>
          )}
        </NavLink>
      </div>

      {/* ── RIGHT GROUP: Amici + Profilo ──────────────────────────────────────── */}
      <div style={{
        flex: 2, display: 'flex', alignItems: 'stretch',
        paddingBottom: pb,
        borderTop: '1px solid var(--border)',
      }}>
        <NavLink data-mobiletour="tab-friends" to="/friends" style={({ isActive }) => ({
          ...tabItem, color: isActive ? 'var(--primary-light)' : 'var(--text-dim)',
        })}>
          {({ isActive }) => (
            <>
              <FriendsIcon filled={isActive} />
              <span style={{ ...tabLabel, fontWeight: isActive ? 700 : 500 }}>{t('navFriends')}</span>
            </>
          )}
        </NavLink>

        <NavLink data-mobiletour="tab-profile" to="/profile" style={tabItem}>
          {({ isActive }) => <ProfileTab isActive={isActive} />}
        </NavLink>
      </div>

    </nav>
  )
}
