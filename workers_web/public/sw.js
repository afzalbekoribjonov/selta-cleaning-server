/*
 * Selta Cleaning — Ishchi paneli service worker.
 *
 * Maqsad: ilova qobig'i (shell) keshlansin, tarmoq sekin yoki uzilgan
 * paytda ham sayt ochilsin. LEKIN ma'lumot HECH QACHON keshlanmaydi —
 * buyurtmalar Firestore'dan jonli keladi va eskirgan ma'lumot ko'rsatish
 * bu biznesda xato qarorlarga olib keladi.
 *
 * Strategiya:
 *  - navigatsiya (HTML): avval tarmoq, uzilsa keshdagi index.html.
 *    Shu tufayli yangi deploy darhol ko'rinadi, kesh faqat zaxira.
 *  - /assets/* (Vite hash'li fayllar): avval kesh — nomi o'zgarmaguncha
 *    mazmuni ham o'zgarmaydi, shuning uchun bu xavfsiz.
 *  - qolgan hammasi (API, Firestore, Google Fonts): umuman aralashmaymiz.
 */
const VERSION = 'v1'
const SHELL_CACHE = `selta-shell-${VERSION}`
const ASSET_CACHE = `selta-assets-${VERSION}`

const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Boshqa domenlar (server API, Firestore, Google Fonts) — tegilmaydi.
  if (url.origin !== self.location.origin) return

  // Sahifa ochilishi: avval tarmoq, uzilsa keshdan.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy))
          return response
        })
        .catch(() => caches.match('/index.html').then((cached) => cached ?? Response.error())),
    )
    return
  }

  // Hash'li statik fayllar: keshdan, bo'lmasa tarmoqdan olib keshlaymiz.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icon-')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone()
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy))
            return response
          }),
      ),
    )
  }
})
