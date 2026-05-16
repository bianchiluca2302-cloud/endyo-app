import { useEffect, useState } from 'react'
const logoUrl = './Endyoapp.png?v=4'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import TutorialOverlay, { shouldShowTutorial } from './components/TutorialOverlay'
import MobileTutorial from './mobile/MobileTutorial'
import ProtectedRoute from './components/ProtectedRoute'
import Wardrobe from './pages/Wardrobe'
import Upload from './pages/Upload'
import OutfitBuilder from './pages/OutfitBuilder'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Friends from './pages/Friends'
import Shopping from './pages/Shopping'
import Premium from './pages/Premium'
import AuthPage from './pages/AuthPage'
import LocationBanner from './components/LocationBanner'
import VerifyEmailPage from './pages/VerifyEmailPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import useWardrobeStore from './store/wardrobeStore'
import useAuthStore from './store/authStore'
import useSettingsStore, { applyTheme, ACCENT_COLORS, THEMES } from './store/settingsStore'
import { authRefresh, authMe } from './api/client'
import useIsMobile from './hooks/useIsMobile'
import MobileTabBar from './mobile/MobileTabBar'
import MobileWardrobe from './mobile/MobileWardrobe'
import MobileUpload from './mobile/MobileUpload'
import MobileFriends from './mobile/MobileFriends'
import MobileProfile from './mobile/MobileProfile'
import { ToastProvider } from './components/Toast'
import { useT } from './i18n'

const ROUTER_FUTURE = {
  v7_startTransition:  true,
  v7_relativeSplatPath: true,
}

// Converte hex → hue (0-360) per il filtro hue-rotate sul logo
function hexToHue(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255
  const g = parseInt(hex.slice(3,5), 16) / 255
  const b = parseInt(hex.slice(5,7), 16) / 255
  const max = Math.max(r,g,b), d = max - Math.min(r,g,b)
  if (d === 0) return 0
  let h = max === r ? ((g-b)/d % 6) * 60 : max === g ? ((b-r)/d + 2) * 60 : ((r-g)/d + 4) * 60
  return h < 0 ? h + 360 : h
}

export default function App() {
  const init                = useWardrobeStore(s => s.init)
  const prefetchSocialFeed  = useWardrobeStore(s => s.prefetchSocialFeed)
  const error        = useWardrobeStore(s => s.error)
  const loading      = useWardrobeStore(s => s.loading)
  const settings     = useSettingsStore()
  const updateSetting = useSettingsStore(s => s.updateSetting)
  const isMobile     = useIsMobile()

  const accentInfo  = ACCENT_COLORS.find(c => c.id === settings.accentColor) || ACCENT_COLORS[0]
  const themeObj    = THEMES.find(t => t.id === settings.theme) || THEMES[0]
  const isDark      = themeObj.dark || (themeObj.auto && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const accentHex   = accentInfo.hex
  const accentLight = accentInfo.light
  // Logo tint: hue-rotate dal arancione base del PNG (~37°) al colore accent scelto
  const logoHueRotate = Math.round(hexToHue(accentHex) - 37)
  // Su dark theme: invert(1) fa bianco→nero; hue-rotate(logoHueRotate-180) riporta la tinta accent
  const logoFilter = (shadow) => isDark
    ? `invert(1) hue-rotate(${logoHueRotate - 180}deg) drop-shadow(0 6px 36px ${accentHex}dd) drop-shadow(0 0 ${shadow}px ${accentHex}88)`
    : `hue-rotate(${logoHueRotate}deg) drop-shadow(0 6px 36px ${accentHex}dd)`
  // Senza drop-shadow per le schermate di caricamento (evita alone nero transitorio durante rendering)
  const logoFilterPlain = isDark
    ? `invert(1) hue-rotate(${logoHueRotate - 180}deg)`
    : `hue-rotate(${logoHueRotate}deg)`

  // Reset sort order to default on every app start (don't persist across restarts)
  useEffect(() => { updateSetting('wardrobeSortOrder', 'date_desc') }, []) // eslint-disable-line

  // ── Landscape blocker per mobile ──────────────────────────────────────────
  const [isLandscape, setIsLandscape] = useState(
    () => isMobile && window.innerWidth > window.innerHeight
  )
  useEffect(() => {
    const handler = () => {
      const mobile = Math.min(window.innerWidth, window.innerHeight) <= 640
      setIsLandscape(mobile && window.innerWidth > window.innerHeight)
    }
    window.addEventListener('resize', handler)
    // Prova a bloccare orientamento su Android Chrome PWA
    if (screen?.orientation?.lock) {
      screen.orientation.lock('portrait').catch(() => {})
    }
    return () => window.removeEventListener('resize', handler)
  }, [])

  const { refreshToken, rememberMe, setAuth, setAccessToken, updateUser, logout, accessToken } = useAuthStore()

  // Tutorial primo accesso
  const [showTutorial, setShowTutorial] = useState(false)

  // Rileva se l'app è aperta come PWA standalone (salvata alla home)
  const isPWA = window.matchMedia('(display-mode: standalone)').matches
             || window.navigator.standalone === true
             || new URLSearchParams(window.location.search).get('pwa') === '1'

  // "bootstrapping" → true mentre tentiamo di usare il refresh token salvato
  const [bootstrapping, setBootstrapping] = useState(!!refreshToken && !accessToken)

  // Splash sempre visibile per almeno 1 secondo
  const [splashReady, setSplashReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSplashReady(true), 1000)
    return () => clearTimeout(t)
  }, [])

  // Splash fade-out: mostra lo splash finché non è pronto, poi fa il fade
  const [showSplash,   setShowSplash]   = useState(() => isPWA)
  const [splashFading, setSplashFading] = useState(false)
  useEffect(() => {
    if (!showSplash) return
    if (splashReady && !bootstrapping) {
      setSplashFading(true)
      const t = setTimeout(() => setShowSplash(false), 420)
      return () => clearTimeout(t)
    }
  }, [splashReady, bootstrapping]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 1. Applica tema all'avvio + listener per tema automatico ──────────────
  useEffect(() => {
    applyTheme(settings)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const s = useSettingsStore.getState()
      if (s.theme === 'auto') applyTheme(s)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [settings.theme, settings.accentColor, settings.textScale]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Tenta refresh del token al riavvio ───────────────────────────────────
  useEffect(() => {
    if (!refreshToken || accessToken) {
      setBootstrapping(false)
      return
    }
    authRefresh(refreshToken)
      .then(data => {
        setAccessToken(data.access_token)
        setBootstrapping(false)
      })
      .catch(() => {
        logout()
        setBootstrapping(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3. Carica dati armadio + prefetch social feed dopo login ──────────────
  useEffect(() => {
    if (accessToken) {
      init()
      prefetchSocialFeed()
      // Aggiorna user con piano aggiornato dal server (evita flash "free" nelle sezioni premium)
      authMe().then(me => updateUser(me)).catch(() => {})
    }
  }, [accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 4. Mostra tutorial al primo accesso ────────────────────────────────────
  useEffect(() => {
    if (accessToken && shouldShowTutorial()) {
      setShowTutorial(true)
    }
  }, [accessToken])

  const showBackendError = error && !loading && accessToken

  // ── Spinner bootstrap (non-PWA) ───────────────────────────────────────────
  if (bootstrapping && !showSplash) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 24,
        background: 'var(--bg)', overflow: 'hidden',
      }}>
        <style>{`@keyframes glassSpinnerSpin { to { transform: rotate(360deg); } }`}</style>
        {/* Ambient glow orb */}
        <div style={{
          position: 'absolute', width: 320, height: 320, borderRadius: '50%',
          background: accentHex, filter: 'blur(80px)',
          opacity: isDark ? 0.22 : 0.13, pointerEvents: 'none',
        }} />
        {/* Frosted glass — full screen */}
        <div style={{
          position: 'absolute', inset: 0,
          backdropFilter: 'blur(60px) saturate(180%)',
          WebkitBackdropFilter: 'blur(60px) saturate(180%)',
          background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.60)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 24,
        }}>
          <img src={logoUrl} alt="Endyo" style={{
            width: 100, height: 100, borderRadius: 25, objectFit: 'contain',
            filter: logoFilterPlain,
          }} />
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            border: `2.5px solid ${accentHex}28`, borderTopColor: accentHex,
            animation: 'glassSpinnerSpin 0.8s linear infinite',
          }} />
          <span style={{
            fontSize: 11, letterSpacing: '0.12em', fontWeight: 600, textTransform: 'uppercase',
            color: isDark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.28)', marginTop: -12,
          }}>endyo</span>
        </div>
      </div>
    )
  }

  // ── Splash screen — solo PWA standalone ───────────────────────────────────
  if (showSplash) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', overflow: 'hidden',
        opacity: splashFading ? 0 : 1,
        transition: splashFading ? 'opacity 0.4s ease' : 'none',
        pointerEvents: 'none',
      }}>
        <style>{`
          @keyframes splashFade { 0%{opacity:0;transform:scale(0.90)} 100%{opacity:1;transform:scale(1)} }
          @keyframes splashSlide { 0%{left:-40%} 100%{left:140%} }
          @keyframes splashGlow { 0%,100%{opacity:${isDark ? 0.20 : 0.12}} 50%{opacity:${isDark ? 0.32 : 0.20}} }
        `}</style>

        {/* Ambient glow orb */}
        <div style={{
          position: 'absolute', width: 420, height: 420, borderRadius: '50%',
          background: accentHex, filter: 'blur(90px)',
          opacity: isDark ? 0.22 : 0.13,
          animation: 'splashGlow 3s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        {/* Frosted glass — full screen */}
        <div style={{
          position: 'absolute', inset: 0,
          backdropFilter: 'blur(60px) saturate(180%)',
          WebkitBackdropFilter: 'blur(60px) saturate(180%)',
          background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.60)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          animation: 'splashFade 0.45s ease forwards',
        }}>
          {/* Logo */}
          <img src={logoUrl} alt="Endyo" style={{
            width: 120, height: 120, borderRadius: 30, objectFit: 'contain',
            filter: logoFilterPlain,
          }} />

          {/* Bottom: progress + label */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            paddingBottom: 'max(56px, env(safe-area-inset-bottom, 56px))',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 44, height: 3, borderRadius: 2,
              background: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
              overflow: 'hidden', position: 'relative',
            }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, height: '100%', width: '40%', borderRadius: 2,
                background: `linear-gradient(90deg, ${accentHex}, ${accentLight})`,
                animation: 'splashSlide 1s ease-in-out infinite',
              }} />
            </div>
            <span style={{
              fontSize: 11, letterSpacing: '0.12em', fontWeight: 600, textTransform: 'uppercase',
              color: isDark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.28)',
            }}>endyo</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ToastProvider>
    <>
    {/* Blocca orizzontale su mobile: overlay fisso sopra tutto, NON smonta il router */}
    {isMobile && isLandscape && (
      <div style={{
        height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
        background: 'var(--bg)',
        position: 'fixed', inset: 0, zIndex: 9999,
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: 22,
          background: 'var(--primary-dim)', border: '1px solid var(--primary-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke="var(--primary-light)" strokeWidth={1.5} strokeLinecap="round">
            <rect x="2" y="7" width="20" height="14" rx="2"/>
            <path d="M16 2l-4 5-4-5"/>
          </svg>
        </div>
        <div style={{ textAlign: 'center', color: 'var(--text)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Ruota il telefono</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Endyo funziona solo in modalità verticale</div>
        </div>
      </div>
    )}
    <HashRouter future={ROUTER_FUTURE}>
      <Routes>
        {/* ── Route pubbliche (senza Navbar) ──────────────────────────────── */}
        <Route path="/auth"                      element={<AuthPage />} />
        <Route path="/verify-email/:token"       element={<VerifyEmailPage />} />
        <Route path="/reset-password/:token"     element={<ResetPasswordPage />} />

        {/* ── Route protette ───────────────────────────────────────────────────── */}
        <Route path="/*" element={
          <ProtectedRoute>
            {isMobile ? (
              /* ── Layout MOBILE: tab bar + pagine ridisegnate da zero ─────────── */
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
                {showTutorial && <MobileTutorial onDone={() => setShowTutorial(false)} />}
                <MobileTabLayout showBackendError={showBackendError} showTutorial={showTutorial} />
                <MobileTabBar />
              </div>
            ) : (
              /* ── Layout DESKTOP: sidebar + pagine standard ───────────────────── */
              <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
                {showTutorial && <TutorialOverlay onDone={() => setShowTutorial(false)} />}
                <LocationBanner />
                <Navbar />
                <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  {showBackendError && <BackendErrorBanner />}
                  <div style={{ flex: 1, overflow: 'auto' }}>
                    <Routes>
                      <Route path="/"          element={<Navigate to={showTutorial ? "/upload" : "/wardrobe"} replace />} />
                      <Route path="/wardrobe"  element={<Wardrobe />} />
                      <Route path="/upload"    element={<Upload />} />
                      <Route path="/outfits"   element={<OutfitBuilder />} />
                      <Route path="/profile"   element={<Profile />} />
                      <Route path="/friends"   element={<Friends />} />
                      <Route path="/shopping"  element={<Shopping />} />
                      <Route path="/settings"  element={<Settings />} />
                      <Route path="/premium"   element={<Premium />} />
                    </Routes>
                  </div>
                </main>
              </div>
            )}
          </ProtectedRoute>
        } />
      </Routes>
    </HashRouter>
    </>
    </ToastProvider>
  )
}

const MOBILE_TABS = [
  { p: '/wardrobe', C: MobileWardrobe },
  { p: '/upload',   C: MobileUpload   },
  { p: '/outfits',  C: OutfitBuilder  },
  { p: '/friends',  C: MobileFriends  },
  { p: '/profile',  C: MobileProfile  },
]

function MobileTabLayout({ showBackendError, showTutorial }) {
  const location = useLocation()
  const path     = location.pathname
  const isTab    = MOBILE_TABS.some(t => t.p === path)

  return (
    <>
      {showBackendError && <BackendErrorBanner />}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
        {/* All main tabs stay mounted; only display toggles */}
        {MOBILE_TABS.map(({ p, C }) => (
          <div key={p} style={{
            position: 'absolute', inset: 0,
            overflowY: 'auto', WebkitOverflowScrolling: 'touch',
            display: path === p ? 'flex' : 'none',
            flexDirection: 'column',
          }}>
            <C />
          </div>
        ))}
        {/* Sub-pages (settings, premium, shopping…) render as overlay */}
        {!isTab && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 50,
            background: 'var(--bg)', overflowY: 'auto',
          }}>
            <Routes>
              <Route path="/"             element={<Navigate to={showTutorial ? '/upload' : '/wardrobe'} replace />} />
              <Route path="/edit-profile" element={<Profile />} />
              <Route path="/settings"     element={<Settings />} />
              <Route path="/premium"      element={<Premium />} />
              <Route path="/shopping"     element={<Shopping />} />
              <Route path="*"             element={<Navigate to="/wardrobe" replace />} />
            </Routes>
          </div>
        )}
      </div>
    </>
  )
}

function BackendErrorBanner() {
  const t = useT()
  const isNative = !!(window?.Capacitor?.isNativePlatform?.())
  return (
    <div style={{
      background: 'rgba(239,68,68,0.08)',
      borderBottom: '1px solid rgba(239,68,68,0.2)',
      padding: '10px 20px',
      display: 'flex', alignItems: 'center', gap: 10,
      fontSize: 12, color: '#fca5a5', flexShrink: 0,
    }}>
      <span style={{ fontSize: 16 }}>⚠️</span>
      <div>
        <strong>{t('backendUnreachable')}</strong>
        {' '}{t(isNative ? 'backendUnreachableMobile' : 'backendUnreachableDesktop')}
      </div>
    </div>
  )
}

// ── Banner orizzontale in fondo ───────────────────────────────────────────────
