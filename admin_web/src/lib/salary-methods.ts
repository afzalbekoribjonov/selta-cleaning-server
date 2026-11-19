/** talab #13'dagi 6 ta maosh hisoblash usuli — server/src/routes/payroll.ts bilan bir xil. */
export interface SalaryField {
  key: string
  label: string
  hint?: string
}

export interface SalaryMethodInfo {
  label: string
  description: string
  fields: SalaryField[]
  /** Ishbay narxlari mahsulotda (Mahsulotlar bo'limi) — xodimga kiritilmaydi. */
  piecework?: boolean
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
  washing: {
    label: 'Fiksa + ishbay',
    description: "Oylik fiksa + yuvgan va qadoqlagan hajmi × mahsulot narxi",
    fields: [{ key: 'baseAmount', label: "Oylik fiksa (so'm)", hint: "0 bo'lsa — faqat ishbay" }],
    piecework: true,
  },
  finishing: {
    label: 'Ishbay',
    description: 'Yuvgan va qadoqlagan hajmi × mahsulot narxi',
    fields: [],
    piecework: true,
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
  worker: ['washing', 'finishing', 'fixed', 'furniture_onsite_percent'],
  delivery: ['fixed', 'fixed_percent', 'delivery'],
  qc: ['fixed', 'fixed_percent'],
  supervisor: ['fixed', 'fixed_percent'],
}

export function recommendedSalaryMethods(department: string): string[] {
  return DEPARTMENT_SALARY_METHODS[department] ?? Object.keys(SALARY_METHODS)
}
