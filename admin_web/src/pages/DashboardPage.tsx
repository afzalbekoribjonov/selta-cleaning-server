import { ClipboardList, Clock, TrendingUp, AlertTriangle } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { StatusBadge, TariffBadge } from '@/components/ui/StatusBadge'

// Faza 0 — vaqtinchalik namunaviy ma'lumot (Firestore ulanmagan).
// Faza 5'da real `orders` kolleksiyasidan sahifalangan so'rov bilan
// almashtiriladi (talab #9: hech qachon barcha buyurtmalar birdaniga
// yuklanmasligi kerak).
const MOCK_ACTIVE_ORDERS = [
  { id: 1, customer: 'Aziz Karimov', status: 'washing', tariff: 'express', overdue: false, due: '18-avgust' },
  { id: 2, customer: 'Malika Yusupova', status: 'qc_review', tariff: 'premium', overdue: false, due: '19-avgust' },
  { id: 3, customer: 'Botir Rashidov', status: 'brought_in', tariff: 'standart', overdue: true, due: '14-avgust' },
  { id: 4, customer: 'Nodira Aliyeva', status: 'in_progress', tariff: 'comfort', overdue: false, due: '21-avgust' },
]

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Boshqaruv paneli</h1>
        <p className="text-sm text-gray-dark mt-1">Bugungi holat va faol buyurtmalar</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="Faol buyurtmalar" value="—" tone="primary" />
        <StatCard icon={Clock} label="Bugungi buyurtmalar" value="—" tone="primary" />
        <StatCard icon={TrendingUp} label="Bugungi tushum" value="—" tone="success" />
        <StatCard icon={AlertTriangle} label="Kechikkan buyurtmalar" value="—" tone="danger" />
      </div>

      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-heading font-bold text-ink">Faol buyurtmalar</h2>
          <span className="text-xs text-gray-dark">Namunaviy ma'lumot — Faza 5'da ulanadi</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-dark border-b border-border">
                <th className="px-5 py-3 font-semibold">№</th>
                <th className="px-5 py-3 font-semibold">Mijoz</th>
                <th className="px-5 py-3 font-semibold">Holat</th>
                <th className="px-5 py-3 font-semibold">Tarif</th>
                <th className="px-5 py-3 font-semibold">Muddat</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_ACTIVE_ORDERS.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 font-semibold text-ink">#{o.id}</td>
                  <td className="px-5 py-3 text-ink">{o.customer}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-5 py-3">
                    <TariffBadge tariff={o.tariff} />
                  </td>
                  <td className={`px-5 py-3 font-semibold ${o.overdue ? 'text-danger' : 'text-ink'}`}>
                    {o.due}
                    {o.overdue && ' · kechikmoqda'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
