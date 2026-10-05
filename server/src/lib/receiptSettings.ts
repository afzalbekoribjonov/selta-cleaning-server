/**
 * Chek ko'rinishi — admin panel sozlamalari (`settings/receipt`). Ilova
 * shu hujjatni jonli o'qiydi (keshlanadi) va chekni shu bo'yicha quradi.
 *
 * Termal printerlar faqat oddiy lotin belgilarini ishonchli chiqaradi,
 * shuning uchun matnlar qisqa va soni cheklangan; ilova chop etishda
 * maxsus belgilarni (ʻ, ², ×, —) baribir oddiylariga almashtiradi.
 */
export interface ReceiptSettings {
  showLogo: boolean;
  title: string;
  headerLines: string[];
  footerLines: string[];
  showCustomerName: boolean;
  showCustomerPhone: boolean;
  showCustomerAddress: boolean;
  showItemSize: boolean;
  showItemTariff: boolean;
  showItemStatus: boolean;
  showCashier: boolean;
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  showLogo: true,
  title: "SELTA CLEANING",
  headerLines: [],
  footerLines: ["Xizmatimizdan foydalanganingiz uchun rahmat!"],
  showCustomerName: true,
  showCustomerPhone: true,
  showCustomerAddress: false,
  showItemSize: true,
  showItemTariff: true,
  showItemStatus: true,
  showCashier: true,
};

const MAX_TITLE = 40;
const MAX_LINE = 64;
const MAX_HEADER_LINES = 8;
const MAX_FOOTER_LINES = 6;

function cleanLines(raw: unknown, max: number): string[] | null {
  if (!Array.isArray(raw)) return null;
  const lines = raw.map((l) => (typeof l === "string" ? l.trim() : "")).filter(Boolean);
  if (lines.length > max || lines.some((l) => l.length > MAX_LINE)) return null;
  return lines;
}

/**
 * So'rovdagi sozlamani tekshiradi. Noto'g'ri bo'lsa — sababi (matn),
 * to'g'ri bo'lsa — tozalangan sozlama.
 */
export function validateReceiptSettings(raw: unknown): ReceiptSettings | string {
  if (typeof raw !== "object" || raw === null) return "Sozlama noto'g'ri";
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim() : "";
  if (title.length > MAX_TITLE) return `Sarlavha ${MAX_TITLE} belgidan oshmasin`;
  const headerLines = cleanLines(r.headerLines ?? [], MAX_HEADER_LINES);
  if (!headerLines) return `Yuqori qatorlar ${MAX_HEADER_LINES} tadan, har biri ${MAX_LINE} belgidan oshmasin`;
  const footerLines = cleanLines(r.footerLines ?? [], MAX_FOOTER_LINES);
  if (!footerLines) return `Pastki qatorlar ${MAX_FOOTER_LINES} tadan, har biri ${MAX_LINE} belgidan oshmasin`;

  const flag = (key: keyof ReceiptSettings) =>
    typeof r[key] === "boolean" ? (r[key] as boolean) : (DEFAULT_RECEIPT_SETTINGS[key] as boolean);
  return {
    showLogo: flag("showLogo"),
    title,
    headerLines,
    footerLines,
    showCustomerName: flag("showCustomerName"),
    showCustomerPhone: flag("showCustomerPhone"),
    showCustomerAddress: flag("showCustomerAddress"),
    showItemSize: flag("showItemSize"),
    showItemTariff: flag("showItemTariff"),
    showItemStatus: flag("showItemStatus"),
    showCashier: flag("showCashier"),
  };
}
