import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { SomaProvider } from './hooks/useSoma'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SomaProvider>
      <App />
    </SomaProvider>
  </StrictMode>,
)
