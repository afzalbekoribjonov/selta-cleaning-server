import { auth } from './firebase'

// server/ (Render'dagi Express backend) manzili. Lokal ishlab chiqishda
// .env.local'da VITE_SERVER_BASE_URL orqali almashtirish mumkin.
const SERVER_BASE_URL = import.meta.env.VITE_SERVER_BASE_URL ?? 'http://localhost:8080'

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** server/src/lib/authz.ts'dagi ApiError bilan bir xil shakl — {error, message}. */
export async function apiPost<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken()

  let response: Response
  try {
    response = await fetch(`${SERVER_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
    })
  } catch {
    throw new ApiError(0, 'unavailable', "Serverga ulanib bo'lmadi")
  }

  const text = await response.text()
  let decoded: Record<string, unknown>
  try {
    decoded = text ? JSON.parse(text) : {}
  } catch {
    // Server kutilmagan (JSON bo'lmagan) javob qaytardi — masalan 404/502
    // HTML sahifasi. Route mavjud emasligi eng ehtimoliy sabab.
    throw new ApiError(response.status, 'internal', `Server kutilmagan javob qaytardi (${response.status})`)
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      (decoded.error as string) ?? 'internal',
      (decoded.message as string) ?? "Noma'lum xatolik yuz berdi",
    )
  }
  return decoded as T
}
