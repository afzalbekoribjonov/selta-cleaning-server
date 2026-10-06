import { Printer, PrinterCheck, Settings2, Smartphone } from 'lucide-react'
import { useAppPrinter } from '@/lib/app-printer'

/**
 * Chek printeri — admin ilovasida ochilgan panelda printerni ko'rish,
 * o'zgartirish va sinov cheki. Printer telefonning Bluetooth'iga ulanadi,
 * shuning uchun tanlov shu telefonga tegishli (xodimlar telefonida
 * o'zlarining printeri).
 */
export function AppPrinterCard() {
  const { inApp, status, result, busy, openSettings, testPrint } = useAppPrinter()

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <Printer size={18} className="shrink-0 text-brand-primary" />
        <h2 className="font-heading font-bold text-ink">Chek printeri</h2>
      </div>

      {!inApp ? (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-bg p-3 text-sm text-gray-dark">
          <Smartphone size={18} className="mt-0.5 shrink-0" />
          <p>
            Bluetooth printer admin <b>ilovasi</b> orqali ulanadi: ilovada admin panelni oching — shu yerda printerni tanlash va
            sinov cheki chiqarish tugmalari paydo bo'ladi. Kompyuterda chek brauzerning chop etish oynasi orqali chiqadi.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
            {status?.selected ? (
              <PrinterCheck size={22} className="shrink-0 text-brand-primary" />
            ) : (
              <Printer size={22} className="shrink-0 text-gray" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-ink">
                {status === null ? 'Tekshirilmoqda…' : status.selected ? status.name : 'Printer tanlanmagan'}
              </p>
              {status && (
                <p className="text-xs text-gray-dark">
                  Qog'oz: {status.paperMm} mm · oxirida {status.feedLines} qator bo'sh joy
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={openSettings}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white shadow-sm"
            >
              <Settings2 size={16} />
              {status?.selected ? "Printerni o'zgartirish" : 'Printerni tanlash'}
            </button>
            <button
              onClick={testPrint}
              disabled={busy}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-bold text-ink hover:bg-bg disabled:opacity-50"
            >
              <Printer size={16} />
              {busy ? 'Yuborilmoqda…' : 'Sinov cheki'}
            </button>
          </div>

          {result && (
            <p className={`mt-2 text-sm font-semibold ${result.ok ? 'text-success' : 'text-danger'}`}>{result.message}</p>
          )}
          <p className="mt-2 text-xs text-gray-dark">
            Printer shu telefonga tegishli. Chek har safar ulanib chiqariladi va ulanish yopiladi — printer boshqa telefonlar uchun
            ham bo'sh qoladi.
          </p>
        </>
      )}
    </section>
  )
}
