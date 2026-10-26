import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { ShopProvider } from './context/ShopContext.jsx'
import { PetsProvider } from './context/PetsContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ShopProvider>
        <PetsProvider>
          <App />
        </PetsProvider>
      </ShopProvider>
    </ErrorBoundary>
  </StrictMode>,
)
