import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './lib/firebase'
import { AuthProvider } from './lib/auth-context'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Ilova qobig'ini keshlaydi — tarmoq sekin/uzilgan bo'lsa ham sayt
// ochiladi va "Asosiy ekranga qo'shish" orqali ilova kabi ishlaydi.
// Ma'lumot keshlanmaydi (public/sw.js dagi izohga qarang).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Ro'yxatdan o'tmasa ham sayt oddiy tarzda ishlayveradi.
    })
  })
}
