import { apiPost } from './api'
import type { CatalogItemDraft } from './order-items'

export interface CreateOrderParams {
  customerName: string
  phone: string
  location: string
  serviceType: 'pickup' | 'onsite'
  tariff?: string
  items?: CatalogItemDraft[]
  notedItems?: string[]
  estimatedPrice?: number
  source?: string
  walkIn?: boolean
  actorName?: string
}

export async function createOrder(params: CreateOrderParams): Promise<{ orderId: string; orderNumber: number }> {
  const body: Record<string, unknown> = {
    customerName: params.customerName,
    phone: params.phone,
    location: params.location,
    serviceType: params.serviceType,
  }
  if (params.tariff) body.tariff = params.tariff
  if (params.items && params.items.length > 0) body.items = params.items
  if (params.notedItems && params.notedItems.length > 0) body.notedItems = params.notedItems
  if (params.estimatedPrice) body.estimatedPrice = params.estimatedPrice
  if (params.source) body.source = params.source
  if (params.walkIn) body.walkIn = params.walkIn
  if (params.actorName) body.actorName = params.actorName
  return apiPost('/createOrder', body)
}

export async function updateOrder(params: {
  orderId: string
  customerName: string
  phone: string
  location: string
  tariff?: string
}): Promise<void> {
  await apiPost('/updateOrder', params)
}

export async function assignTeam(orderId: string, employeeIds: string[]): Promise<void> {
  await apiPost('/assignTeam', { orderId, employeeIds })
}
