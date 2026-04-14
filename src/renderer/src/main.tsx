// In browser dev mode, inject mock electronAPI before anything else.
// The import is side-effect only — it sets window.electronAPI if absent.
// In Electron, the preload bridge already sets it, so this is a no-op.
import './mock-api'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
