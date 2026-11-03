import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ConfirmDialog, type ConfirmOptions } from '@/components/ui/ConfirmDialog'

/**
 * `window.confirm` o'rniga — sahifa ichidagi tasdiqlash oynasi.
 *
 * NEGA: admin panel mobil ilova ichida (WebView) ham ochiladi, Android
 * WebView esa brauzerning `confirm()` oynasini ko'rsatmaydi va doim
 * "yo'q" qaytaradi — bunday tugmalar ilovada jimgina ishlamay qolardi.
 *
 *   const [confirmDialog, confirm] = useConfirm()
 *   if (!(await confirm({ title: "O'chirilsinmi?", danger: true }))) return
 *   ...
 *   return <>{...}{confirmDialog}</>
 */
export function useConfirm(): [ReactNode, (options: ConfirmOptions) => Promise<boolean>] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false)
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = useCallback((value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }, [])

  const dialog = options ? <ConfirmDialog options={options} onClose={close} /> : null
  return [dialog, confirm]
}
