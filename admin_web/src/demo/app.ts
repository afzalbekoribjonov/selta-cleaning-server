/** DEMO REJIM — `firebase/app` o'rniga (hech qayerga ulanmaydi). */
import './layout-audit'

export type FirebaseOptions = Record<string, unknown>

export function initializeApp(options: FirebaseOptions) {
  return { options, name: 'demo' }
}
