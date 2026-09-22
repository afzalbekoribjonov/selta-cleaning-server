import { useEffect, useState } from 'react'
import { subscribeTariffs, DEFAULT_TARIFFS, type TariffConfig } from '@/lib/tariffs'

/**
 * Tarif sozlamalari — jonli obuna.
 *
 * Yuklanguncha standart qiymatlar qaytariladi, shuning uchun chaqiruvchi
 * hech qachon bo'sh holatni boshqarishi shart emas: eng yomoni bir
 * lahzaga eski qiymat ko'rinadi.
 */
export function useTariffs() {
  const [config, setConfig] = useState<TariffConfig | null>(null)

  useEffect(() => {
    return subscribeTariffs(setConfig)
  }, [])

  return { tariffs: config ?? DEFAULT_TARIFFS, loading: config === null }
}
