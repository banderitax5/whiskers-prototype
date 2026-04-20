import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ShopProvider } from './context/ShopContext.jsx'
import { PetsProvider } from './context/PetsContext.jsx'

// this is the entry point of the whole frontend app
// StrictMode is a React dev tool that warns you about potential problems
// in your code - it doesn't affect the production build at all
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ShopProvider>
      <PetsProvider>
        <App />
      </PetsProvider>
    </ShopProvider>
  </StrictMode>,
)
