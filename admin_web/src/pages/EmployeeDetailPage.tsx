import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeft, Phone, Wallet, KeyRound, UserX, TrendingUp, CalendarCheck, History, Sparkles } from 'lucide-react'
import { apiPost } from '@/lib/api'
import { DEPARTMENTS } from '@/lib/departments'
import { SALARY_METHODS } from '@/lib/salary-methods'
import { type Employee } from '@/lib/employees'
import { useEmployeeOrders } from '@/hooks/useEmployeeOrders'
import { usePayrollHistory } from '@/hooks/usePayrollHistory'
import { Spinner } from '@/components/ui/Spinner'
import { SalaryConfigDialog } from '@/components/employees/SalaryConfigDialog'
import { PinResetDialog } from '@/components/employees/PinResetDialog'
import { TerminateDialog } from '@/components/employees/TerminateDialog'

const MONTH_LABELS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [salaryOpen, setSalaryOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [terminateOpen, setTerminateOpen] = useState(false)

  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiPost<{ employees: Employee[] }>('/adminListEmployees'),
  })
  const employee = employeesQuery.data?.employees.find((e) => e.id === id)

  const { orders, loading: ordersLoading } = useEmployeeOrders(id ?? '', employee?.department ?? '')
  const { runs: payrollRuns, loading: payrollLoading } = usePayrollHistory(id ?? '')

  const monthly = useMemo(() => {
    const now = new Date()
    const months: { key: string; label: string; start: Date; end: Date }[] = []
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      months.push({ key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`, label: MONTH_LABELS[start.getMonth()], start, end })
    }
    const list = orders ?? []
    const counts = months.map(({ key, label, start, end }) => ({
      month: key,
      label,
      count: list.filter((o) => o.createdAt >= start && o.createdAt < end).length,
      revenue: list.filter((o) => o.createdAt >= start && o.createdAt < end).reduce((s, o) => s + o.totalPrice, 0),
    }))
    const last3Avg = counts.slice(-3).reduce((s, m) => s + m.count, 0) / 3
    return { counts, projectedNext: Math.round(last3Avg) }
  }, [orders])

  const activityThisMonth = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const daysSoFar = now.getDate()
    const activeDaySet = new Set<number>()
    for (const o of orders ?? []) {
      if (o.createdAt >= monthStart) activeDaySet.add(o.createdAt.getDate())
    }
    return { activeDays: activeDaySet.size, totalDays: daysSoFar, inactiveDays: Math.max(daysSoFar - activeDaySet.size, 0) }
  }, [orders])

  if (employeesQuery.isLoading) {
    return <Spinner className="p-16" />
  }
  if (!employee) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="font-semibold text-ink">Xodim topilmadi</p>
        <button onClick={() => navigate('/employees')} className="mt-4 text-sm font-bold text-brand-primary">
          Xodimlar ro'yxatiga qaytish
        </button>
      </div>
    )
  }

  const dept = DEPARTMENTS[employee.department]
  const terminated = employee.status !== 'active'
  const radialData = [{ name: 'active', value: activityThisMonth.activeDays, fill: 'var(--color-brand-primary)' }]
  const radialMax = Math.max(activityThisMonth.totalDays, 1)

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/employees')} className="flex items-center gap-1.5 text-sm font-semibold text-gray-dark hover:text-ink">
        <ArrowLeft size={16} />
        Xodimlar ro'yxati
      </button>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
              {dept && <dept.icon size={26} />}
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-ink">{employee.fullName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary/10 px-2.5 py-1 text-xs font-bold text-brand-primary">
                  {dept?.label ?? employee.department}
                </span>
                <span className={`text-xs font-bold ${terminated ? 'text-danger' : 'text-success'}`}>
                  {terminated ? "Ishdan bo'shatilgan" : 'Faol'}
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-dark">
                  <Phone size={12} />
                  {employee.phone}
                </span>
              </div>
            </div>
          </div>
          {!terminated && (
            <div className="flex gap-1.5">
              <ActionButton title="Maosh sozlash" onClick={() => setSalaryOpen(true)}>
                <Wallet size={16} />
              </ActionButton>
              <ActionButton title="PIN o'zgartirish" onClick={() => setPinOpen(true)}>
                <KeyRound size={16} />
              </ActionButton>
              <ActionButton title="Ishdan bo'shatish" danger onClick={() => setTerminateOpen(true)}>
                <UserX size={16} />
              </ActionButton>
            </div>
          )}
        </div>
        <div className="mt-4 border-t border-border pt-4 text-sm text-ink">
          Maosh usuli:{' '}
          <span className="font-bold">
            {employee.salary?.method ? SALARY_METHODS[employee.salary.method]?.label ?? employee.salary.method : 'Belgilanmagan'}
          </span>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm xl:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-brand-primary" />
              <h2 className="font-heading font-bold text-ink">Oylik faollik</h2>
            </div>
            {!ordersLoading && (
              <span className="flex items-center gap-1.5 rounded-full bg-brand-accent/15 px-2.5 py-1 text-xs font-bold text-ink">
                <Sparkles size={12} className="text-brand-accent" />
                Keyingi oy taxmini: {monthly.projectedNext} ta
              </span>
            )}
          </div>
          <p className="mb-4 text-xs text-gray-dark">Oxirgi 6 oyda qatnashgan buyurtmalar soni (bo'limga mos)</p>

          {ordersLoading ? (
            <Spinner className="py-16" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthly.counts} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="employeeActivityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-brand-primary)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-brand-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-gray-dark)', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--color-gray-dark)', fontSize: 11 }} width={28} allowDecimals={false} />
                <Tooltip
                  cursor={{ stroke: 'var(--color-brand-primary)', strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0].payload as { label: string; count: number; revenue: number }
                    return (
                      <div className="rounded-xl border border-border bg-surface px-3.5 py-2.5 shadow-lg">
                        <div className="text-xs font-bold text-ink">{row.label}</div>
                        <div className="mt-0.5 text-sm font-extrabold text-brand-primary">{row.count} ta buyurtma</div>
                        <div className="text-[11px] text-gray-dark">{formatMoney(row.revenue)}</div>
                      </div>
                    )
                  }}
                />
                <Area type="monotone" dataKey="count" stroke="var(--color-brand-primary)" strokeWidth={2.5} fill="url(#employeeActivityFill)" isAnimationActive />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <CalendarCheck size={18} className="text-brand-primary" />
            <h2 className="font-heading font-bold text-ink">Shu oy faolligi</h2>
          </div>
          <p className="mb-2 text-xs text-gray-dark">Kamida bitta buyurtma bilan bog'liq bo'lgan kunlar</p>

          {ordersLoading ? (
            <Spinner className="py-16" />
          ) : (
            <div className="relative">
              <ResponsiveContainer width="100%" height={180}>
                <RadialBarChart
                  width={180}
                  height={180}
                  innerRadius="72%"
                  outerRadius="100%"
                  data={radialData}
                  startAngle={90}
                  endAngle={-270}
                  barSize={14}
                >
                  <RadialBar background={{ fill: 'var(--color-bg)' }} dataKey="value" cornerRadius={8} max={radialMax} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-extrabold text-ink">{activityThisMonth.activeDays}</span>
                <span className="text-[11px] text-gray-dark">/ {activityThisMonth.totalDays} kun</span>
              </div>
            </div>
          )}
          <p className="mt-2 text-center text-xs text-gray-dark">
            Faoliyat qayd etilmagan kunlar: <span className="font-bold text-ink">{activityThisMonth.inactiveDays}</span>
          </p>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <History size={18} className="text-brand-primary" />
          <h2 className="font-heading font-bold text-ink">Maosh tarixi</h2>
        </div>
        <p className="mb-4 text-xs text-gray-dark">"Maosh va statistika" sahifasida hisoblangan oylar</p>

        {payrollLoading ? (
          <Spinner className="py-8" />
        ) : !payrollRuns || payrollRuns.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-dark">Hali hisoblangan oy yo'q</p>
        ) : (
          <div className="space-y-2">
            {(() => {
              const maxAmount = Math.max(...payrollRuns.map((r) => r.amount), 1)
              return payrollRuns
                .slice()
                .reverse()
                .map((run) => (
                  <div key={run.yearMonth} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-xs font-semibold text-gray-dark">{run.yearMonth}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg">
                      <div
                        className="h-full rounded-full bg-brand-primary"
                        style={{ width: `${Math.max((run.amount / maxAmount) * 100, 4)}%` }}
                      />
                    </div>
                    <span className="w-32 shrink-0 text-right text-xs font-bold text-ink">{formatMoney(run.amount)}</span>
                  </div>
                ))
            })()}
          </div>
        )}
      </section>

      {salaryOpen && (
        <SalaryConfigDialog
          employeeId={employee.id}
          employeeName={employee.fullName}
          currentMethod={employee.salary?.method}
          currentParams={employee.salary?.params}
          onClose={() => setSalaryOpen(false)}
        />
      )}
      {pinOpen && <PinResetDialog employeeId={employee.id} employeeName={employee.fullName} onClose={() => setPinOpen(false)} />}
      {terminateOpen && (
        <TerminateDialog
          employee={employee}
          onClose={() => {
            setTerminateOpen(false)
            navigate('/employees')
          }}
        />
      )}
    </div>
  )
}

function ActionButton({
  children,
  title,
  danger,
  onClick,
}: {
  children: React.ReactNode
  title: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded-xl p-2.5 transition-colors ${danger ? 'text-gray-dark hover:bg-danger-bg hover:text-danger' : 'text-gray-dark hover:bg-brand-primary/10 hover:text-brand-primary'}`}
    >
      {children}
    </button>
  )
}
