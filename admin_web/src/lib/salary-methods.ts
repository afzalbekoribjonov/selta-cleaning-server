/** talab #13'dagi 6 ta maosh hisoblash usuli — server/src/routes/payroll.ts bilan bir xil. */
export interface SalaryField {
  key: string
  label: string
  hint?: string
  /** Birlik narxlari bitta guruhda (ixcham 2 ustun) ko'rsatiladi. */
  rate?: boolean
}

/**
 * Ishbay birlik narxlari — m², metr, kg va dona bir-biriga qo'shilmaydi,
 * shuning uchun har biri alohida narx (server: lib/salaryCalc.ts UNIT_RATE_KEYS).
 * Avval faqat m² bor edi — metr/kg/dona mahsulotlar uchun maosh 0 chiqardi.
 */
const unitRates = (sqmHint: string): SalaryField[] => [
  { key: 'pricePerSqm', label: '1 m²', hint: sqmHint, rate: true },
  { key: 'pricePerMeter', label: '1 metr', rate: true },
  { key: 'pricePerKg', label: '1 kg', rate: true },
  { key: 'pricePerPiece', label: '1 dona', rate: true },
]

export interface SalaryMethodInfo {
  label: string
  description: string
  fields: SalaryField[]
}

export const SALARY_METHODS: Record<string, SalaryMethodInfo> = {
  fixed: {
    label: "Qattiy fiksa",
    description: "Har oy bir xil summa",
    fields: [{ key: 'fixedAmount', label: "Oylik summa (so'm)", hint: '3 000 000 – 7 000 000' }],
  },
  fixed_percent: {
    label: 'Fiksa + foiz',
    description: "Baza summa + yaratgan buyurtmalari summasidan foiz",
    fields: [
      { key: 'baseAmount', label: "Baza summa (so'm)", hint: '500 000 – 1 500 000' },
      { key: 'percent', label: 'Foiz (%)' },
    ],
  },
  delivery: {
    label: 'Dastavka',
    description: "Baza + olib kelgan buyurtma summasidan % + yig'gan puldan %",
    fields: [
      { key: 'baseAmount', label: "Baza summa (so'm)" },
      { key: 'percentOfOrderValue', label: 'Buyurtma summasidan (%)' },
      { key: 'percentOfCashCollected', label: "Yig'ilgan puldan (%)" },
    ],
  },
  finishing: {
    label: 'Pardozlash',
    description: 'Qadoqlagan hajmi × birlik narxi (m², metr, kg, dona)',
    fields: unitRates('500 – 1500'),
  },
  washing: {
    label: 'Yuvish',
    description: 'Baza + yuvgan hajmi × birlik narxi (m², metr, kg, dona)',
    fields: [{ key: 'baseAmount', label: "Baza summa (so'm)" }, ...unitRates('1000 – 2000')],
  },
  furniture_onsite_percent: {
    label: 'Mebel / joyida yuvish',
    description: "Buyurtma summasidan foiz",
    fields: [{ key: 'percent', label: 'Foiz (%)' }],
  },
}

/**
 * Xodim bo'limiga qarab qaysi maosh usullari tavsiya etilishini
 * belgilaydi (talab: mutaxassislikka qarab maosh usuli tanlovi
 * filtrlansin) — "fixed"/"fixed_percent" har doim universal baza
 * sifatida barcha bo'limlarga mos. Ro'yxatda bo'lmagan (masalan admin
 * yaratgan "Boshqa" kasb) bo'limlar uchun cheklov qo'llanilmaydi —
 * barcha usullar ko'rsatiladi.
 */
export const DEPARTMENT_SALARY_METHODS: Record<string, string[]> = {
  dispatcher: ['fixed', 'fixed_percent'],
  worker: ['fixed', 'fixed_percent', 'washing', 'finishing', 'furniture_onsite_percent'],
  delivery: ['fixed', 'fixed_percent', 'delivery'],
  qc: ['fixed', 'fixed_percent'],
  supervisor: ['fixed', 'fixed_percent'],
}

export function recommendedSalaryMethods(department: string): string[] {
  return DEPARTMENT_SALARY_METHODS[department] ?? Object.keys(SALARY_METHODS)
}
