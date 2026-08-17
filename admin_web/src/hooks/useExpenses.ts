import { useEffect, useState } from 'react'
import { subscribeExpenses, type Expense } from '@/lib/expenses'

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null)

  useEffect(() => {
    return subscribeExpenses(setExpenses)
  }, [])

  return { expenses, loading: expenses === null }
}
