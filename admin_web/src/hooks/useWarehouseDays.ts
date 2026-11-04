import { useEffect, useState } from 'react'
import { DEFAULT_WAREHOUSE_DAYS, subscribeWarehouseDays } from '@/lib/warehouse'

/** Omborxona chegarasi (tayyor bo'lgandan keyin necha kun) — jonli. */
export function useWarehouseDays(): number {
  const [days, setDays] = useState(DEFAULT_WAREHOUSE_DAYS)
  useEffect(() => subscribeWarehouseDays(setDays), [])
  return days
}
