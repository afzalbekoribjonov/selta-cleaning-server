import { collection, doc, setDoc, updateDoc, query, orderBy, onSnapshot, serverTimestamp, type Timestamp } from 'firebase/firestore'
import { db } from './firebase'
import { apiPost } from './api'

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
  category?: string
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
  // Faqat ko'rsatish uchun — item yakunlangach (dastavchik yetkazgach)
  // to'ldiriladi, ItemRow shu maydonni "Yetkazdi: ..." qatorida ishlatadi.
  deliveredByName?: string
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
    category: data.category as string | undefined,
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
    deliveredByName: data.deliveredByName as string | undefined,
  }
}

export function subId(item: OrderItem, orderNumber: number): string {
  return `${orderNumber}/${item.itemNumber}`
}

export function isItemDone(item: OrderItem): boolean {
  return item.status === 'done'
}

/** Ishchi hali tahrirlashi mumkin bo'lgan bosqichlar — mobile/lib/features/worker/worker_order_detail_sheet.dart:itemEditableFor bilan bir xil. */
export function isItemEditable(status?: string): boolean {
  return status == null || status === 'pending' || status === 'washing'
}

export function subscribeOrderItems(orderId: string, callback: (items: OrderItem[]) => void) {
  const q = query(collection(db, 'orders', orderId, 'items'), orderBy('itemNumber'))
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => toOrderItem(d.id, d.data()))))
}

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

export async function addOrderItems(orderId: string, items: CatalogItemDraft[]): Promise<void> {
  await apiPost('/addOrderItems', { orderId, items })
}

export async function updateOrderItem(orderId: string, itemId: string, item: CatalogItemDraft): Promise<void> {
  await apiPost('/updateOrderItem', { orderId, itemId, item })
}

export async function deleteOrderItem(orderId: string, itemId: string): Promise<void> {
  await apiPost('/deleteOrderItem', { orderId, itemId })
}

/** Ishchi item pipeline harakati — pending->washing->packing, packing'da tasdiqlash(ready)/rad etish(returned). */
export async function changeItemStatus(
  orderId: string,
  itemId: string,
  toStatus: string,
  opts?: { qcNote?: string; actorName?: string },
): Promise<void> {
  await apiPost('/changeItemStatus', { orderId, itemId, toStatus, qcNote: opts?.qcNote, actorName: opts?.actorName })
}

/**
 * Ro'yxat kartalaridagi "oxirgi izoh"ni server yangilaydi
 * (server/src/routes/comments.ts). Javob kutilmaydi va xatosi izohning
 * o'ziga ta'sir qilmaydi — eng yomoni kartada eski izoh qoladi.
 */
function syncLastComment(body: { orderId: string; commentId: string; text: string; authorName: string; at?: number }) {
  apiPost('/setLastComment', body).catch(() => {})
}

export async function addComment(orderId: string, employeeId: string, authorName: string, text: string): Promise<void> {
  // ID oldindan olinadi — kartadagi "oxirgi izoh" aynan shu izohga bog'lanadi.
  const ref = doc(collection(db, 'orders', orderId, 'comments'))
  await setDoc(ref, {
    authorId: employeeId,
    authorName,
    text,
    createdAt: serverTimestamp(),
  })
  syncLastComment({ orderId, commentId: ref.id, text, authorName, at: Date.now() })
}

/**
 * `createdAt` — izoh yozilgan payt: server kartani faqat shu izoh u
 * yerda turgan bo'lsa yangilaydi (eski izohni tahrirlash yangisini bosmaydi).
 */
export async function editComment(
  orderId: string,
  commentId: string,
  text: string,
  opts?: { authorName?: string; createdAt?: Date },
): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId, 'comments', commentId), { text, editedAt: serverTimestamp() })
  syncLastComment({ orderId, commentId, text, authorName: opts?.authorName ?? '', at: opts?.createdAt?.getTime() })
}
