import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Palette colori accent ─────────────────────────────────────────────────────
export const ACCENT_COLORS = [
  { id: 'violet', label: { it: 'Viola',   en: 'Purple'  }, hex: '#8b5cf6', light: '#a78bfa', dim: 'rgba(139,92,246,0.15)' },
  { id: 'blue',   label: { it: 'Blu',     en: 'Blue'    }, hex: '#3b82f6', light: '#60a5fa', dim: 'rgba(59,130,246,0.15)'  },
  { id: 'pink',   label: { it: 'Rosa',    en: 'Pink'    }, hex: '#ec4899', light: '#f472b6', dim: 'rgba(236,72,153,0.15)'  },
  { id: 'green',  label: { it: 'Verde',   en: 'Green'   }, hex: '#10b981', light: '#34d399', dim: 'rgba(16,185,129,0.15)'  },
  { id: 'amber',  label: { it: 'Ambra',   en: 'Amber'   }, hex: '#f59e0b', light: '#fbbf24', dim: 'rgba(245,158,11,0.15)'  },
  { id: 'red',    label: { it: 'Rosso',   en: 'Red'     }, hex: '#ef4444', light: '#f87171', dim: 'rgba(239,68,68,0.15)'   },
  { id: 'cyan',   label: { it: 'Ciano',   en: 'Cyan'    }, hex: '#06b6d4', light: '#22d3ee', dim: 'rgba(6,182,212,0.15)'   },
  { id: 'orange', label: { it: 'Arancio', en: 'Orange'  }, hex: '#f97316', light: '#fb923c', dim: 'rgba(249,115,22,0.15)'  },
]

// ── Temi (dark + light) ───────────────────────────────────────────────────────
export const THEMES = [
  // — Automatico (segue il sistema) —
  { id: 'auto',      label: { it: 'Automatico', en: 'Automatic'  }, auto: true,  dark: false, bg: '#f8f9fc', surface: '#ffffff', card: '#f1f3f8', cardHover: '#e8ebf4', border: '#dde3ee', text: '#0f172a', textMuted: '#475569', textDim: '#94a3b8' },
  // — Dark —
  { id: 'dark',      label: { it: 'Scuro',      en: 'Dark'       }, dark: true,  bg: '#0d0d14', surface: '#13131e', card: '#1a1a2e', cardHover: '#202035', border: '#2a2a42', text: '#f1f5f9', textMuted: '#94a3b8', textDim: '#64748b' },
  { id: 'midnight',  label: { it: 'Midnight',   en: 'Midnight'   }, dark: true,  bg: '#060610', surface: '#0e0e1c', card: '#141428', cardHover: '#1a1a32', border: '#20203a', text: '#f1f5f9', textMuted: '#94a3b8', textDim: '#64748b' },
  { id: 'charcoal',  label: { it: 'Charcoal',   en: 'Charcoal'   }, dark: true,  bg: '#111113', surface: '#1a1a1d', card: '#222226', cardHover: '#28282d', border: '#333338', text: '#f1f5f9', textMuted: '#94a3b8', textDim: '#64748b' },
  { id: 'deep',      label: { it: 'Deep Space', en: 'Deep Space' }, dark: true,  bg: '#08080f', surface: '#101019', card: '#161625', cardHover: '#1c1c2e', border: '#252535', text: '#f1f5f9', textMuted: '#94a3b8', textDim: '#64748b' },
  // — Light —
  { id: 'light',     label: { it: 'Chiaro',     en: 'Light'      }, dark: false, bg: '#f8f9fc', surface: '#ffffff', card: '#f1f3f8', cardHover: '#e8ebf4', border: '#dde3ee', text: '#0f172a', textMuted: '#475569', textDim: '#94a3b8' },
  { id: 'lavender',  label: { it: 'Lavanda',    en: 'Lavender'   }, dark: false, bg: '#f5f3ff', surface: '#ffffff', card: '#ede9fe', cardHover: '#ddd6fe', border: '#c4b5fd', text: '#1e1b4b', textMuted: '#4c1d95', textDim: '#7c3aed' },
  { id: 'sky',       label: { it: 'Cielo',      en: 'Sky'        }, dark: false, bg: '#f0f9ff', surface: '#ffffff', card: '#e0f2fe', cardHover: '#bae6fd', border: '#7dd3fc', text: '#0c4a6e', textMuted: '#075985', textDim: '#0ea5e9' },
  { id: 'cream',     label: { it: 'Crema',      en: 'Cream'      }, dark: false, bg: '#fdfaf5', surface: '#ffffff', card: '#fef3c7', cardHover: '#fde68a', border: '#fcd34d', text: '#1c1204', textMuted: '#78350f', textDim: '#92400e' },
]

// Tema dark di default per la modalità auto
const AUTO_DARK  = THEMES.find(t => t.id === 'dark')
const AUTO_LIGHT = THEMES.find(t => t.id === 'light')

// ── Applica le CSS variables al documento ─────────────────────────────────────
export function applyTheme(settings) {
  const root   = document.documentElement
  const accent = ACCENT_COLORS.find(c => c.id === settings.accentColor) || ACCENT_COLORS[0]
  let theme    = THEMES.find(t => t.id === settings.theme) || THEMES[0]

  // Tema automatico: usa dark/light in base alla preferenza di sistema
  if (theme.auto) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    theme = prefersDark ? AUTO_DARK : AUTO_LIGHT
  }

  // Calcola rgba dall'hex per generare le varianti hover/active
  const _h = accent.hex
  const _r = parseInt(_h.slice(1, 3), 16)
  const _g = parseInt(_h.slice(3, 5), 16)
  const _b = parseInt(_h.slice(5, 7), 16)

  root.style.setProperty('--primary',          accent.hex)
  root.style.setProperty('--primary-light',    accent.light)
  root.style.setProperty('--primary-dim',      accent.dim)
  root.style.setProperty('--nav-active-bg',    `rgba(${_r},${_g},${_b},0.10)`)
  root.style.setProperty('--primary-hover-bg', `rgba(${_r},${_g},${_b},0.06)`)
  root.style.setProperty('--primary-border',   `rgba(${_r},${_g},${_b},0.55)`)  // bordi selezione card
  root.style.setProperty('--primary-focus',    `rgba(${_r},${_g},${_b},0.60)`)  // input focus border
  root.style.setProperty('--primary-shadow',   `rgba(${_r},${_g},${_b},0.25)`)  // glow bottoni/spinner
  root.style.setProperty('--primary-shadow-lg',`rgba(${_r},${_g},${_b},0.35)`)  // glow hover bottoni
  root.style.setProperty('--bg',            theme.bg)
  root.style.setProperty('--surface',       theme.surface)
  root.style.setProperty('--card',          theme.card)
  root.style.setProperty('--card-hover',    theme.cardHover)
  root.style.setProperty('--border',        theme.border)
  root.style.setProperty('--text',          theme.text)
  root.style.setProperty('--text-muted',    theme.textMuted)
  root.style.setProperty('--text-dim',      theme.textDim)

  // Sfondo per contenitori foto senza immagine (card / image placeholder)
  root.style.setProperty('--photo-bg',
    theme.dark
      ? `linear-gradient(135deg, ${theme.card}, ${theme.bg})`
      : theme.card
  )
  // Puntini griglia del mixer — sottili su entrambi i temi
  root.style.setProperty('--mixer-dot',
    theme.dark ? 'rgba(168,85,247,0.06)' : 'rgba(100,100,120,0.05)'
  )

  // Aggiorna anche il background del body
  document.body.style.background = theme.bg
  document.body.style.color      = theme.text
}

// ── Valute ────────────────────────────────────────────────────────────────────
export const CURRENCIES = [
  { id: 'eur', label: 'Euro',          symbol: '€'   },
  { id: 'usd', label: 'US Dollar',     symbol: '$'   },
  { id: 'gbp', label: 'British Pound', symbol: '£'   },
  { id: 'chf', label: 'Swiss Franc',   symbol: 'CHF' },
]

export const LANGUAGES = [
  { id: 'it', label: 'Italiano', flag: '🇮🇹', ready: true  },
  { id: 'en', label: 'English',  flag: '🇬🇧', ready: true  },
  { id: 'fr', label: 'Français', flag: '🇫🇷', ready: false },
  { id: 'es', label: 'Español',  flag: '🇪🇸', ready: false },
  { id: 'de', label: 'Deutsch',  flag: '🇩🇪', ready: false },
]

export const SHOE_SIZE_SYSTEMS    = [
  { id: 'eu', label: 'EU (42, 43…)' },
  { id: 'us', label: 'US (9, 10…)'  },
  { id: 'uk', label: 'UK (8, 9…)'   },
]

export const CLOTHING_SIZE_SYSTEMS = [
  { id: 'eu', label: 'EU/IT (S, M, L)' },
  { id: 'us', label: 'US (XS, S, M…)'  },
  { id: 'uk', label: 'UK (8, 10, 12…)' },
]

export const STYLIST_TONES = [
  { id: 'casual',     label: { it: 'Casual',     en: 'Casual'     }, desc: { it: 'Comodo e rilassato',      en: 'Comfortable and relaxed'  } },
  { id: 'smart',      label: { it: 'Smart',      en: 'Smart'      }, desc: { it: 'Curato ma non formale',   en: 'Polished but not formal'  } },
  { id: 'elegante',   label: { it: 'Elegante',   en: 'Elegant'    }, desc: { it: 'Formale e raffinato',     en: 'Formal and refined'       } },
  { id: 'sportivo',   label: { it: 'Sportivo',   en: 'Sporty'     }, desc: { it: 'Attivo e dinamico',       en: 'Active and dynamic'       } },
  { id: 'streetwear', label: { it: 'Streetwear', en: 'Streetwear' }, desc: { it: 'Urban e moderno',         en: 'Urban and modern'         } },
]

// ── Rileva lingua di sistema (solo per il primo avvio, poi usa quella salvata) ─
function detectSystemLanguage() {
  try {
    const lang = (navigator?.language || navigator?.languages?.[0] || 'it').toLowerCase()
    return lang.startsWith('it') ? 'it' : 'en'
  } catch {
    return 'it'
  }
}

// ── Default settings ──────────────────────────────────────────────────────────
const DEFAULTS = {
  accentColor:        'amber',
  theme:              'light',   // default: tema chiaro
  language:           detectSystemLanguage(),
  shoeSizeSystem:     'eu',
  clothingSizeSystem: 'eu',
  currency:           'eur',
  stylistTone:        'casual',
  showPrices:         true,
  compactCards:       false,
  autoRemoveBg:       true,
}

const useSettingsStore = create(
  persist(
    (set, get) => ({
      ...DEFAULTS,

      updateSetting: (key, value) => {
        set({ [key]: value })
        if (key === 'accentColor' || key === 'theme') {
          applyTheme({ ...get(), [key]: value })
        }
      },

      resetSettings: () => {
        set(DEFAULTS)
        applyTheme(DEFAULTS)
      },

      getCurrencySymbol: () => {
        const { currency } = get()
        return CURRENCIES.find(c => c.id === currency)?.symbol || '€'
      },

      isLightTheme: () => {
        const { theme } = get()
        const t = THEMES.find(th => th.id === theme)
        if (t?.auto) {
          // Tema automatico: risolvi in base alla preferenza di sistema
          return !window.matchMedia('(prefers-color-scheme: dark)').matches
        }
        return t?.dark === false
      },
    }),
    {
      name: 'mirrorfit-settings',
      version: 3,
      // Migrazione dalla v2: tema 'auto' → 'light' (nuovo default prodotto)
      migrate: (persisted, version) => {
        if (version < 3 && persisted.theme === 'auto') {
          return { ...persisted, theme: 'light' }
        }
        return persisted
      },
      // Applica il tema immediatamente dopo la reidratazione da localStorage
      // In modo che i CSS variables siano corretti senza dover toccare le impostazioni
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state)
      },
    }
  )
)

export default useSettingsStore
