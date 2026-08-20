import { Headset, Wrench, Truck, type LucideIcon } from 'lucide-react'

/**
 * mobile/lib/core/constants.dart dagi kDepartmentConfig bilan bir xil.
 * "Sifat nazorati" endi tanlash uchun mavjud emas (talab #5 — ishi
 * ishchining upakovka bosqichiga ko'chirilgan) — shu bo'limdagi mavjud
 * (eski) xodimlar useDepartmentLookup fallback orqali hali ko'rinadi va
 * boshqariladi (o'chirish uchun), lekin yangi xodim endi shu bo'limga
 * tayinlanmaydi.
 */
export const DEPARTMENTS: Record<string, { label: string; icon: LucideIcon }> = {
  dispatcher: { label: 'Sotuv menejeri', icon: Headset },
  worker: { label: 'Ishchi', icon: Wrench },
  delivery: { label: 'Dastavchik', icon: Truck },
}
