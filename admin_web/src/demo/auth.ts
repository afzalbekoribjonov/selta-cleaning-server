/**
 * DEMO REJIM — `firebase/auth` o'rniga: admin doim tizimga kirgan.
 * Haqiqiy hisobga hech narsa yuborilmaydi.
 */
export interface User {
  uid: string
  email: string | null
  getIdToken: () => Promise<string>
}

const demoUser: User = {
  uid: 'demo-admin',
  email: 'demo@seltacleaning.uz',
  getIdToken: async () => 'demo-token',
}

export const auth = { currentUser: demoUser as User | null }

export function getAuth() {
  return auth
}

export function onAuthStateChanged(_auth: unknown, callback: (user: User | null) => void) {
  const timer = setTimeout(() => callback(auth.currentUser), 50)
  return () => clearTimeout(timer)
}

export async function signInWithEmailAndPassword() {
  auth.currentUser = demoUser
  return { user: demoUser }
}

export async function signOut() {
  // Demo: chiqib ketmaydi — sahifalarni ko'rish davom etsin.
}

export const EmailAuthProvider = {
  credential: (email: string, password: string) => ({ email, password }),
}

export async function reauthenticateWithCredential() {}

export async function updatePassword() {}
