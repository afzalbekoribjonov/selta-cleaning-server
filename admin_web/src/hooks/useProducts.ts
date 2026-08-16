import { useEffect, useState } from 'react'
import { subscribeProducts, subscribeConditionSurcharges, type Product, type ConditionSurcharges } from '@/lib/products'

export function useProducts() {
  const [products, setProducts] = useState<Product[] | null>(null)

  useEffect(() => {
    return subscribeProducts(setProducts)
  }, [])

  return { products, loading: products === null }
}

export function useConditionSurcharges() {
  const [surcharges, setSurcharges] = useState<ConditionSurcharges | null>(null)

  useEffect(() => {
    return subscribeConditionSurcharges(setSurcharges)
  }, [])

  return { surcharges, loading: surcharges === null }
}
