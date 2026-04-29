import React from 'react'
import ReactDOM from 'react-dom/client'
import BrandAdmin from './pages/BrandAdmin'
import { applyTheme } from './store/settingsStore'
import './index.css'

// Tema di default per il brand portal
applyTheme({ accentColor: 'violet', theme: 'dark' })

ReactDOM.createRoot(document.getElementById('brand-root')).render(
  <React.StrictMode>
    <BrandAdmin />
  </React.StrictMode>
)
