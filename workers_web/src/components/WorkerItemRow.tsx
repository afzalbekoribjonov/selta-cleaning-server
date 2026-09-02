import { useState } from 'react'
import { Lock, Droplets, Package, Check, X } from 'lucide-react'
import { ItemRow } from '@/components/ItemRow'
import { CatalogItemModal } from '@/components/CatalogItemModal'
import { changeItemStatus, isItemEditable, type OrderItem } from '@/lib/order-items'
import { subId } from '@/lib/order-items'
import { useAuth } from '@/lib/auth-context'
import { describeApiError } from '@/lib/api'
import type { Order } from '@/lib/orders'

/**
 * mobile/lib/features/shared/item_action_row.dart bilan bir xil mantiq:
 * pending/washing -> keyingi bosqich (mutaxassislik talab qiladi),
 * packing -> tasdiqlash(ready)/rad etish(returned) (upakovkachi huquqi
 * talab qiladi). Onsite itemlarida (status==null) yoki huquq bo'lmaganda
 * faqat oddiy holat ko'rsatiladi.
 */
export function WorkerItemRow({ order, item }: { order: Order; item: OrderItem }) {
  const { profile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [failOpen, setFailOpen] = useState(false)
  const [passOpen, setPassOpen] = useState(false)

  const specializations = profile?.specializations ?? []
  const canPack = profile?.canPack ?? false
  const status = item.status
  const category = item.category
  const hasWashingLavozim = specializations.length > 0 && (category == null || specializations.includes(category))
  const editable = isItemEditable(status)

  async function advance(toStatus: string, opts?: { qcNote?: string }) {
    setBusy(true)
    setError(null)
    try {
      await changeItemStatus(order.id, item.id, toStatus, { qcNote: opts?.qcNote, actorName: profile?.fullName })
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-border py-1 last:border-0">
      <ItemRow item={item} subId={subId(item, order.orderNumber)} onClick={editable ? () => setEditOpen(true) : undefined} />

      {busy ? (
        <div className="mb-2 h-1 overflow-hidden rounded-full bg-bg">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-primary" />
        </div>
      ) : (
        <div className="mb-2 ml-[52px]">
          {(status === 'pending' || status === 'washing' || status === 'returned') &&
            (hasWashingLavozim ? (
              // Talab: narxi 0 bo'lgan mahsulot upakovkaga o'tolmasin.
              // Server ham buni bloklaydi (changeItemStatus) — bu yerdagisi
              // xodimga NIMA qilish kerakligini oldindan aytish uchun.
              status === 'washing' && item.price <= 0 ? (
                <button
                  onClick={() => setEditOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-danger bg-danger-bg px-3 py-1.5 text-xs font-extrabold text-danger"
                >
                  <Package size={13} />
                  Narxi 0 — avval o'lchang
                </button>
              ) : (
                <button
                  onClick={() => advance(status === 'washing' ? 'packing' : 'washing')}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-ink hover:bg-bg"
                >
                  {status === 'washing' ? <Package size={13} /> : <Droplets size={13} />}
                  {status === 'washing' ? "Upakovkaga o'tkazish" : 'Yuvishni boshlash'}
                </button>
              )
            ) : (
              <LavozimHint
                text={
                  specializations.length === 0
                    ? "Sizga hali lavozim (mutaxassislik) belgilanmagan — admin bilan bog'laning"
                    : 'Bu mahsulot toifasi sizning mutaxassisligingizga mos emas'
                }
              />
            ))}

          {status === 'packing' &&
            (canPack ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setFailOpen(true)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-danger px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger-bg"
                >
                  <X size={13} />
                  Rad etish
                </button>
                <button
                  onClick={() => setPassOpen(true)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
                >
                  <Check size={13} />
                  Tasdiqlash
                </button>
              </div>
            ) : (
              <LavozimHint text="Sizga upakovkachi huquqi berilmagan — admin bilan bog'laning" />
            ))}

          {error && <p className="mt-1 text-xs font-semibold text-danger">{error}</p>}
        </div>
      )}

      {editOpen && (
        <CatalogItemModal
          serviceType={order.serviceType}
          orderTariff={order.tariff}
          orderId={order.id}
          existingItem={item}
          onClose={() => setEditOpen(false)}
        />
      )}
      {failOpen && (
        <FailDialog
          itemName={item.name}
          onClose={() => setFailOpen(false)}
          onConfirm={(note) => {
            setFailOpen(false)
            advance('returned', { qcNote: note })
          }}
        />
      )}
      {passOpen && (
        <PassDialog
          itemName={item.name}
          onClose={() => setPassOpen(false)}
          onConfirm={() => {
            setPassOpen(false)
            advance('ready')
          }}
        />
      )}
    </div>
  )
}

function LavozimHint({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-1.5 rounded-lg bg-warning-bg px-2.5 py-2 text-warning">
      <Lock size={13} className="mt-0.5 shrink-0" />
      <span className="text-xs font-semibold leading-snug">{text}</span>
    </div>
  )
}

function FailDialog({ itemName, onClose, onConfirm }: { itemName: string; onClose: () => void; onConfirm: (note?: string) => void }) {
  const [note, setNote] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-heading text-lg font-extrabold text-ink">Mahsulot rad etildi</h2>
        <p className="mt-1 text-sm text-gray-dark">"{itemName}" qayta ishlov uchun qaytariladi.</p>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Sabab (ixtiyoriy)"
          autoFocus
          className="mt-4 w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-brand-primary"
        />
        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-ink">
            Bekor qilish
          </button>
          <button
            onClick={() => onConfirm(note.trim() || undefined)}
            className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-bold text-white"
          >
            Qaytarish
          </button>
        </div>
      </div>
    </div>
  )
}

function PassDialog({ itemName, onClose, onConfirm }: { itemName: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-heading text-lg font-extrabold text-ink">Mahsulot tasdiqlandi</h2>
        <p className="mt-1 text-sm text-gray-dark">"{itemName}" yetkazishga tayyor deb belgilansinmi?</p>
        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-ink">
            Bekor qilish
          </button>
          <button onClick={onConfirm} className="flex-1 rounded-xl bg-brand-primary py-2.5 text-sm font-bold text-white">
            Tasdiqlash
          </button>
        </div>
      </div>
    </div>
  )
}
