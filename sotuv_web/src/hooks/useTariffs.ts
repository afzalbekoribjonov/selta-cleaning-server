import { useEffect, useState } from 'react'
import { subscribeTariffs, DEFAULT_TARIFFS, type TariffConfig } from '@/lib/tariffs'

/**
 * Tarif sozlamalari — jonli obuna. Yuklanguncha standart qiymatlar
 * qaytariladi, shuning uchun chaqiruvchi bo'sh holatni boshqarmaydi.
 */
export function useTariffs(): TariffConfig {
  const [config, setConfig] = useState<TariffConfig | null>(null)

  useEffect(() => {
    return subscribeTariffs(setConfig)
  }, [])

  return config ?? DEFAULT_TARIFFS
}
