import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { collection, getAggregateFromServer, query, sum, count, where, Timestamp } from 'firebase/firestore'
import { Calculator, TrendingUp, TrendingDown, Wallet, ArrowRight } from 'lucide-react'
import { db } from '@/lib/firebase'
import { apiPost, ApiError } from '@/lib/api'

function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}${Math.round(Math.abs(value)).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

interface Result {
  revenue: number
  orderCount: number
  payrollCost: number
  profit: number
}

/**
 * Tanlangan oy uchun: tushum (Firestore aggregatsiya) - hisoblangan
 * oylik maosh (computeMonthlyPayroll) = taxminiy foyda/zarar. Talab
 * bo'yicha ixtiyoriy tugma orqali hisoblanadi — sahifa ochilganda
 * avtomatik ishlamaydi (Boshqaruv paneli tez yuklanishi uchun).
 */
export function ProfitLossCard() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth())
  const [result, setResult] = useState<Result | null>(null)

  const mutation = useMutation({
    mutationFn: async (): Promise<Result> => {
      const [year, month] = yearMonth.split('-').map(Number)
      const start = new Date(year, month - 1, 1)
      const end = new Date(year, month, 1)

      const [revenueSnap, payrollRes] = await Promise.all([
        getAggregateFromServer(
          query(collection(db, 'orders'), where('createdAt', '>=', Timestamp.fromDate(start)), where('createdAt', '<', Timestamp.fromDate(end))),
          { revenue: sum('totalPrice'), count: count() },
        ),
        apiPost<{ results: Record<string, { amount: number }> }>('/computeMonthlyPayroll', { yearMonth }),
      ])

      const revenue = revenueSnap.data().revenue ?? 0
      const orderCount = revenueSnap.data().count ?? 0
      const payrollCost = Object.values(payrollRes.results).reduce((s, r) => s + r.amount, 0)

      return { revenue, orderCount, payrollCost, profit: revenue - payrollCost }
    },
    onSuccess: setResult,
  })

  const profitable = (result?.profit ?? 0) >= 0

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <Calculator size={18} className="text-brand-primary" />
        <h2 className="font-heading font-bold text-ink">Foyda-zarar hisoblagichi</h2>
      </div>
      <p className="mb-4 text-xs text-gray-dark">Tushum − hisoblangan oylik maosh xarajati = taxminiy foyda</p>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Oy</label>
          <input
            type="month"
            value={yearMonth}
            onChange={(e) => {
              setYearMonth(e.target.value)
              setResult(null)
            }}
            className="rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary"
          />
        </div>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-60"
        >
          <Calculator size={16} />
          {mutation.isPending ? 'Hisoblanmoqda...' : 'Hisoblash'}
        </button>
        {mutation.isError && (
          <span className="text-sm font-semibold text-danger">
            {mutation.error instanceof ApiError ? mutation.error.message : 'Xatolik yuz berdi'}
          </span>
        )}
      </div>

      {result && (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-bg p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-dark">
              <TrendingUp size={14} />
              Tushum ({result.orderCount} ta buyurtma)
            </div>
            <div className="mt-1 text-lg font-extrabold text-ink">{formatMoney(result.revenue)}</div>
          </div>
          <div className="rounded-xl bg-bg p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-dark">
              <Wallet size={14} />
              Oylik maosh xarajati
            </div>
            <div className="mt-1 text-lg font-extrabold text-ink">{formatMoney(result.payrollCost)}</div>
          </div>
          <div className={`rounded-xl p-4 ${profitable ? 'bg-success-bg' : 'bg-danger-bg'}`}>
            <div className={`flex items-center gap-2 text-xs font-semibold ${profitable ? 'text-success' : 'text-danger'}`}>
              {profitable ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {profitable ? 'Taxminiy foyda' : 'Taxminiy zarar'}
            </div>
            <div className={`mt-1 text-lg font-extrabold ${profitable ? 'text-success' : 'text-danger'}`}>
              {profitable ? '+' : ''}
              {formatMoney(result.profit)}
            </div>
          </div>
        </div>
      )}

      {!result && !mutation.isPending && (
        <div className="mt-5 flex items-center gap-2 text-xs text-gray-dark">
          <ArrowRight size={14} />
          Hisoblash uchun oyni tanlang va "Hisoblash" tugmasini bosing
        </div>
      )}
    </section>
  )
}
