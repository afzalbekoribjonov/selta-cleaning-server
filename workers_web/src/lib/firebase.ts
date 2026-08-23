import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
export const db = getFirestore(firebaseApp)

// Talab: PIN bilan bir marta kirilgach, sessiya doim (brauzer yopilib
// qayta ochilgandan keyin ham) saqlanib qolishi kerak — indexedDB'ga
// yozadi, muddati tugamaydi (faqat PIN o'zgartirilsa/xodim
// o'chirilganda server tokenlarni bekor qiladi).
void setPersistence(auth, browserLocalPersistence)
