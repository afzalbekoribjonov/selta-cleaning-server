import { apiPost } from './api'

export async function changeOrderStatus(orderId: string, toStatus: string, actorName?: string): Promise<void> {
  await apiPost('/changeOrderStatus', { orderId, toStatus, actorName })
}
