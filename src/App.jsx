import { useEffect, useState } from 'react'
const logoUrl = '/Endyoapp.png'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import useSettingsStore, { applyTheme } from './store/settingsStore'
import { authRefresh } from './api/client'
import useIsMobile from './hooks/useIsMobile'
import MobileTabBar from './mobile/MobileTabBar'
import MobileWardrobe from './mobile/MobileWardrobe'
import MobileUpload from './mobile/MobileUpload'
import MobileFriends from './mobile/MobileFriends'
import MobileProfile from './mobile/MobileProfile'
import MobileAdBanner from './mobile/MobileAdBanner'

const ROUTER_FUTURE = {
  v7_startTransition:  true,
  v7_relativeSplatPath: true,
}

export default function App() {
  const init         = useWardrobeStore(s => s.init)
  const error        = useWardrobeStore(s => s.error)
  const loading      = useWardrobeStore(s => s.loading)
  const settings     = useSettingsStore()
  const isMobile     = useIsMobile()

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

  const { refreshToken, rememberMe, setAuth, setAccessToken, logout, accessToken } = useAuthStore()

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
    // Se il tema è "auto", aggiorna quando il sistema cambia dark/light.
    // Usiamo getState() per leggere sempre lo state più aggiornato (evita
    // il problema della closure stale che perdeva il colore accent).
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const s = useSettingsStore.getState()
      if (s.theme === 'auto') applyTheme(s)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [settings.theme]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── 3. Carica dati armadio dopo aver ottenuto un token valido ───────────────
  useEffect(() => {
    if (accessToken) init()
  }, [accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 4. Mostra tutorial al primo accesso ────────────────────────────────────
  useEffect(() => {
    if (accessToken && shouldShowTutorial()) {
      setShowTutorial(true)
    }
  }, [accessToken])

  const showBackendError = error && !loading && accessToken

  // ── Splash screen amber — solo su PWA standalone, con fade-out ─────────────
  if (showSplash) {
    return (
      <div style={{
        height: '100vh', width: '100vw',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg, #f59e0b 0%, #fffdf5 100%)',
        position: 'fixed', inset: 0, zIndex: 9999,
        opacity: splashFading ? 0 : 1,
        transition: splashFading ? 'opacity 0.4s ease' : 'none',
        pointerEvents: 'none',
      }}>
        <style>{`
          @keyframes splashFade { 0%{opacity:0;transform:scale(0.92)} 100%{opacity:1;transform:scale(1)} }
          @keyframes splashSlide { 0%{left:-40%} 100%{left:140%} }
        `}</style>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src={logoUrl} alt="Endyo" style={{
            width: 96, height: 96, borderRadius: 24,
            boxShadow: '0 8px 40px rgba(245,158,11,0.35)',
            animation: 'splashFade 0.5s ease forwards',
          }} />
        </div>
        <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 40, height: 3, borderRadius: 2,
            background: 'rgba(217,119,6,0.18)', overflow: 'hidden', position: 'relative',
          }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, height: '100%', width: '40%', borderRadius: 2,
              background: 'linear-gradient(90deg, #f59e0b, #d97706)',
              animation: 'splashSlide 1s ease-in-out infinite',
            }} />
          </div>
          <span style={{ fontSize: 11, color: 'rgba(146,64,14,0.55)', letterSpacing: '0.06em', fontWeight: 600 }}>
            endyo
          </span>
        </div>
      </div>
    )
  }

  return (
    <>
    {/* Blocca orizzontale su mobile: overlay fisso sopra tutto, NON smonta il router */}
    {isMobile && isLandscape && (
      <div style={{
        height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
        background: 'linear-gradient(160deg, #f59e0b 0%, #fffdf5 100%)',
        position: 'fixed', inset: 0, zIndex: 9999,
      }}>
        <svg width={56} height={56} viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth={1.5} strokeLinecap="round">
          <rect x="2" y="7" width="20" height="14" rx="2"/>
          <path d="M16 2l-4 5-4-5"/>
        </svg>
        <div style={{ textAlign: 'center', color: '#92400e' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Ruota il telefono</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Endyo funziona solo in modalità verticale</div>
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
              <div style={{ display: 'flex', flexDirection: 'column', height: '100svh', overflow: 'hidden', background: 'var(--bg)' }}>
                {showTutorial && <MobileTutorial onDone={() => setShowTutorial(false)} />}
                <MobileAdBanner position="top" />
                <main style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
                  {showBackendError && <BackendErrorBanner />}
                  <Routes>
                    <Route path="/"          element={<Navigate to={showTutorial ? "/upload" : "/wardrobe"} replace />} />
                    <Route path="/wardrobe"     element={<MobileWardrobe />} />
                    <Route path="/upload"       element={<MobileUpload />} />
                    <Route path="/outfits"      element={<OutfitBuilder />} />
                    <Route path="/friends"      element={<MobileFriends />} />
                    <Route path="/profile"      element={<MobileProfile />} />
                    <Route path="/edit-profile" element={<Profile />} />
                    <Route path="/settings"     element={<Settings />} />
                    <Route path="/premium"      element={<Premium />} />
                    <Route path="/shopping"     element={<Shopping />} />
                  </Routes>
                </main>
                <MobileAdBanner position="bottom" />
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
  )
}

function BackendErrorBanner() {
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
        <strong>Backend non raggiungibile.</strong>
        {' '}Assicurati di aver avviato il server Python.
      </div>
    </div>
  )
}

// ── Banner orizzontale in fondo ───────────────────────────────────────────────
