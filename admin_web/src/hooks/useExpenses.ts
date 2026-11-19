import { useEffect, useMemo, useState } from 'react'
import {
  expenseEntries,
  subscribeExpensesInRange,
  subscribeRecurringExpenses,
  type Expense,
} from '@/lib/expenses'
import type { DateRange } from '@/lib/uz-dates'

/** Takrorlanuvchi chiqimlar (jonli) — oy va davr hisoblari uchun. */
export function useRecurringExpenses() {
  const [recurring, setRecurring] = useState<Expense[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  useEffect(() => subscribeRecurringExpenses(setRecurring, setError), [])
  return { recurring, error }
}

/**
 * Davr chiqimlari (jonli): faqat shu davrdagi hujjatlar o'qiladi, avvalgi
 * "oxirgi 500 ta" o'rniga. Takrorlanuvchilar har oyning o'z kunida.
 */
export function useExpensesInRange(range: DateRange) {
  const { from, to } = range
  const key = `${from}:${to}`
  const [state, setState] = useState<{ key: string; list: Expense[] } | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const { recurring, error: recurringError } = useRecurringExpenses()

  useEffect(() => {
    setError(null)
    return subscribeExpensesInRange({ from, to }, (list) => setState({ key: `${from}:${to}`, list }), setError)
  }, [from, to])

  const oneTime = state?.key === key ? state.list : null
  const entries = useMemo(
    () => (oneTime && recurring ? expenseEntries(oneTime, recurring, { from, to }) : null),
    [oneTime, recurring, from, to],
  )
  return { entries, recurring, loading: entries === null && !error && !recurringError, error: error ?? recurringError }
}
