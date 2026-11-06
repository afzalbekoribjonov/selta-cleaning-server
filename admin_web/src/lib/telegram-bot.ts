import { apiPost } from './api'

/** server/src/routes/telegram.ts bilan bir xil shakl. */
export interface TelegramBotUser {
  key: string
  username: string | null
  userId: number | null
  label: string
  lang: 'latn' | 'cyrl'
  addedAt: string | null
  linkedAt: string | null
  linkedName: string | null
}

export interface TelegramBotStatus {
  /** Serverda TELEGRAM_BOT_TOKEN bormi. */
  configured: boolean
  botUsername: string | null
  webhook: { ok: boolean; pendingUpdates: number; lastError: string | null; lastErrorAt: string | null } | null
  users: TelegramBotUser[]
}

export const TELEGRAM_BOT_QUERY_KEY = ['telegramBot'] as const
export const MAX_TELEGRAM_USERS = 20

export function fetchTelegramBot(): Promise<TelegramBotStatus> {
  return apiPost<TelegramBotStatus>('/adminTelegramBot')
}

export function addTelegramUser(identifier: string, label: string) {
  return apiPost<{ ok: boolean; user: TelegramBotUser }>('/adminTelegramAddUser', { identifier, label })
}

export function removeTelegramUser(key: string) {
  return apiPost<{ ok: boolean }>('/adminTelegramRemoveUser', { key })
}

/**
 * Kiritilgan qiymatni oldindan tekshiradi (server ham tekshiradi):
 * "@username" (5–32 belgi) yoki raqamli ID. `null` — to'g'ri.
 */
export function identifierError(raw: string): string | null {
  const value = raw.trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '')
  if (!value) return null
  if (/^\d+$/.test(value)) return value.length >= 4 && value.length <= 15 ? null : "ID 4–15 ta raqamdan iborat bo'ladi"
  if (/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value)) return null
  return "Username harf bilan boshlanadi, 5–32 ta harf, raqam yoki _ dan iborat bo'ladi"
}
