import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, AtSign, Bot, CheckCircle2, Hash, Link2, Plus, Send, Trash2, UserCheck } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { formatDateTimeUz } from '@/lib/date-utils'
import {
  addTelegramUser,
  fetchTelegramBot,
  identifierError,
  MAX_TELEGRAM_USERS,
  removeTelegramUser,
  TELEGRAM_BOT_QUERY_KEY,
  type TelegramBotUser,
} from '@/lib/telegram-bot'
import { useConfirm } from '@/hooks/useConfirm'
import { Spinner } from '@/components/ui/Spinner'

const errorText = (err: unknown) => (err instanceof ApiError ? err.message : "Amalni bajarib bo'lmadi")

/**
 * Kunlik hisobot Telegram boti — kim foydalana olishi. Bot faqat shu
 * ro'yxatdagi hisoblarga javob beradi; boshqalarga umuman javob bermaydi.
 */
export function TelegramBotCard() {
  const queryClient = useQueryClient()
  const [confirmDialog, confirm] = useConfirm()
  const [identifier, setIdentifier] = useState('')
  const [label, setLabel] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: TELEGRAM_BOT_QUERY_KEY,
    queryFn: fetchTelegramBot,
    staleTime: 30_000,
  })

  const add = useMutation({
    mutationFn: () => addTelegramUser(identifier.trim(), label.trim()),
    onSuccess: () => {
      setIdentifier('')
      setLabel('')
      setFormError(null)
      void queryClient.invalidateQueries({ queryKey: TELEGRAM_BOT_QUERY_KEY })
    },
    onError: (err) => setFormError(errorText(err)),
  })

  const remove = useMutation({
    mutationFn: (key: string) => removeTelegramUser(key),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: TELEGRAM_BOT_QUERY_KEY }),
  })

  const inputError = identifierError(identifier)
  const users = data?.users ?? []
  const full = users.length >= MAX_TELEGRAM_USERS

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!identifier.trim() || inputError || add.isPending || full) return
    add.mutate()
  }

  async function askRemove(user: TelegramBotUser) {
    const ok = await confirm({
      title: "Hisob ro'yxatdan o'chirilsinmi?",
      message: `${displayIdentifier(user)} endi botdan hisobot ola olmaydi. Bot unga javob berishni darhol to'xtatadi.`,
      confirmLabel: "O'chirish",
      danger: true,
    })
    if (ok) remove.mutate(user.key)
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <h2 className="mb-1 flex items-center gap-2 font-heading font-bold text-ink">
        <Send size={18} className="text-brand-primary" />
        Telegram hisobot boti
      </h2>
      <p className="mb-4 text-xs text-gray-dark">
        Bot kunlik hisobot, tariflar, xodimlar faolligi va buyurtma tafsilotlarini yuboradi. U faqat shu ro'yxatdagi Telegram
        hisoblariga javob beradi — boshqalarga umuman javob bermaydi.
      </p>

      {isLoading ? (
        <Spinner className="py-6" />
      ) : isError || !data ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg p-3.5 text-sm">
          <span className="font-semibold text-danger">Bot holatini olib bo'lmadi</span>
          <button type="button" onClick={() => refetch()} className="text-xs font-bold text-brand-primary hover:underline">
            Qayta urinish
          </button>
        </div>
      ) : (
        <>
          <BotStatus status={data} />

          <form onSubmit={submit} className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-start">
            <label className="block min-w-0">
              <span className="text-xs font-semibold text-gray-dark">Telegram username yoki ID</span>
              <div className="relative mt-1">
                <AtSign size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray" />
                <input
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value)
                    setFormError(null)
                  }}
                  placeholder="ali_valiyev yoki 123456789"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={60}
                  className="block h-11 w-full rounded-xl border border-border bg-bg pl-9 pr-3 text-sm font-semibold text-ink outline-none focus:border-brand-primary"
                />
              </div>
            </label>
            <label className="block min-w-0">
              <span className="text-xs font-semibold text-gray-dark">Izoh (ixtiyoriy)</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Masalan: Direktor"
                maxLength={60}
                className="mt-1 block h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm text-ink outline-none focus:border-brand-primary"
              />
            </label>
            <button
              type="submit"
              disabled={!identifier.trim() || !!inputError || add.isPending || full}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 sm:mt-5"
            >
              <Plus size={16} />
              {add.isPending ? "Qo'shilmoqda..." : "Qo'shish"}
            </button>
          </form>
          {(inputError || formError) && <p className="mt-1.5 text-xs font-bold text-danger">{formError ?? inputError}</p>}
          {full && <p className="mt-1.5 text-xs font-semibold text-gray-dark">Ko'pi bilan {MAX_TELEGRAM_USERS} ta hisob qo'shish mumkin.</p>}

          <div className="mt-4 space-y-2">
            {users.length === 0 ? (
              <p className="rounded-xl bg-bg p-4 text-center text-sm text-gray-dark">Hali hech kim qo'shilmagan — bot hech kimga javob bermaydi</p>
            ) : (
              users.map((u) => (
                <UserRow key={u.key} user={u} removing={remove.isPending && remove.variables === u.key} onRemove={() => askRemove(u)} />
              ))
            )}
          </div>
          {remove.isError && <p className="mt-2 text-xs font-bold text-danger">{errorText(remove.error)}</p>}

          <div className="mt-4 rounded-xl bg-bg p-3.5 text-xs leading-relaxed text-gray-dark">
            <p className="mb-1 font-bold text-ink">Qanday ishlaydi</p>
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>Hisobni username (@ belgisi bilan yoki usiz) yoki raqamli ID orqali qo'shing.</li>
              <li>
                U botni ochib <b>/start</b> bosadi — hisob shu paytda uning Telegram ID raqamiga bog'lanadi. Keyin username
                o'zgarsa ham bot ishlayveradi, username'ni boshqa odam olsa — unga javob bermaydi.
              </li>
              <li>
                <b>/hisobot</b> — bugungi hisobot (lotin yoki kirill yozuvida), <b>/id</b> — buyurtmani ID raqami orqali topish.
              </li>
            </ol>
          </div>
        </>
      )}
      {confirmDialog}
    </section>
  )
}

function displayIdentifier(u: TelegramBotUser): string {
  if (u.username) return `@${u.username}`
  return `ID ${u.userId}`
}

function BotStatus({ status }: { status: NonNullable<Awaited<ReturnType<typeof fetchTelegramBot>>> }) {
  if (!status.configured) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/5 p-3.5 text-sm">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
        <p className="text-ink">
          Bot serverda yoqilmagan. Render'dagi serverning <b>Environment</b> bo'limiga <code>TELEGRAM_BOT_TOKEN</code> qiymatini
          qo'shing — server qayta ishga tushgach bot o'zi ulanadi. Ro'yxatni hozirdan to'ldirib qo'yish mumkin.
        </p>
      </div>
    )
  }

  const hook = status.webhook
  const healthy = hook?.ok && !hook.lastError
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
        <Bot size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">{status.botUsername ? `@${status.botUsername}` : 'Telegram bot'}</p>
        {hook === null ? (
          <p className="text-xs text-gray-dark">Holatni tekshirib bo'lmadi</p>
        ) : healthy ? (
          <p className="inline-flex items-center gap-1 text-xs font-semibold text-success">
            <CheckCircle2 size={13} /> Ishlamoqda
          </p>
        ) : (
          <p className="text-xs font-semibold text-danger [overflow-wrap:anywhere]">
            {!hook.ok ? 'Webhook ulanmagan — server qayta ishga tushirilsin' : `Oxirgi xato: ${hook.lastError}`}
            {hook.lastErrorAt && ` · ${formatDateTimeUz(new Date(hook.lastErrorAt))}`}
          </p>
        )}
      </div>
      {status.botUsername && (
        <a
          href={`https://t.me/${status.botUsername}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Botni ochish"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-bold text-brand-primary hover:bg-bg"
        >
          <Link2 size={14} />
          <span className="hidden sm:inline">Botni ochish</span>
        </a>
      )}
    </div>
  )
}

function UserRow({ user, removing, onRemove }: { user: TelegramBotUser; removing: boolean; onRemove: () => void }) {
  const linked = user.userId !== null && (user.linkedAt !== null || !user.username)
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border p-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          linked ? 'bg-success/10 text-success' : 'bg-bg text-gray'
        }`}
      >
        {user.username ? <AtSign size={16} /> : <Hash size={16} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">
          {displayIdentifier(user)}
          {user.label && <span className="font-semibold text-gray-dark"> · {user.label}</span>}
        </p>
        <p className="text-xs text-gray-dark [overflow-wrap:anywhere]">
          {user.linkedAt ? (
            <span className="inline-flex items-center gap-1 font-semibold text-success">
              <UserCheck size={12} />
              {user.linkedName ?? 'Ulangan'} · {formatDateTimeUz(new Date(user.linkedAt))}
            </span>
          ) : user.username ? (
            "Hali /start bosmagan"
          ) : (
            `Telegram ID: ${user.userId}`
          )}
          {user.lang === 'cyrl' && ' · Kirill'}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        aria-label="O'chirish"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-dark transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}
