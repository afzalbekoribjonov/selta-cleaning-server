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
    description: '1 m² narxi',
    fields: [{ key: 'pricePerSqm', label: "1 m² narxi (so'm)", hint: '500 – 1500' }],
  },
  washing: {
    label: 'Yuvish',
    description: 'Baza + 1 m² narxi',
    fields: [
      { key: 'baseAmount', label: "Baza summa (so'm)" },
      { key: 'pricePerSqm', label: "1 m² narxi (so'm)", hint: '1000 – 2000' },
    ],
  },
  furniture_onsite_percent: {
    label: 'Mebel / joyida yuvish',
    description: "Buyurtma summasidan foiz",
    fields: [{ key: 'percent', label: 'Foiz (%)' }],
  },
}
