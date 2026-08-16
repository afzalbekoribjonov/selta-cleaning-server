import { Headset, Wrench, Truck, ShieldCheck, type LucideIcon } from 'lucide-react'

/** mobile/lib/core/constants.dart dagi kDepartmentConfig bilan bir xil. */
export const DEPARTMENTS: Record<string, { label: string; icon: LucideIcon }> = {
  dispatcher: { label: 'Dispetcher', icon: Headset },
  worker: { label: 'Ishchi', icon: Wrench },
  delivery: { label: 'Dastavchik', icon: Truck },
  qc: { label: 'Sifat nazorati', icon: ShieldCheck },
}
