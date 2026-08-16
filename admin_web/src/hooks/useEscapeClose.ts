import { useEffect } from 'react'

/** Modal/drawer'larni Escape tugmasi bilan yopish — klaviatura orqali boshqarish uchun. */
export function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])
}
