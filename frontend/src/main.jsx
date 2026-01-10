// React core imports
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Global styles
import './index.css'

// Main App component
import App from './App.jsx'

/**
 * Application entry point and root render
 * Creates the React root and renders the App component
 */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
