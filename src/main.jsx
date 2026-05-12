import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Pre-set hash to /wardrobe if missing, so HashRouter never renders a blank
// Navigate redirect on first load (Navigate renders null for one frame).
const h = window.location.hash
if (!h || h === '#' || h === '#/') {
  history.replaceState(null, '', '#/wardrobe')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
