import { useEffect, useState } from 'react'
import { apiPost } from '@/lib/api'
import { type Order } from '@/lib/orders'
import { businessDateKey } from '@/lib/business-time'
import { UZ_MONTHS_FULL } from '@/lib/date-utils'
import { OrderDetailDrawer } from '@/components/orders/OrderDetailDrawer'
import { DayOverview } from '@/components/dashboard/DayOverview'
import { PipelineOverview } from '@/components/dashboard/PipelineOverview'
import { TrendChart } from '@/components/dashboard/TrendChart'
import { MonthSummaryCard } from '@/components/dashboard/MonthSummaryCard'
import { AttentionList } from '@/components/dashboard/AttentionList'
import { EmployeeActivityChart } from '@/components/dashboard/EmployeeActivityChart'
import { OutstandingCard } from '@/components/dashboard/OutstandingCard'

const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']

function todayTitle(): string {
  const key = businessDateKey(new Date())
  const [y, m, d] = key.split('-').map(Number)
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d}-${(UZ_MONTHS_FULL[m - 1] ?? '').toLowerCase()} ${y}`
}

/**
 * Boshqaruv paneli — har bir raqam BIR marta va aniq ma'noda:
 *  1. Kunlik ko'rsatkichlar (sana tanlanadi): qabul → sex → yuvish →
 *     upakovka → yetkazish, birlik bo'yicha hajm va kassa.
 *  2. Hozirgi holat (jonli): faol buyurtmalar qaysi bosqichda.
 *  3. Kunlar kesimidagi grafik va "Bu oy" (haqiqiy tushgan pul).
 *  4. Diqqat talab qiladiganlar, xodimlar faolligi, yopilmagan to'lovlar.
 *
 * Avvalgi "Faol / Bugungi buyurtmalar / Bugungi tushum / Kechikkan"
 * bannerlari olib tashlandi: ular pastdagi bo'limlarni takrorlardi,
 * "Bugungi tushum" esa aslida olinmagan pulni (yangi buyurtmalar narxini)
 * ko'rsatardi.
 */
export default function DashboardPage() {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  // Bir martalik, xavfsiz (idempotent) migratsiyalar — server bajargach belgi
  // qo'yadi va keyingi ochilishlarda darhol qaytadi.
  useEffect(() => {
    apiPost('/adminBackfillOrderSummary', {}).catch(() => {})
    apiPost('/adminBackfillLastComment', {}).catch(() => {})
    apiPost('/adminBackfillPaymentSummary', {}).catch(() => {})
  }, [])

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold text-ink">Boshqaruv paneli</h1>
        <p className="mt-0.5 text-sm text-gray-dark">{todayTitle()}</p>
      </div>

      <DayOverview />
      <PipelineOverview />

      <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <TrendChart className="xl:col-span-2" />
        <MonthSummaryCard />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
        <AttentionList onOpen={setSelectedOrder} />
        <EmployeeActivityChart />
        <OutstandingCard className="md:col-span-2 xl:col-span-1" />
      </div>

      {selectedOrder && <OrderDetailDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  )
}
