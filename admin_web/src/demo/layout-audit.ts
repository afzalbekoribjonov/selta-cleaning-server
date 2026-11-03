/**
 * DEMO REJIM — sahifadagi ko'rinmay qolgan matnlarni topish uchun.
 * Konsolda: `__layoutAudit()` → kesilgan matnlar (title'siz), ekrandan
 * chiqib ketgan elementlar va gorizontal skroll bor-yo'qligi.
 */
function layoutAudit(root = 'main, [role=dialog]') {
  const vw = document.documentElement.clientWidth
  const truncated: string[] = []
  const offscreen: string[] = []
  for (const host of document.querySelectorAll(root)) {
    for (const el of host.querySelectorAll<HTMLElement>('*')) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const text = el.textContent?.trim() ?? ''
      const clipped = cs.textOverflow === 'ellipsis' || (cs.overflowX === 'hidden' && cs.whiteSpace === 'nowrap')
      if (clipped && text && el.scrollWidth > el.clientWidth + 1 && !el.closest('[title]')) {
        truncated.push(`${text.slice(0, 60)} [${el.clientWidth}/${el.scrollWidth}]`)
      }
      if (r.right > vw + 1 && cs.position !== 'fixed' && !el.closest('.overflow-x-auto, [data-scroll-x]')) {
        offscreen.push(`${(el.getAttribute('class') || el.tagName).slice(0, 60)} → ${Math.round(r.right)}`)
      }
    }
  }
  return {
    vw,
    pageOverflow: document.documentElement.scrollWidth > vw + 1,
    truncated: [...new Set(truncated)].slice(0, 30),
    offscreen: [...new Set(offscreen)].slice(0, 15),
  }
}

;(window as unknown as { __layoutAudit: typeof layoutAudit }).__layoutAudit = layoutAudit
