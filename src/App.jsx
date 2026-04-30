import { useEffect, useState, useCallback } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import AdSidebar from './components/AdSidebar'
import TutorialOverlay, { shouldShowTutorial } from './components/TutorialOverlay'
import MobileTutorial from './mobile/MobileTutorial'
import ProtectedRoute from './components/ProtectedRoute'
import { getAdBrands, imgUrl } from './api/client'
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

  const { refreshToken, rememberMe, setAuth, setAccessToken, logout, accessToken } = useAuthStore()

  // Tutorial primo accesso
  const [showTutorial, setShowTutorial] = useState(false)

  // Rileva se l'app è aperta come PWA standalone (salvata alla home)
  const isPWA = window.matchMedia('(display-mode: standalone)').matches
             || window.navigator.standalone === true
             || new URLSearchParams(window.location.search).get('pwa') === '1'

  // "bootstrapping" → true mentre tentiamo di usare il refresh token salvato
  const [bootstrapping, setBootstrapping] = useState(!!refreshToken && !accessToken)

  // ── 1. Applica tema all'avvio ───────────────────────────────────────────────
  useEffect(() => { applyTheme(settings) }, [])

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

  // Splash screen stile Meta durante il bootstrap
  if (bootstrapping) {
    return (
      <div style={{
        height: '100vh', width: '100vw',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg, #0a0a0f 0%, #12071f 100%)',
        position: 'fixed', inset: 0, zIndex: 9999,
      }}>
        {/* Logo centrale */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          flex: 1, justifyContent: 'center',
        }}>
          <img
            src={logoUrl}
            alt="Endyo"
            style={{
              width: 90, height: 90, borderRadius: 22,
              boxShadow: '0 0 40px rgba(124,58,237,0.4)',
            }}
          />
        </div>

        {/* Loader in basso stile Meta */}
        <div style={{ paddingBottom: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 36, height: 4, borderRadius: 2,
            background: 'rgba(255,255,255,0.1)',
            overflow: 'hidden', position: 'relative',
          }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, height: '100%',
              width: '40%', borderRadius: 2,
              background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
              animation: 'splashSlide 1s ease-in-out infinite',
            }} />
          </div>
          <style>{`
            @keyframes splashSlide {
              0%   { left: -40%; }
              100% { left: 140%; }
            }
          `}</style>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>
            da Endyo
          </span>
        </div>
      </div>
    )
  }

  return (
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
              <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--bg)' }}>
                {showTutorial && <MobileTutorial onDone={() => setShowTutorial(false)} />}
                {/* ── Banner pubblicitario in cima ── */}
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
                <MobileTabBar />
                {/* ── Banner pubblicitario in fondo (sotto il menu) ── */}
                <MobileAdBanner position="bottom" />
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
                  <BottomAdBar />
                </main>
                <AdSidebar />
              </div>
            )}
          </ProtectedRoute>
        } />
      </Routes>
    </HashRouter>
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
const ADSENSE_CLIENT_BOTTOM = 'ca-pub-XXXXXXXXXXXXXXXXX'  // ← sostituisci
const ADSENSE_SLOT_BOTTOM   = 'ZZZZZZZZZZ'                // ← slot leaderboard
const isElectronApp = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')

function BottomAdBar() {
  const user = useAuthStore(s => s.user)
  const [ad, setAd]   = useState(null)
  const [idx, setIdx] = useState(0)
  const [ads, setAds] = useState([])

  const load = useCallback(() => {
    getAdBrands().then(data => { if (data?.length) setAds(data) }).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const rot = setInterval(() => setIdx(i => i + 1), 50000)
    const rel = setInterval(load, 300000)
    return () => { clearInterval(rot); clearInterval(rel) }
  }, [load])

  useEffect(() => {
    if (ads.length) setAd(ads[idx % ads.length])
  }, [ads, idx])

  useEffect(() => {
    if (!isElectronApp && !ADSENSE_CLIENT_BOTTOM.includes('XXX')) {
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}) } catch {}
    }
  }, [])

  // Premium Plus: nessuna pubblicità (incl. variante annuale)
  if (user?.plan?.startsWith('premium_plus')) return null

  // AdSense su web
  if (!isElectronApp && !ADSENSE_CLIENT_BOTTOM.includes('XXX')) {
    return (
      <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <ins className="adsbygoogle"
          style={{ display: 'inline-block', width: 728, height: 90 }}
          data-ad-client={ADSENSE_CLIENT_BOTTOM}
          data-ad-slot={ADSENSE_SLOT_BOTTOM}
        />
      </div>
    )
  }

  // Brand interno
  if (ad) {
    return (
      <a
        href={ad.buy_url || '#'} target="_blank" rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 20px', flexShrink: 0,
          borderTop: '1px solid var(--border)', background: 'var(--surface)',
          textDecoration: 'none', color: 'inherit',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--card)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
      >
        {ad.photo_url && (
          <img src={imgUrl(ad.photo_url)} alt={ad.name}
            style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sponsorizzato</span>
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>· {ad.brand_name}</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ad.name}
          </div>
        </div>
        {ad.price && (
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>
            {ad.currency}{ad.price}
          </span>
        )}
        <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--primary)', color: 'white', borderRadius: 7, padding: '5px 14px', flexShrink: 0 }}>
          Scopri →
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-dim)', opacity: 0.4, flexShrink: 0 }}>Annunci</span>
      </a>
    )
  }

  // Placeholder se nessun brand
  return (
    <div style={{
      borderTop: '1px solid var(--border)', background: 'var(--surface)',
      padding: '8px 20px', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      color: 'var(--text-dim)', fontSize: 11,
    }}>
      <span style={{ opacity: 0.4 }}>Spazio pubblicitario · 728×90 · Google AdSense su versione web</span>
    </div>
  )
}
