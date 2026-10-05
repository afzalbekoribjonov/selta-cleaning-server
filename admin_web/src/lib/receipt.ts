import { doc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import { apiPost } from './api'

/**
 * Chek ko'rinishi (`settings/receipt`) — server: lib/receiptSettings.ts,
 * ilova: core/printing/receipt_settings.dart. Standartlar uchala joyda bir xil.
 */
export interface ReceiptSettings {
  showLogo: boolean
  title: string
  headerLines: string[]
  footerLines: string[]
  showCustomerName: boolean
  showCustomerPhone: boolean
  showCustomerAddress: boolean
  showItemSize: boolean
  showItemTariff: boolean
  showItemStatus: boolean
  showCashier: boolean
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  showLogo: true,
  title: 'SELTA CLEANING',
  headerLines: [],
  footerLines: ['Xizmatimizdan foydalanganingiz uchun rahmat!'],
  showCustomerName: true,
  showCustomerPhone: true,
  showCustomerAddress: false,
  showItemSize: true,
  showItemTariff: true,
  showItemStatus: true,
  showCashier: true,
}

export const RECEIPT_LIMITS = { title: 40, line: 64, headerLines: 8, footerLines: 6 }

export function receiptSettingsFrom(data: Record<string, unknown> | undefined): ReceiptSettings {
  const d = DEFAULT_RECEIPT_SETTINGS
  if (!data) return d
  const flag = (k: keyof ReceiptSettings) => (typeof data[k] === 'boolean' ? (data[k] as boolean) : (d[k] as boolean))
  const lines = (k: 'headerLines' | 'footerLines') =>
    Array.isArray(data[k]) ? (data[k] as unknown[]).filter((l): l is string => typeof l === 'string' && l.trim() !== '') : d[k]
  return {
    showLogo: flag('showLogo'),
    title: typeof data.title === 'string' ? data.title : d.title,
    headerLines: lines('headerLines'),
    footerLines: lines('footerLines'),
    showCustomerName: flag('showCustomerName'),
    showCustomerPhone: flag('showCustomerPhone'),
    showCustomerAddress: flag('showCustomerAddress'),
    showItemSize: flag('showItemSize'),
    showItemTariff: flag('showItemTariff'),
    showItemStatus: flag('showItemStatus'),
    showCashier: flag('showCashier'),
  }
}

export function subscribeReceiptSettings(callback: (s: ReceiptSettings) => void) {
  return onSnapshot(
    doc(db, 'settings', 'receipt'),
    (snap) => callback(receiptSettingsFrom(snap.data())),
    () => callback(DEFAULT_RECEIPT_SETTINGS),
  )
}

export function updateReceiptSettings(settings: ReceiptSettings) {
  return apiPost<{ ok: true }>('/adminUpdateReceiptSettings', { settings: settings as unknown as Record<string, unknown> })
}

// ---------------- Joylashtirish (ilova bilan bir xil qoida) ----------------

const REPLACEMENTS: Record<string, string> = {
  'ʻ': "'", 'ʼ': "'", '‘': "'", '’': "'", '`': "'", '´': "'",
  '“': '"', '”': '"', '«': '"', '»': '"',
  '—': '-', '–': '-', '−': '-', '·': '|', '•': '*', '…': '...',
  '×': 'x', '²': '2', '³': '3', '№': 'N', ' ': ' ', ' ': ' ',
}

/** Termal printer chiqaradigan oddiy belgilarga — ilovadagi receiptAscii bilan bir xil. */
export function receiptAscii(input: string): string {
  let out = ''
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0
    if (REPLACEMENTS[ch] !== undefined) out += REPLACEMENTS[ch]
    else if (code === 10 || (code >= 32 && code < 127)) out += ch
    else out += '?'
  }
  return out
}

export function wrapText(text: string, width: number): string[] {
  const result: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      while (word.length > width) {
        if (line) {
          result.push(line)
          line = ''
        }
        result.push(word.slice(0, width))
        word = word.slice(width)
      }
      if (!line) line = word
      else if (line.length + 1 + word.length <= width) line = `${line} ${word}`
      else {
        result.push(line)
        line = word
      }
    }
    result.push(line)
  }
  return result
}

export interface PreviewLine {
  text: string
  bold?: boolean
  large?: boolean
  logo?: boolean
}

export type ReceiptBlock =
  | { kind: 'logo' }
  | { kind: 'text'; text: string; align?: 'left' | 'center'; bold?: boolean; large?: boolean }
  | { kind: 'pair'; left: string; right: string; bold?: boolean }
  | { kind: 'divider'; char?: string }

/** Chek bloklarini [chars] enli qatorlarga joylaydi (ilovadagi layoutReceipt). */
export function layoutReceipt(blocks: ReceiptBlock[], chars: number): PreviewLine[] {
  const out: PreviewLine[] = []
  for (const b of blocks) {
    if (b.kind === 'logo') out.push({ text: '', logo: true })
    else if (b.kind === 'divider') out.push({ text: (b.char ?? '-').repeat(chars) })
    else if (b.kind === 'text') {
      const w = b.large ? Math.floor(chars / 2) : chars
      for (const part of wrapText(receiptAscii(b.text), w)) {
        const text = b.align === 'center' ? ' '.repeat(Math.max(0, Math.floor((w - part.length) / 2))) + part : part
        out.push({ text, bold: b.bold, large: b.large })
      }
    } else {
      const l = receiptAscii(b.left).trim()
      const r = receiptAscii(b.right).trim()
      if (l.length + 1 + r.length <= chars) out.push({ text: l + ' '.repeat(chars - l.length - r.length) + r, bold: b.bold })
      else {
        const parts = wrapText(l, chars)
        const last = parts.pop() ?? ''
        parts.forEach((p) => out.push({ text: p, bold: b.bold }))
        if (last.length + 1 + r.length <= chars) out.push({ text: last + ' '.repeat(chars - last.length - r.length) + r, bold: b.bold })
        else {
          out.push({ text: last, bold: b.bold })
          out.push({ text: ' '.repeat(Math.max(0, chars - r.length)) + r.slice(0, chars), bold: b.bold })
        }
      }
    }
  }
  return out
}

/** Sozlamalar sahifasidagi namuna chek — haqiqiy chek tuzilishida. */
export function sampleReceipt(s: ReceiptSettings): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = []
  if (s.showLogo) blocks.push({ kind: 'logo' })
  if (s.title.trim()) blocks.push({ kind: 'text', text: s.title, align: 'center', bold: true, large: true })
  s.headerLines.forEach((l) => blocks.push({ kind: 'text', text: l, align: 'center' }))
  blocks.push({ kind: 'divider', char: '=' })
  blocks.push({ kind: 'pair', left: 'Buyurtma #1245', right: '06.10.2026 14:05', bold: true })
  if (s.showCustomerName) blocks.push({ kind: 'text', text: 'Mijoz: Aziz Karimov' })
  if (s.showCustomerPhone) blocks.push({ kind: 'text', text: 'Tel: +998 90 123 45 67' })
  if (s.showCustomerAddress) blocks.push({ kind: 'text', text: 'Manzil: Yunusobod 4-12' })
  blocks.push({ kind: 'text', text: 'Xizmat: Olib kelish' })
  blocks.push({ kind: 'divider' })
  const details = (size: string, tariff: string, status: string) =>
    ['   ' + [s.showItemSize ? size : '', s.showItemTariff ? tariff : '', s.showItemStatus ? status : ''].filter(Boolean).join(' | ')]
  blocks.push({ kind: 'text', text: '1. 1245/1 Gilam', bold: true })
  blocks.push({ kind: 'pair', left: details('12.00 m2 (3x4)', 'Express', '')[0], right: "360 000 so'm" })
  blocks.push({ kind: 'text', text: '2. 1245/2 Parda', bold: true })
  blocks.push({ kind: 'pair', left: details('2 dona', 'Comfort', '')[0], right: "80 000 so'm" })
  blocks.push({ kind: 'divider' })
  blocks.push({ kind: 'pair', left: 'Buyurtma jami:', right: "440 000 so'm", bold: true })
  blocks.push({ kind: 'pair', left: 'Chegirma:', right: "20 000 so'm" })
  blocks.push({ kind: 'pair', left: "To'landi:", right: "420 000 so'm", bold: true })
  blocks.push({ kind: 'divider' })
  if (s.showCashier) blocks.push({ kind: 'text', text: 'Xodim: Ali Valiyev' })
  s.footerLines.forEach((l) => blocks.push({ kind: 'text', text: l, align: 'center' }))
  return blocks
}
