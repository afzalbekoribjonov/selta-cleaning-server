import { useState } from 'react'
import { Send, Pencil } from 'lucide-react'
import type { Timestamp } from 'firebase/firestore'
import { useComments } from '@/hooks/useComments'
import { useAuth } from '@/lib/auth-context'
import { addComment, editComment } from '@/lib/order-items'
import { formatDateTimeUz } from '@/lib/date-utils'

export function CommentsSection({ orderId }: { orderId: string }) {
  const { comments } = useComments(orderId)
  const { claims, profile } = useAuth()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  async function send() {
    const trimmed = text.trim()
    if (!trimmed || !claims) return
    setSending(true)
    try {
      await addComment(orderId, claims.employeeId, profile?.fullName ?? 'Xodim', trimmed)
      setText('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="mb-3 text-sm font-extrabold text-ink">Izohlar</h3>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Izoh yozing..."
          className="flex-1 rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-brand-primary"
        />
        <button
          onClick={send}
          disabled={sending}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-white disabled:opacity-60"
        >
          <Send size={16} />
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {comments.length === 0 ? (
          <p className="text-sm text-gray-dark">Hali izoh yo'q</p>
        ) : (
          comments.map((c) => (
            <CommentTile
              key={c.id as string}
              orderId={orderId}
              comment={c}
              canEdit={!!claims && c.authorId === claims.employeeId}
            />
          ))
        )}
      </div>
    </div>
  )
}

function CommentTile({
  orderId,
  comment,
  canEdit,
}: {
  orderId: string
  comment: Record<string, unknown>
  canEdit: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState((comment.text as string) ?? '')
  const [saving, setSaving] = useState(false)
  const createdAt = comment.createdAt as Timestamp | undefined
  const timeLabel = createdAt ? formatDateTimeUz(createdAt.toDate()) : ''
  const edited = !!comment.editedAt

  async function save() {
    const trimmed = text.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await editComment(orderId, comment.id as string, trimmed)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl bg-bg p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-extrabold text-ink">{(comment.authorName as string) ?? 'Xodim'}</span>
        <span className="ml-auto text-[11px] text-gray-dark">{timeLabel}</span>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} className="text-gray-dark hover:text-ink">
            <Pencil size={13} />
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-1.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary"
          />
          <div className="mt-1.5 flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="text-xs font-semibold text-gray-dark">
              Bekor qilish
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-brand-primary px-3 py-1 text-xs font-bold text-white disabled:opacity-60"
            >
              Saqlash
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm text-ink">
          {(comment.text as string) ?? ''}
          {edited && <span className="ml-1.5 text-xs italic text-gray-dark">(tahrirlangan)</span>}
        </p>
      )}
    </div>
  )
}
