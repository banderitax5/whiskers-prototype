import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ShopProvider } from './context/ShopContext.jsx'
import { PetsProvider } from './context/PetsContext.jsx'
import { captureUTM } from './lib/utm'

captureUTM()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ShopProvider>
      <PetsProvider>
        <App />
      </PetsProvider>
    </ShopProvider>
  </StrictMode>,
)
