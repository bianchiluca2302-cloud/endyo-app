import { useState, useEffect, useRef } from 'react'
import useBrandAuthStore from '../store/brandAuthStore'
import {
  brandLogin, brandMe, brandUpdate, brandUploadLogo,
  brandListProducts, brandCreateProduct, brandUpdateProduct,
  brandDeleteProduct, brandUploadProductImage,
  brandAnalytics, brandImgUrl,
  brandForgotPassword, brandResetPassword,
  brandGetPosts, brandCreatePost, brandDeletePost,
} from '../api/brandClient'

// ── Traduzioni IT / EN ────────────────────────────────────────────────────────
const BRAND_I18N = {
  it: {
    // Login
    loginTitle: 'Pannello Brand', loginSub: 'Pannello amministrativo brand',
    emailLabel: 'Email brand', passwordLabel: 'Password',
    loginBtn: 'Accedi', loginLoading: 'Accesso in corso…',
    forgotLink: 'Hai dimenticato la password?',
    forgotTitle: 'Recupero password', forgotSub: "Inserisci l'email del tuo account brand",
    forgotBtn: 'Invia link di recupero', forgotLoading: 'Invio in corso…',
    forgotSuccess: "Se l'indirizzo è registrato, riceverai un'email con il link di recupero.",
    resetTitle: 'Nuova password', resetSub: 'Scegli una password sicura per il tuo account',
    newPwdLabel: 'Nuova password', confirmPwdLabel: 'Conferma password',
    resetBtn: 'Reimposta password', resetLoading: 'Salvataggio…',
    resetDoneTitle: 'Password aggiornata', resetDoneSub: 'Puoi ora accedere con la tua nuova password.',
    goLoginBtn: 'Vai al login', backToLogin: 'Torna al login',
    invalidCreds: 'Credenziali non valide', sendError: "Errore nell'invio. Riprova.",
    pwdMismatch: 'Le password non coincidono.', pwdTooShort: 'La password deve essere di almeno 8 caratteri.',
    invalidLink: 'Link non valido o scaduto.', pwdPlaceholder: 'Almeno 8 caratteri', pwdConfirmPlaceholder: 'Ripeti la password',
    emailPlaceholder: 'brand@esempio.com',
    // Settings
    settingsTitle: 'Impostazioni', logoTitle: 'Logo brand',
    uploadLogo: 'Carica logo', logoHint: 'PNG, JPG — consigliato 200×200px',
    brandDataTitle: 'Dati brand', brandName: 'Nome brand',
    website: 'Sito web', websitePh: 'https://tuosito.com', description: 'Descrizione',
    saveBtn: 'Salva modifiche', saving: 'Salvo…', savedOk: 'Salvato con successo ✓',
    // Sidebar
    navDashboard: 'Dashboard', navProducts: 'Catalogo', navPosts: 'Post sponsorizzati', navSettings: 'Impostazioni',
    navLogout: 'Esci', adminLabel: 'Admin',
    // Dashboard
    dashTitle: 'Dashboard', dashSub: 'Statistiche ultimi 30 giorni',
    statSuggestions: 'Suggerimenti totali', statSuggestionsSub: 'volte mostrato in outfit',
    statClicks: 'Click totali', statClicksSub: 'utenti interessati',
    statCtr: 'CTR globale', statCtrSub: 'click / suggerimento',
    statActiveProducts: 'Prodotti attivi', statActiveProductsSub: 'nel catalogo',
    perfTitle: 'Performance per prodotto',
    colProduct: 'Prodotto', colCategory: 'Categoria', colSuggestions: 'Suggerimenti',
    colClicks: 'Click', colStatus: 'Stato',
    statusActive: 'Attivo', statusInactive: 'Inattivo',
    noProductsDashboard: 'Nessun prodotto ancora. Aggiungili nel Catalogo.',
    // Products
    productsTitle: 'Catalogo prodotti', productsActive: 'attivi',
    addProduct: 'Aggiungi prodotto', noProductsTitle: 'Nessun prodotto ancora',
    noProductsDesc: 'Aggiungi i tuoi prodotti per iniziare ad apparire nei suggerimenti AI',
    addFirstProduct: 'Aggiungi il primo prodotto',
    editProduct: 'Modifica', deactivate: 'Disattiva', activate: 'Attiva',
    confirmDelete: 'Eliminare questo prodotto?', newProduct: 'Nuovo prodotto',
    priceNA: 'Prezzo n.d.',
    // Posts sponsorizzati
    postsTitle: 'Post sponsorizzati', postsSub: 'I tuoi post appaiono nel feed degli utenti dell\'app.',
    postsNew: 'Nuovo post', postsEmpty: 'Nessun post ancora.',
    postsEmptyHint: 'Crea un post sponsorizzato per promuovere un tuo prodotto nel feed sociale.',
    postsSelectProduct: 'Seleziona un prodotto dal catalogo',
    postsCaptionLabel: 'Caption (opzionale)', postsCaptionPh: 'Descrivi il prodotto…',
    postsPublish: 'Pubblica post', postsPublishing: 'Pubblicazione…',
    postsDelete: 'Elimina', postsConfirmDelete: 'Eliminare questo post sponsorizzato?',
    postsLikes: 'Like', postsComments: 'Commenti', postsNoProduct: 'Prodotto non trovato',
    // ProductForm
    productPhoto: 'Foto prodotto', changePhoto: 'Cambia foto', uploadPhoto: 'Carica foto',
    productName: 'Nome prodotto *', productNamePh: 'es. Camicia Oxford Slim',
    categoryLabel: 'Categoria *', mainColor: 'Colore principale', colorPh: 'es. bianco',
    hexLabel: 'Hex', priceLabel: 'Prezzo (€)', pricePh: 'es. 49.90',
    buyUrl: 'Link acquisto', buyUrlPh: 'https://tuosito.com/prodotto',
    descLabel: 'Descrizione (opzionale)', descPh: 'Breve descrizione del prodotto...',
    styleLabel: 'Stile', seasonLabel: 'Stagione', occasionLabel: 'Occasione',
    activeLabel: 'Prodotto attivo (visibile nei suggerimenti AI)',
    nameRequired: 'Il nome è obbligatorio', saveError: 'Errore nel salvataggio',
    cancelBtn: 'Annulla', saveProduct: 'Salva prodotto', savingProduct: 'Salvo…',
    categoryLabels: { cappello: 'Cappello', maglietta: 'Maglietta', felpa: 'Felpa', giacchetto: 'Giacchetto', pantaloni: 'Pantaloni', scarpe: 'Scarpe', borsa: 'Borsa', orologio: 'Orologio', cintura: 'Cintura', occhiali: 'Occhiali', altro: 'Altro' },
    styleLabels: { casual: 'Casual', elegante: 'Elegante', sportivo: 'Sportivo', formale: 'Formale', bohemian: 'Bohemian', minimal: 'Minimal', streetwear: 'Streetwear' },
    seasonLabels: { primavera: 'Primavera', estate: 'Estate', autunno: 'Autunno', inverno: 'Inverno' },
    occasionLabels: { quotidiano: 'Quotidiano', lavoro: 'Lavoro', serata: 'Serata', cerimonia: 'Cerimonia', spiaggia: 'Spiaggia' },
  },
  en: {
    // Login
    loginTitle: 'Brand Panel', loginSub: 'Brand administration panel',
    emailLabel: 'Brand email', passwordLabel: 'Password',
    loginBtn: 'Sign in', loginLoading: 'Signing in…',
    forgotLink: 'Forgot your password?',
    forgotTitle: 'Password recovery', forgotSub: 'Enter the email of your brand account',
    forgotBtn: 'Send recovery link', forgotLoading: 'Sending…',
    forgotSuccess: "If the address is registered, you'll receive a recovery email.",
    resetTitle: 'New password', resetSub: 'Choose a secure password for your account',
    newPwdLabel: 'New password', confirmPwdLabel: 'Confirm password',
    resetBtn: 'Reset password', resetLoading: 'Saving…',
    resetDoneTitle: 'Password updated', resetDoneSub: 'You can now sign in with your new password.',
    goLoginBtn: 'Go to login', backToLogin: 'Back to login',
    invalidCreds: 'Invalid credentials', sendError: 'Error sending. Please retry.',
    pwdMismatch: 'Passwords do not match.', pwdTooShort: 'Password must be at least 8 characters.',
    invalidLink: 'Invalid or expired link.', pwdPlaceholder: 'At least 8 characters', pwdConfirmPlaceholder: 'Repeat password',
    emailPlaceholder: 'brand@example.com',
    // Settings
    settingsTitle: 'Settings', logoTitle: 'Brand logo',
    uploadLogo: 'Upload logo', logoHint: 'PNG, JPG — recommended 200×200px',
    brandDataTitle: 'Brand info', brandName: 'Brand name',
    website: 'Website', websitePh: 'https://yoursite.com', description: 'Description',
    saveBtn: 'Save changes', saving: 'Saving…', savedOk: 'Saved successfully ✓',
    // Sidebar
    navDashboard: 'Dashboard', navProducts: 'Catalogue', navPosts: 'Sponsored posts', navSettings: 'Settings',
    navLogout: 'Log out', adminLabel: 'Admin',
    // Dashboard
    dashTitle: 'Dashboard', dashSub: 'Statistics last 30 days',
    statSuggestions: 'Total suggestions', statSuggestionsSub: 'times shown in outfit',
    statClicks: 'Total clicks', statClicksSub: 'interested users',
    statCtr: 'Global CTR', statCtrSub: 'click / suggestion',
    statActiveProducts: 'Active products', statActiveProductsSub: 'in catalogue',
    perfTitle: 'Performance by product',
    colProduct: 'Product', colCategory: 'Category', colSuggestions: 'Suggestions',
    colClicks: 'Clicks', colStatus: 'Status',
    statusActive: 'Active', statusInactive: 'Inactive',
    noProductsDashboard: 'No products yet. Add them in Catalogue.',
    // Products
    productsTitle: 'Product catalogue', productsActive: 'active',
    addProduct: 'Add product', noProductsTitle: 'No products yet',
    noProductsDesc: 'Add your products to start appearing in AI suggestions',
    addFirstProduct: 'Add first product',
    editProduct: 'Edit', deactivate: 'Deactivate', activate: 'Activate',
    confirmDelete: 'Delete this product?', newProduct: 'New product',
    priceNA: 'Price N/A',
    // Sponsored posts
    postsTitle: 'Sponsored posts', postsSub: 'Your posts appear in the app feed of users.',
    postsNew: 'New post', postsEmpty: 'No posts yet.',
    postsEmptyHint: 'Create a sponsored post to promote one of your products in the social feed.',
    postsSelectProduct: 'Select a product from your catalogue',
    postsCaptionLabel: 'Caption (optional)', postsCaptionPh: 'Describe the product…',
    postsPublish: 'Publish post', postsPublishing: 'Publishing…',
    postsDelete: 'Delete', postsConfirmDelete: 'Delete this sponsored post?',
    postsLikes: 'Likes', postsComments: 'Comments', postsNoProduct: 'Product not found',
    // ProductForm
    productPhoto: 'Product photo', changePhoto: 'Change photo', uploadPhoto: 'Upload photo',
    productName: 'Product name *', productNamePh: 'e.g. Oxford Slim Shirt',
    categoryLabel: 'Category *', mainColor: 'Main colour', colorPh: 'e.g. white',
    hexLabel: 'Hex', priceLabel: 'Price (€)', pricePh: 'e.g. 49.90',
    buyUrl: 'Purchase link', buyUrlPh: 'https://yoursite.com/product',
    descLabel: 'Description (optional)', descPh: 'Brief product description...',
    styleLabel: 'Style', seasonLabel: 'Season', occasionLabel: 'Occasion',
    activeLabel: 'Active product (visible in AI suggestions)',
    nameRequired: 'Name is required', saveError: 'Error saving',
    cancelBtn: 'Cancel', saveProduct: 'Save product', savingProduct: 'Saving…',
    categoryLabels: { cappello: 'Hat', maglietta: 'T-Shirt', felpa: 'Sweatshirt', giacchetto: 'Jacket', pantaloni: 'Trousers', scarpe: 'Shoes', borsa: 'Bag', orologio: 'Watch', cintura: 'Belt', occhiali: 'Glasses', altro: 'Other' },
    styleLabels: { casual: 'Casual', elegante: 'Elegant', sportivo: 'Sporty', formale: 'Formal', bohemian: 'Bohemian', minimal: 'Minimal', streetwear: 'Streetwear' },
    seasonLabels: { primavera: 'Spring', estate: 'Summer', autunno: 'Autumn', inverno: 'Winter' },
    occasionLabels: { quotidiano: 'Everyday', lavoro: 'Work', serata: 'Evening', cerimonia: 'Ceremony', spiaggia: 'Beach' },
  },
}

// ── Hook lingua brand ─────────────────────────────────────────────────────────
function useBrandLang() {
  const [lang, setLangState] = useState(() => localStorage.getItem('brandLang') || 'it')
  const setLang = (l) => { localStorage.setItem('brandLang', l); setLangState(l) }
  const t = (k) => BRAND_I18N[lang]?.[k] ?? k
  return { lang, setLang, t }
}

// ── Toggle IT / EN ────────────────────────────────────────────────────────────
function LangToggle({ lang, setLang }) {
  const base = {
    padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
    cursor: 'pointer', border: '1px solid var(--border)', transition: 'all .15s',
  }
  const active   = { ...base, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }
  const inactive = { ...base, background: 'transparent', color: 'var(--text-muted)' }
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button style={lang === 'it' ? active : inactive} onClick={() => setLang('it')}>IT</button>
      <button style={lang === 'en' ? active : inactive} onClick={() => setLang('en')}>EN</button>
    </div>
  )
}

// ── Costanti ──────────────────────────────────────────────────────────────────
const CATEGORIES = ['cappello','maglietta','felpa','giacchetto','pantaloni','scarpe','borsa','orologio','cintura','occhiali','altro']
const STYLE_OPTS  = ['casual','elegante','sportivo','formale','bohemian','minimal','streetwear']
const SEASON_OPTS = ['primavera','estate','autunno','inverno']
const OCC_OPTS    = ['quotidiano','lavoro','serata','cerimonia','spiaggia']

// ── Componenti UI base ────────────────────────────────────────────────────────
function Spinner({ size = 20, color = 'var(--accent)' }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid transparent`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      display: 'inline-block',
    }} />
  )
}

function StatCard({ label, value, sub, color = 'var(--accent)' }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 16,
      padding: '20px 24px', flex: 1, minWidth: 140,
    }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function TagPicker({ label, options, selected, onChange, labelMap = {} }) {
  const toggle = (t) => onChange(
    selected.includes(t) ? selected.filter(x => x !== t) : [...selected, t]
  )
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(t => (
          <span
            key={t}
            onClick={() => toggle(t)}
            style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
              background: selected.includes(t) ? 'var(--accent)' : 'var(--bg)',
              color: selected.includes(t) ? '#fff' : 'var(--text-muted)',
              border: '1px solid',
              borderColor: selected.includes(t) ? 'var(--accent)' : 'var(--border)',
              transition: 'all .15s',
            }}
          >{labelMap[t] || t}</span>
        ))}
      </div>
    </div>
  )
}

// ── Campo input riutilizzabile ────────────────────────────────────────────────
function InputField({ label, type = 'text', value, onChange, placeholder, required }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      <input
        type={type} required={required} value={value}
        onChange={onChange} placeholder={placeholder}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
          background: 'var(--bg)', border: '1px solid var(--border)',
          color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

// ── Pagina Login ──────────────────────────────────────────────────────────────
function LoginPage({ onLogin, lang, setLang }) {
  const t = (k) => BRAND_I18N[lang]?.[k] ?? k
  // view: 'login' | 'forgot' | 'reset' | 'reset-done'
  const [view, setView]   = useState('login')
  const [resetToken, setResetToken] = useState('')

  // Login
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [loginErr, setLoginErr]   = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // Forgot password
  const [forgotEmail, setForgotEmail]   = useState('')
  const [forgotMsg, setForgotMsg]       = useState('')
  const [forgotErr, setForgotErr]       = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)

  // Reset password
  const [newPwd, setNewPwd]     = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [resetErr, setResetErr] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  // Controlla hash all'avvio per il link di reset
  useEffect(() => {
    const hash = window.location.hash  // es. #reset/abc123token
    const match = hash.match(/^#reset\/(.+)$/)
    if (match) {
      setResetToken(match[1])
      setView('reset')
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginErr('')
    setLoginLoading(true)
    try {
      const data = await brandLogin(loginForm)
      onLogin(data)
    } catch (ex) {
      setLoginErr(ex.response?.data?.detail || t('invalidCreds'))
    } finally {
      setLoginLoading(false)
    }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    setForgotErr('')
    setForgotLoading(true)
    try {
      await brandForgotPassword(forgotEmail)
      setForgotMsg(t('forgotSuccess'))
    } catch (ex) {
      setForgotErr(ex.response?.data?.detail || t('sendError'))
    } finally {
      setForgotLoading(false)
    }
  }

  const handleReset = async (e) => {
    e.preventDefault()
    if (newPwd !== confirmPwd) { setResetErr(t('pwdMismatch')); return }
    if (newPwd.length < 8)    { setResetErr(t('pwdTooShort')); return }
    setResetErr('')
    setResetLoading(true)
    try {
      await brandResetPassword(resetToken, newPwd)
      setView('reset-done')
    } catch (ex) {
      setResetErr(ex.response?.data?.detail || t('invalidLink'))
    } finally {
      setResetLoading(false)
    }
  }

  const cardStyle = {
    background: 'var(--surface)', borderRadius: 20, padding: '40px 36px',
    width: '100%', maxWidth: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
  }
  const errBox = (msg) => msg ? (
    <div style={{
      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
      borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#f87171', marginBottom: 14,
    }}>{msg}</div>
  ) : null
  const successBox = (msg) => msg ? (
    <div style={{
      background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
      borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#4ade80', marginBottom: 14,
    }}>{msg}</div>
  ) : null
  const submitBtn = (label, loading, loadingLabel) => (
    <button
      type="submit" disabled={loading}
      style={{
        width: '100%', padding: '12px', borderRadius: 12, border: 'none',
        background: 'var(--accent)', color: '#fff', fontWeight: 700,
        fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 8,
      }}
    >
      {loading ? <><Spinner size={16} color="#fff" /> {loadingLabel}</> : label}
    </button>
  )
  const backLink = (label, to) => (
    <button
      type="button" onClick={() => setView(to)}
      style={{
        background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13,
        cursor: 'pointer', marginTop: 16, display: 'block', width: '100%', textAlign: 'center',
      }}
    >← {label}</button>
  )
  const header = (icon, title, sub) => (
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>{icon}</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{title}</h1>
      {sub && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</p>}
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={cardStyle}>

        {/* ── Selettore lingua ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <LangToggle lang={lang} setLang={setLang} />
        </div>

        {/* ── Login ── */}
        {view === 'login' && (
          <>
            {header('👔', <>Mirror<em style={{ color: 'var(--accent)' }}>Fit</em> Brand</>, t('loginSub'))}
            <form onSubmit={handleLogin}>
              <InputField label={t('emailLabel')} type="email" required
                value={loginForm.email} placeholder={t('emailPlaceholder')}
                onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
              />
              <InputField label={t('passwordLabel')} type="password" required
                value={loginForm.password} placeholder="••••••••"
                onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
              />
              {errBox(loginErr)}
              {submitBtn(t('loginBtn'), loginLoading, t('loginLoading'))}
            </form>
            <button
              type="button" onClick={() => setView('forgot')}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12,
                cursor: 'pointer', marginTop: 16, display: 'block', width: '100%',
                textAlign: 'center', textDecoration: 'underline',
              }}
            >{t('forgotLink')}</button>
          </>
        )}

        {/* ── Forgot password ── */}
        {view === 'forgot' && (
          <>
            {header('🔑', t('forgotTitle'), t('forgotSub'))}
            {!forgotMsg ? (
              <form onSubmit={handleForgot}>
                <InputField label={t('emailLabel')} type="email" required
                  value={forgotEmail} placeholder={t('emailPlaceholder')}
                  onChange={e => setForgotEmail(e.target.value)}
                />
                {errBox(forgotErr)}
                {submitBtn(t('forgotBtn'), forgotLoading, t('forgotLoading'))}
              </form>
            ) : successBox(forgotMsg)}
            {backLink(t('backToLogin'), 'login')}
          </>
        )}

        {/* ── Reset password ── */}
        {view === 'reset' && (
          <>
            {header('🔒', t('resetTitle'), t('resetSub'))}
            <form onSubmit={handleReset}>
              <InputField label={t('newPwdLabel')} type="password" required
                value={newPwd} placeholder={t('pwdPlaceholder')}
                onChange={e => setNewPwd(e.target.value)}
              />
              <InputField label={t('confirmPwdLabel')} type="password" required
                value={confirmPwd} placeholder={t('pwdConfirmPlaceholder')}
                onChange={e => setConfirmPwd(e.target.value)}
              />
              {errBox(resetErr)}
              {submitBtn(t('resetBtn'), resetLoading, t('resetLoading'))}
            </form>
          </>
        )}

        {/* ── Reset done ── */}
        {view === 'reset-done' && (
          <>
            {header('✅', t('resetDoneTitle'), t('resetDoneSub'))}
            <button
              onClick={() => setView('login')}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                background: 'var(--accent)', color: '#fff', fontWeight: 700,
                fontSize: 15, cursor: 'pointer',
              }}
            >{t('goLoginBtn')}</button>
          </>
        )}

      </div>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage, brand, onLogout, lang, setLang }) {
  const t = (k) => BRAND_I18N[lang]?.[k] ?? k
  const items = [
    { id: 'dashboard', icon: '📊', label: t('navDashboard') },
    { id: 'products',  icon: '👗', label: t('navProducts') },
    { id: 'posts',     icon: '📣', label: t('navPosts') },
    { id: 'settings',  icon: '⚙️', label: t('navSettings') },
  ]
  return (
    <aside style={{
      width: 220, background: 'var(--surface)', display: 'flex', flexDirection: 'column',
      borderRight: '1px solid var(--border)', padding: '20px 0', flexShrink: 0,
    }}>
      {/* Logo + lang toggle */}
      <div style={{ padding: '0 20px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <LangToggle lang={lang} setLang={setLang} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {brand?.logo_url ? (
            <img
              src={brandImgUrl(brand.logo_url)} alt="logo"
              style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'var(--accent)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 18,
            }}>👔</div>
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
              {brand?.name || 'Brand'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('adminLabel')}</div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: page === item.id ? 'rgba(139,92,246,0.12)' : 'transparent',
              color: page === item.id ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: page === item.id ? 700 : 400, fontSize: 14,
              marginBottom: 2, textAlign: 'left',
              transition: 'all .15s',
            }}
          >
            <span>{item.icon}</span> {item.label}
          </button>
        ))}
      </nav>

      {/* Logout */}
      <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={onLogout}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none',
            background: 'transparent', color: '#f87171', cursor: 'pointer',
            fontSize: 14, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <span>🚪</span> {t('navLogout')}
        </button>
      </div>
    </aside>
  )
}

// ── Dashboard Analytics ───────────────────────────────────────────────────────
function Dashboard({ brand, lang }) {
  const t = (k) => BRAND_I18N[lang]?.[k] ?? k
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    brandAnalytics()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <Spinner size={32} />
    </div>
  )

  return (
    <div style={{ padding: 28, maxWidth: 900 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
        {t('dashTitle')}
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
        {t('dashSub')}
      </p>

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
        <StatCard label={t('statSuggestions')} value={data?.total_suggestions ?? 0} sub={t('statSuggestionsSub')} color="var(--accent)" />
        <StatCard label={t('statClicks')}      value={data?.total_clicks ?? 0}      sub={t('statClicksSub')}      color="#10b981" />
        <StatCard label={t('statCtr')}         value={`${data?.global_ctr ?? 0}%`}  sub={t('statCtrSub')}         color="#f59e0b" />
        <StatCard label={t('statActiveProducts')} value={data?.products?.filter(p => p.active).length ?? 0} sub={t('statActiveProductsSub')} color="#6366f1" />
      </div>

      {/* Tabella prodotti */}
      <div style={{
        background: 'var(--surface)', borderRadius: 16,
        border: '1px solid var(--border)', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
            {t('perfTitle')}
          </h3>
        </div>

        {data?.products?.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            {t('noProductsDashboard')}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {[t('colProduct'), t('colCategory'), t('colSuggestions'), t('colClicks'), 'CTR', t('colStatus')].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontWeight: 600,
                    color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.products?.map(p => (
                <tr key={p.product_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', color: 'var(--text)', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {p.image_url ? (
                        <img src={brandImgUrl(p.image_url)} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>👗</div>
                      )}
                      {p.product_name}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{t('categoryLabels')[p.category] || p.category}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--accent)', fontWeight: 600 }}>{p.suggestions}</td>
                  <td style={{ padding: '12px 16px', color: '#10b981', fontWeight: 600 }}>{p.clicks}</td>
                  <td style={{ padding: '12px 16px', color: '#f59e0b', fontWeight: 600 }}>{p.ctr}%</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: p.active ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)',
                      color: p.active ? '#10b981' : '#6b7280',
                    }}>
                      {p.active ? t('statusActive') : t('statusInactive')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Form prodotto ─────────────────────────────────────────────────────────────
function ProductForm({ initial, onSave, onCancel, lang = 'it' }) {
  const t = (k) => BRAND_I18N[lang]?.[k] ?? k
  const [form, setForm] = useState({
    name: '', category: 'maglietta', color_primary: '',
    color_hex: '', price: '', currency: 'EUR', buy_url: '',
    description: '', style_tags: [], season_tags: [], occasion_tags: [],
    active: true,
    ...initial,
  })
  const [imgFile, setImgFile]   = useState(null)
  const [imgPreview, setImgPreview] = useState(initial?.image_url ? brandImgUrl(initial.image_url) : null)
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')
  const fileRef = useRef()

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleImgChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImgFile(file)
    setImgPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return setErr(t('nameRequired'))
    setSaving(true)
    setErr('')
    try {
      const payload = {
        ...form,
        price: form.price !== '' ? parseFloat(form.price) : null,
      }
      delete payload.image_url
      const saved = await onSave(payload, imgFile)
      if (!saved) return
    } catch (ex) {
      setErr(ex.response?.data?.detail || t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
    background: 'var(--bg)', border: '1px solid var(--border)',
    color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle = { fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }

  return (
    <form onSubmit={handleSubmit}>
      {/* Immagine prodotto */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            width: 90, height: 90, borderRadius: 12, cursor: 'pointer',
            background: 'var(--bg)', border: '2px dashed var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
          }}
        >
          {imgPreview
            ? <img src={imgPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 28 }}>📷</span>
          }
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImgChange} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            {t('productPhoto')}
          </div>
          <button
            type="button" onClick={() => fileRef.current?.click()}
            style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
            }}
          >
            {imgPreview ? t('changePhoto') : t('uploadPhoto')}
          </button>
        </div>
      </div>

      {/* Nome + categoria */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>{t('productName')}</label>
          <input value={form.name} onChange={e => set('name', e.target.value)}
            placeholder={t('productNamePh')} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>{t('categoryLabel')}</label>
          <select value={form.category} onChange={e => set('category', e.target.value)} style={inputStyle}>
            {CATEGORIES.map(c => <option key={c} value={c}>{(t('categoryLabels')[c]) || c}</option>)}
          </select>
        </div>
      </div>

      {/* Colore + prezzo */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>{t('mainColor')}</label>
          <input value={form.color_primary} onChange={e => set('color_primary', e.target.value)}
            placeholder={t('colorPh')} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>{t('hexLabel')}</label>
          <input type="color" value={form.color_hex || '#ffffff'}
            onChange={e => set('color_hex', e.target.value)}
            style={{ ...inputStyle, padding: '4px 6px', height: 38, cursor: 'pointer' }} />
        </div>
        <div>
          <label style={labelStyle}>{t('priceLabel')}</label>
          <input type="number" min="0" step="0.01" value={form.price}
            onChange={e => set('price', e.target.value)}
            placeholder={t('pricePh')} style={inputStyle} />
        </div>
      </div>

      {/* URL acquisto */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>{t('buyUrl')}</label>
        <input value={form.buy_url} onChange={e => set('buy_url', e.target.value)}
          placeholder={t('buyUrlPh')} style={inputStyle} />
      </div>

      {/* Descrizione */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{t('descLabel')}</label>
        <textarea
          value={form.description} onChange={e => set('description', e.target.value)}
          rows={2} placeholder={t('descPh')}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {/* Tag */}
      <TagPicker label={t('styleLabel')}    options={STYLE_OPTS}  selected={form.style_tags}    onChange={v => set('style_tags', v)}    labelMap={t('styleLabels')} />
      <TagPicker label={t('seasonLabel')}   options={SEASON_OPTS} selected={form.season_tags}   onChange={v => set('season_tags', v)}   labelMap={t('seasonLabels')} />
      <TagPicker label={t('occasionLabel')} options={OCC_OPTS}    selected={form.occasion_tags} onChange={v => set('occasion_tags', v)} labelMap={t('occasionLabels')} />

      {/* Attivo toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, marginTop: 4 }}>
        <input
          type="checkbox" id="active-chk" checked={form.active}
          onChange={e => set('active', e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <label htmlFor="active-chk" style={{ fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          {t('activeLabel')}
        </label>
      </div>

      {err && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#f87171', marginBottom: 12,
        }}>{err}</div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={{
          padding: '9px 18px', borderRadius: 10, border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14,
        }}>{t('cancelBtn')}</button>
        <button type="submit" disabled={saving} style={{
          padding: '9px 20px', borderRadius: 10, border: 'none',
          background: 'var(--accent)', color: '#fff', fontWeight: 700,
          fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {saving ? <><Spinner size={14} color="#fff" /> {t('savingProduct')}</> : t('saveProduct')}
        </button>
      </div>
    </form>
  )
}

// ── Catalogo Prodotti ─────────────────────────────────────────────────────────
function Products({ lang = 'it' }) {
  const t = (k) => BRAND_I18N[lang]?.[k] ?? k
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)  // null | 'add' | {product}
  const [deleting, setDeleting] = useState(null)

  const load = () => brandListProducts().then(setProducts).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const handleSave = async (formData, imgFile, existingId = null) => {
    let product
    if (existingId) {
      product = await brandUpdateProduct(existingId, formData)
    } else {
      product = await brandCreateProduct(formData)
    }
    if (imgFile) {
      await brandUploadProductImage(product.id, imgFile)
    }
    await load()
    setModal(null)
    return product
  }

  const handleDelete = async (id) => {
    if (!confirm(t('confirmDelete'))) return
    setDeleting(id)
    await brandDeleteProduct(id).catch(console.error)
    setProducts(ps => ps.filter(p => p.id !== id))
    setDeleting(null)
  }

  const handleToggleActive = async (p) => {
    const updated = await brandUpdateProduct(p.id, { active: !p.active }).catch(console.error)
    if (updated) setProducts(ps => ps.map(x => x.id === p.id ? updated : x))
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <Spinner size={32} />
    </div>
  )

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{t('productsTitle')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {products.length} {lang === 'en' ? `product${products.length !== 1 ? 's' : ''}` : `prodot${products.length === 1 ? 'to' : 'ti'}`} · {products.filter(p => p.active).length} {t('productsActive')}
          </p>
        </div>
        <button
          onClick={() => setModal('add')}
          style={{
            padding: '10px 20px', borderRadius: 12, border: 'none',
            background: 'var(--accent)', color: '#fff', fontWeight: 700,
            fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span>+</span> {t('addProduct')}
        </button>
      </div>

      {products.length === 0 ? (
        <div style={{
          background: 'var(--surface)', borderRadius: 16, padding: 48,
          textAlign: 'center', border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👗</div>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            {t('noProductsTitle')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            {t('noProductsDesc')}
          </div>
          <button
            onClick={() => setModal('add')}
            style={{
              padding: '10px 20px', borderRadius: 12, border: 'none',
              background: 'var(--accent)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14,
            }}
          >
            {t('addFirstProduct')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {products.map(p => (
            <div key={p.id} style={{
              background: 'var(--surface)', borderRadius: 16,
              border: '1px solid var(--border)', overflow: 'hidden',
              opacity: p.active ? 1 : 0.6, transition: 'opacity .2s',
            }}>
              {/* Immagine */}
              <div style={{
                height: 160, background: 'var(--bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {p.image_url ? (
                  <img
                    src={brandImgUrl(p.image_url)} alt={p.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: 40, opacity: 0.3 }}>👗</span>
                )}
              </div>

              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {t('categoryLabels')[p.category] || p.category} · {p.price ? `€${p.price}` : t('priceNA')}
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: p.active ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)',
                    color: p.active ? '#10b981' : '#6b7280', flexShrink: 0,
                  }}>
                    {p.active ? t('statusActive') : t('statusInactive')}
                  </span>
                </div>

                {/* Tags preview */}
                {(p.style_tags?.length > 0 || p.season_tags?.length > 0) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {[...p.style_tags.slice(0,2), ...p.season_tags.slice(0,1)].map(t => (
                      <span key={t} style={{
                        padding: '2px 7px', borderRadius: 20, fontSize: 11,
                        background: 'rgba(139,92,246,0.12)', color: 'var(--accent)',
                      }}>{t}</span>
                    ))}
                  </div>
                )}

                {/* Azioni */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    onClick={() => setModal(p)}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid var(--border)',
                      background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer',
                    }}
                  >✏️ {t('editProduct')}</button>
                  <button
                    onClick={() => handleToggleActive(p)}
                    style={{
                      padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)',
                      background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
                    }}
                    title={p.active ? t('deactivate') : t('activate')}
                  >{p.active ? '⏸' : '▶️'}</button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    disabled={deleting === p.id}
                    style={{
                      padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)',
                      background: 'transparent', color: '#f87171', fontSize: 12, cursor: 'pointer',
                    }}
                  >🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal add/edit */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 20, padding: '28px 28px 24px',
            width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
          }}>
            <h3 style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)', marginBottom: 20 }}>
              {modal === 'add' ? t('newProduct') : `${t('editProduct')} — ${modal.name}`}
            </h3>
            <ProductForm
              initial={modal === 'add' ? null : modal}
              onSave={(data, file) => handleSave(data, file, modal === 'add' ? null : modal.id)}
              onCancel={() => setModal(null)}
              lang={lang}
            />
          </div>
        </div>
      )}
    </div>
  )
}


// ── Post sponsorizzati ────────────────────────────────────────────────────────
function BrandPosts({ lang }) {
  const t = (k) => BRAND_I18N[lang]?.[k] ?? k
  const [posts,    setPosts]    = useState([])
  const [products, setProducts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selProd,  setSelProd]  = useState('')
  const [caption,  setCaption]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    Promise.all([brandGetPosts(), brandListProducts()])
      .then(([p, prods]) => { setPosts(p); setProducts(prods.filter(pr => pr.active)) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handlePublish = async () => {
    if (!selProd) { setError(t('postsSelectProduct')); return }
    setSaving(true); setError(null)
    try {
      const newPost = await brandCreatePost({ brand_product_id: Number(selProd), caption: caption.trim() || null })
      setPosts(prev => [newPost, ...prev])
      setShowForm(false); setSelProd(''); setCaption('')
    } catch (e) {
      setError(e.response?.data?.detail || 'Errore')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm(t('postsConfirmDelete'))) return
    await brandDeletePost(id)
    setPosts(prev => prev.filter(p => p.id !== id))
  }

  const selectedProduct = products.find(p => String(p.id) === String(selProd))

  return (
    <div style={{ padding: 32, maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4 }}>{t('postsTitle')}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('postsSub')}</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: showForm ? 'var(--card)' : 'var(--primary)', color: showForm ? 'var(--text)' : 'white',
            border: '1px solid var(--border)',
          }}
        >
          {showForm ? '✕' : `+ ${t('postsNew')}`}
        </button>
      </div>

      {/* Form nuovo post */}
      {showForm && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 20, marginTop: 20, marginBottom: 24,
        }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>
              {t('postsSelectProduct')}
            </label>
            <select
              className="input"
              value={selProd}
              onChange={e => setSelProd(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">— {t('postsSelectProduct')} —</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} · {p.category}</option>
              ))}
            </select>
          </div>

          {/* Anteprima prodotto selezionato */}
          {selectedProduct && (
            <div style={{
              display: 'flex', gap: 12, alignItems: 'center',
              padding: '10px 14px', background: 'var(--surface)', borderRadius: 10, marginBottom: 14,
              border: '1px solid var(--border)',
            }}>
              {selectedProduct.image_url ? (
                <img
                  src={brandImgUrl(selectedProduct.image_url)}
                  alt={selectedProduct.name}
                  style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8 }}
                />
              ) : (
                <div style={{ width: 52, height: 52, borderRadius: 8, background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                  📦
                </div>
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedProduct.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {selectedProduct.category}{selectedProduct.price ? ` · €${selectedProduct.price}` : ''}
                </div>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>
              {t('postsCaptionLabel')}
            </label>
            <textarea
              className="input"
              style={{ width: '100%', resize: 'none', height: 80, fontSize: 13, boxSizing: 'border-box' }}
              placeholder={t('postsCaptionPh')}
              value={caption}
              onChange={e => setCaption(e.target.value)}
              maxLength={500}
            />
          </div>

          {error && (
            <div style={{
              fontSize: 13, color: '#fca5a5', background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowForm(false)} style={{
              flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer',
            }}>
              {lang === 'it' ? 'Annulla' : 'Cancel'}
            </button>
            <button onClick={handlePublish} disabled={saving || !selProd} style={{
              flex: 2, padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer',
              opacity: saving || !selProd ? 0.6 : 1,
            }}>
              {saving ? t('postsPublishing') : t('postsPublish')}
            </button>
          </div>
        </div>
      )}

      {/* Lista post */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
          {lang === 'it' ? 'Caricamento…' : 'Loading…'}
        </div>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>📣</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{t('postsEmpty')}</div>
          <div style={{ fontSize: 13 }}>{t('postsEmptyHint')}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
          {posts.map(post => (
            <div key={post.id} style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 14, padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start',
            }}>
              {/* Immagine prodotto */}
              <div style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                {post.product_image ? (
                  <img src={brandImgUrl(post.product_image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, opacity: 0.4 }}>
                    📦
                  </div>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                  {post.product_name || t('postsNoProduct')}
                </div>
                {post.caption && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 6 }}>
                    {post.caption}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-dim)' }}>
                  <span>❤ {post.like_count} {t('postsLikes')}</span>
                  <span>💬 {post.comment_count} {t('postsComments')}</span>
                  <span style={{ marginLeft: 'auto', opacity: 0.6 }}>
                    {post.created_at ? new Date(post.created_at).toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-GB') : ''}
                  </span>
                </div>
              </div>

              {/* Elimina */}
              <button
                onClick={() => handleDelete(post.id)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', flexShrink: 0,
                }}
              >
                {t('postsDelete')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


// ── Impostazioni brand ────────────────────────────────────────────────────────
function BrandSettings({ brand, onBrandUpdate, lang, setLang }) {
  const t = (k) => BRAND_I18N[lang]?.[k] ?? k
  const [form, setForm]   = useState({ name: brand?.name || '', description: brand?.description || '', website: brand?.website || '' })
  const [saving, setSaving] = useState(false)
  const [ok, setOk]       = useState(false)
  const [err, setErr]     = useState('')
  const logoRef = useRef()

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true); setErr(''); setOk(false)
    try {
      const updated = await brandUpdate(form)
      onBrandUpdate(updated)
      setOk(true)
      setTimeout(() => setOk(false), 3000)
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Errore')
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const res = await brandUploadLogo(file).catch(console.error)
    if (res) onBrandUpdate({ ...brand, logo_url: res.logo_url })
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
    background: 'var(--bg)', border: '1px solid var(--border)',
    color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ padding: 28, maxWidth: 560 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{t('settingsTitle')}</h2>
      </div>

      {/* Logo */}
      <div style={{
        background: 'var(--surface)', borderRadius: 16, padding: '20px 24px',
        border: '1px solid var(--border)', marginBottom: 20,
      }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 14 }}>{t('logoTitle')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 12, background: 'var(--bg)',
            border: '1px solid var(--border)', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {brand?.logo_url
              ? <img src={brandImgUrl(brand.logo_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 28 }}>👔</span>
            }
          </div>
          <div>
            <button
              onClick={() => logoRef.current?.click()}
              style={{
                padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--text)', fontSize: 13, cursor: 'pointer',
              }}
            >{t('uploadLogo')}</button>
            <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{t('logoHint')}</div>
          </div>
        </div>
      </div>

      {/* Form dati */}
      <form onSubmit={handleSave} style={{
        background: 'var(--surface)', borderRadius: 16, padding: '20px 24px',
        border: '1px solid var(--border)',
      }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 14 }}>
          {t('brandDataTitle')}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            {t('brandName')}
          </label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={inputStyle} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            {t('website')}
          </label>
          <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
            placeholder={t('websitePh')} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            {t('description')}
          </label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        {err && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', borderRadius: 8,
            padding: '7px 12px', fontSize: 13, color: '#f87171', marginBottom: 12,
          }}>{err}</div>
        )}
        {ok && (
          <div style={{
            background: 'rgba(16,185,129,0.1)', borderRadius: 8,
            padding: '7px 12px', fontSize: 13, color: '#10b981', marginBottom: 12,
          }}>{t('savedOk')}</div>
        )}

        <button type="submit" disabled={saving} style={{
          padding: '9px 20px', borderRadius: 10, border: 'none',
          background: 'var(--accent)', color: '#fff', fontWeight: 700,
          fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
        }}>
          {saving ? t('saving') : t('saveBtn')}
        </button>
      </form>
    </div>
  )
}

// ── Root BrandAdmin ───────────────────────────────────────────────────────────
export default function BrandAdmin() {
  const { accessToken, refreshToken, brand, setAuth, setAccessToken, logout } = useBrandAuthStore()
  const { lang, setLang } = useBrandLang()
  const [page, setPage]       = useState('dashboard')
  const [currentBrand, setCurrentBrand] = useState(brand)
  const handleLogin = (data) => {
    setAuth(data.access_token, data.refresh_token, data.brand)
    setCurrentBrand(data.brand)
  }

  const handleBrandUpdate = (updated) => {
    setCurrentBrand(updated)
  }

  if (!accessToken) {
    return <LoginPage onLogin={handleLogin} lang={lang} setLang={setLang} />
  }

  const pages = {
    dashboard: <Dashboard brand={currentBrand} lang={lang} />,
    products:  <Products lang={lang} />,
    posts:     <BrandPosts lang={lang} />,
    settings:  <BrandSettings brand={currentBrand} onBrandUpdate={handleBrandUpdate} lang={lang} setLang={setLang} />,
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      <Sidebar
        page={page}
        setPage={setPage}
        brand={currentBrand}
        onLogout={logout}
        lang={lang}
        setLang={setLang}
      />
      <main style={{ flex: 1, overflow: 'auto' }}>
        {pages[page]}
      </main>
    </div>
  )
}
