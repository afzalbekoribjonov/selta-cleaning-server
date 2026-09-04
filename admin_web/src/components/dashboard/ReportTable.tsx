import { type ReactNode } from 'react'

/**
 * Telefonda ustun qanday ko'rsatiladi:
 *  - `title` — qatorning birinchi qatoridagi asosiy matn
 *  - `value` — o'ng tomondagi qiymat (hajm, summa)
 *  - `sub`   — sarlavha ostidagi ikkinchi darajali qator
 *  - `meta`  — pastdagi "Nomi: qiymat" juftliklari
 *  - `hide`  — telefonda umuman ko'rsatilmaydi
 */
export type MobileRole = 'title' | 'value' | 'sub' | 'meta' | 'hide'

export interface ReportColumn<T> {
  key: string
  label: string
  align?: 'left' | 'right'
  mobile?: MobileRole
  render: (row: T) => ReactNode
}

/**
 * Kunlik hisobot ro'yxatlari uchun yagona ko'rinish: katta ekranda oddiy
 * jadval, telefonda esa ajratgich chiziqli ro'yxat.
 *
 * Avval har bir qator alohida ramkali karta ("banner") edi — ro'yxat
 * uzun bo'lganda ko'z qayerga qarashni bilmasdi va ustunlar taqqoslab
 * bo'lmasdi. Jadval bir xil ma'lumotni ancha tez o'qitadi, telefonda
 * esa har bir qiymat o'z nomi bilan yoziladi, ya'ni ustun sarlavhasini
 * eslab qolish shart emas.
 */
export function ReportTable<T>({
  columns,
  rows,
  rowKey,
  empty,
}: {
  columns: ReportColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  empty: string
}) {
  if (rows.length === 0) return <p className="py-12 text-center text-sm text-gray-dark">{empty}</p>

  const titleCols = columns.filter((c) => (c.mobile ?? 'meta') === 'title')
  const valueCols = columns.filter((c) => c.mobile === 'value')
  const subCols = columns.filter((c) => c.mobile === 'sub')
  const metaCols = columns.filter((c) => (c.mobile ?? 'meta') === 'meta')

  return (
    <>
      {/* Telefon */}
      <ul className="divide-y divide-border lg:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="py-3 first:pt-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-ink">
                  {titleCols.map((c) => (
                    <span key={c.key}>{c.render(row)}</span>
                  ))}
                </div>
                {subCols.length > 0 && (
                  <div className="mt-0.5 truncate text-xs text-gray-dark">
                    {subCols.map((c) => (
                      <span key={c.key}>{c.render(row)}</span>
                    ))}
                  </div>
                )}
              </div>
              {valueCols.length > 0 && (
                <div className="shrink-0 text-right">
                  {valueCols.map((c) => (
                    <div key={c.key} className="text-sm font-bold text-ink first:font-heading first:text-base">
                      {c.render(row)}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {metaCols.length > 0 && (
              <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
                {metaCols.map((c) => (
                  <div key={c.key} className="flex gap-1">
                    <dt className="text-gray">{c.label}:</dt>
                    <dd className="font-semibold text-gray-dark">{c.render(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>

      {/* Katta ekran */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-gray">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`whitespace-nowrap px-3 py-2 font-bold ${c.align === 'right' ? 'text-right' : ''}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-border last:border-0 hover:bg-bg/60">
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2.5 ${c.align === 'right' ? 'text-right' : ''}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
