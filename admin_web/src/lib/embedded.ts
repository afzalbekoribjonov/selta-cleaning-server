/**
 * Admin panel mobil ilova ichida (WebView) ochilganmi.
 *
 * Ilova sahifaga `SeltaPrinter` kanalini beradi (mobile:
 * features/admin/admin_panel_screen.dart). Yangi versiyalari `SeltaLinks`
 * ni ham beradi — bu "tel:" va xarita havolalarini ilova telefonning o'z
 * ilovalarida ochishini bildiradi. Eski versiyada bunday havola WebView
 * o'rnida xato sahifasini ochardi, shuning uchun u yerda raqam
 * nusxalanadigan matn sifatida ko'rsatiladi.
 */
export function isEmbeddedApp(): boolean {
  return typeof window !== 'undefined' && 'SeltaPrinter' in window
}

export function externalLinksSupported(): boolean {
  return !isEmbeddedApp() || 'SeltaLinks' in window
}
