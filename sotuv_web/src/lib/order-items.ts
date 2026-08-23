import { collection, doc, addDoc, updateDoc, query, orderBy, onSnapshot, serverTimestamp, type Timestamp } from 'firebase/firestore'
import { db } from './firebase'

export interface OrderItem {
  id: string
  itemNumber: number
  name: string
  area: number
  price: number
  qcStatus: string
  qcNote?: string
  productId?: string
  calcType: string
  width?: number
  height?: number
  qty?: number
  sizeVariant?: string
  unitPrice?: number
  condition?: string
  conditionSurchargePercent?: number
  tariff?: string
  dueDate?: Date
  createdAt?: Date
  status?: string
  washedBy?: string
  deliveredBy?: string
  deliveredByName?: string
  collectedAmount?: number
}

function toOrderItem(id: string, data: Record<string, unknown>): OrderItem {
  const ts = (v: unknown) => (v as Timestamp | undefined)?.toDate()
  return {
    id,
    itemNumber: (data.itemNumber as number) ?? 0,
    name: (data.name as string) ?? 'Mahsulot',
    area: (data.area as number) ?? 0,
    price: (data.price as number) ?? 0,
    qcStatus: (data.qcStatus as string) ?? 'pending',
    qcNote: data.qcNote as string | undefined,
    productId: data.productId as string | undefined,
    calcType: (data.calcType as string) ?? 'fixed',
    width: data.width as number | undefined,
    height: data.height as number | undefined,
    qty: data.qty as number | undefined,
    sizeVariant: data.sizeVariant as string | undefined,
    unitPrice: data.unitPrice as number | undefined,
    condition: data.condition as string | undefined,
    conditionSurchargePercent: data.conditionSurchargePercent as number | undefined,
    tariff: data.tariff as string | undefined,
    dueDate: ts(data.dueDate),
    createdAt: ts(data.createdAt),
    status: data.status as string | undefined,
    washedBy: data.washedBy as string | undefined,
    deliveredBy: data.deliveredBy as string | undefined,
    deliveredByName: data.deliveredByName as string | undefined,
    collectedAmount: data.collectedAmount as number | undefined,
  }
}

export function subId(item: OrderItem, orderNumber: number): string {
  return `${orderNumber}/${item.itemNumber}`
}

export function isItemDone(item: OrderItem): boolean {
  return item.status === 'done'
}

export function subscribeOrderItems(orderId: string, callback: (items: OrderItem[]) => void) {
  const q = query(collection(db, 'orders', orderId, 'items'), orderBy('itemNumber'))
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => toOrderItem(d.id, d.data()))))
}

/** Buyurtma yaratish/mahsulot qo'shishda serverga yuboriladigan shakl — mobile/lib/core/models/order_item.dart:CatalogItemDraft bilan bir xil. */
export interface CatalogItemDraft {
  name: string
  productId?: string
  calcType: string
  tariff?: string
  width?: number
  height?: number
  qty?: number
  sizeVariant?: string
  condition?: string
  price?: number
}

export async function addComment(orderId: string, employeeId: string, authorName: string, text: string): Promise<void> {
  await addDoc(collection(db, 'orders', orderId, 'comments'), {
    authorId: employeeId,
    authorName,
    text,
    createdAt: serverTimestamp(),
  })
}

export async function editComment(orderId: string, commentId: string, text: string): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId, 'comments', commentId), { text, editedAt: serverTimestamp() })
}
