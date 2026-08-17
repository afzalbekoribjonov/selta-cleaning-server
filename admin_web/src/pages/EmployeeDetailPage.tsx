import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  ArrowLeft,
  Phone,
  Wallet,
  KeyRound,
  UserX,
  Pencil,
  Briefcase,
  TrendingUp,
  CalendarCheck,
  History,
  Sparkles,
  CalendarDays,
  ClipboardList,
  ReceiptText,
  ArrowRight,
} from 'lucide-react'
import { apiPost } from '@/lib/api'
import { SALARY_METHODS } from '@/lib/salary-methods'
import { type Employee, formatTenure } from '@/lib/employees'
import { formatDateUz, formatDateTimeUz, UZ_MONTHS_SHORT } from '@/lib/date-utils'
import { useEmployeeOrders } from '@/hooks/useEmployeeOrders'
import { usePayrollHistory } from '@/hooks/usePayrollHistory'
import { useDepartmentHistory } from '@/hooks/useDepartmentHistory'
import { useDepartmentLookup } from '@/hooks/useDepartmentLookup'
import { useEmployeesMap } from '@/hooks/useEmployeesMap'
import { Spinner } from '@/components/ui/Spinner'
import { StatCard } from '@/components/ui/StatCard'
import { StatusBadge, TariffBadge } from '@/components/ui/StatusBadge'
import { SalaryConfigDialog } from '@/components/employees/SalaryConfigDialog'
import { PinResetDialog } from '@/components/employees/PinResetDialog'
import { TerminateDialog } from '@/components/employees/TerminateDialog'
import { EditEmployeeDialog } from '@/components/employees/EditEmployeeDialog'
import { ChangeDepartmentDialog } from '@/components/employees/ChangeDepartmentDialog'

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [changeDeptOpen, setChangeDeptOpen] = useState(false)
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
  const { events: deptHistory, loading: deptHistoryLoading } = useDepartmentHistory(id ?? '')
  const { getDepartment } = useDepartmentLookup()
  const employeesMap = useEmployeesMap()

  const hiredAt = employee?.createdAt ? new Date(employee.createdAt) : null
  const referenceEnd = employee?.terminatedAt ? new Date(employee.terminatedAt) : new Date()

  const monthly = useMemo(() => {
    const now = new Date()
    const months: { key: string; label: string; start: Date; end: Date }[] = []
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      // Ishga qabul qilinishidan oldingi oylarni ko'rsatmaymiz — aks holda
      // "0 ta buyurtma" xuddi faolsizlikdek noto'g'ri taassurot qoldiradi.
      if (hiredAt && end <= hiredAt) continue
      months.push({ key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`, label: UZ_MONTHS_SHORT[start.getMonth()], start, end })
    }
    const list = orders ?? []
    const counts = months.map(({ key, label, start, end }) => ({
      month: key,
      label,
      count: list.filter((o) => o.createdAt >= start && o.createdAt < end).length,
      revenue: list.filter((o) => o.createdAt >= start && o.createdAt < end).reduce((s, o) => s + o.totalPrice, 0),
    }))
    const last3Avg = counts.slice(-3).reduce((s, m) => s + m.count, 0) / (Math.min(counts.length, 3) || 1)
    return { counts, projectedNext: Math.round(last3Avg) }
  }, [orders, hiredAt])

  const activityThisMonth = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    // Shu oyda ishga kirgan bo'lsa, kunlar sanog'i ishga kirgan kundan boshlanadi.
    const rangeStart = hiredAt && hiredAt > monthStart ? hiredAt : monthStart
    const daysSoFar = Math.max(Math.floor((now.getTime() - rangeStart.getTime()) / 86_400_000) + 1, 0)
    const activeDaySet = new Set<number>()
    for (const o of orders ?? []) {
      if (o.createdAt >= rangeStart) activeDaySet.add(o.createdAt.getDate())
    }
    return { activeDays: activeDaySet.size, totalDays: daysSoFar, inactiveDays: Math.max(daysSoFar - activeDaySet.size, 0) }
  }, [orders, hiredAt])

  const lastOrder = orders && orders.length > 0 ? orders[0] : null

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

  const dept = getDepartment(employee.department)
  const terminated = employee.status !== 'active'
  const radialData = [{ name: 'active', value: activityThisMonth.activeDays, fill: 'var(--color-brand-primary)' }]
  const radialMax = Math.max(activityThisMonth.totalDays, 1)
  const tenureLabel = hiredAt ? formatTenure(hiredAt, referenceEnd) : '—'

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/employees')} className="flex items-center gap-1.5 text-sm font-semibold text-gray-dark hover:text-ink">
        <ArrowLeft size={16} />
        Xodimlar ro'yxati
      </button>

      {/* Profil bannerini — Selta Cleaning brend gradienti bilan */}
      <section
        className="relative overflow-hidden rounded-3xl p-6 shadow-lg sm:p-8"
        style={{ background: 'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-primary-dark))' }}
      >
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/5" />
        <div className="absolute -bottom-16 right-24 h-56 w-56 rounded-full bg-white/5" />

        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 p-2.5 ring-1 ring-white/25 backdrop-blur-sm">
              <img src="/brand/icon_white.png" alt="Selta Cleaning" className="h-full w-full object-contain" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-extrabold text-white">{employee.fullName}</h1>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-white/85">
                {dept && <dept.icon size={15} />}
                {dept?.label ?? employee.department}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <HeaderActionButton title="Ma'lumotlarni tahrirlash" onClick={() => setEditOpen(true)}>
              <Pencil size={16} />
            </HeaderActionButton>
            {!terminated && (
              <>
                <HeaderActionButton title="Kasbni o'zgartirish" onClick={() => setChangeDeptOpen(true)}>
                  <Briefcase size={16} />
                </HeaderActionButton>
                <HeaderActionButton title="Maosh sozlash" onClick={() => setSalaryOpen(true)}>
                  <Wallet size={16} />
                </HeaderActionButton>
                <HeaderActionButton title="PIN o'zgartirish" onClick={() => setPinOpen(true)}>
                  <KeyRound size={16} />
                </HeaderActionButton>
                <HeaderActionButton title="Ishdan bo'shatish" danger onClick={() => setTerminateOpen(true)}>
                  <UserX size={16} />
                </HeaderActionButton>
              </>
            )}
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
              terminated ? 'bg-red-500/20 text-red-100' : 'bg-white/15 text-white'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${terminated ? 'bg-red-200' : 'bg-brand-accent'}`} />
            {terminated ? "Ishdan bo'shatilgan" : 'Faol xodim'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90">
            <Phone size={12} />
            {employee.phone}
          </span>
          {hiredAt && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90">
              <CalendarDays size={12} />
              {formatDateUz(hiredAt)}dan beri
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-accent px-3 py-1.5 text-xs font-extrabold text-ink">
            <Sparkles size={12} />
            Ish staji: {tenureLabel}
          </span>
          {employee.terminatedAt && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-100">
              Bo'shatilgan: {formatDateUz(new Date(employee.terminatedAt))}
            </span>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={CalendarDays} label="Ish staji" value={tenureLabel} tone="primary" />
        <StatCard icon={ClipboardList} label="Jami buyurtmalar" numericValue={orders?.length ?? 0} tone="primary" />
        <StatCard
          icon={CalendarCheck}
          label="Shu oy faol kunlar"
          numericValue={activityThisMonth.activeDays}
          format={(n) => `${n} kun`}
          tone="success"
        />
        <StatCard
          icon={Wallet}
          label="Maosh usuli"
          value={employee.salary?.method ? SALARY_METHODS[employee.salary.method]?.label ?? employee.salary.method : 'Belgilanmagan'}
          tone="warning"
        />
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <ReceiptText size={18} className="text-brand-primary" />
          <h2 className="font-heading font-bold text-ink">So'nggi buyurtma</h2>
        </div>
        <p className="mb-4 text-xs text-gray-dark">Xodim ishtirok etgan eng oxirgi buyurtma</p>

        {ordersLoading ? (
          <Spinner className="py-8" />
        ) : !lastOrder ? (
          <p className="py-6 text-center text-sm text-gray-dark">Hali buyurtma bilan bog'liq faoliyat yo'q</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-bg p-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-heading text-lg font-extrabold text-ink">#{lastOrder.orderNumber}</span>
                <span className="font-semibold text-ink">{lastOrder.customerName || "Noma'lum mijoz"}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={lastOrder.status} />
                <TariffBadge tariff={lastOrder.tariff} />
              </div>
            </div>
            <div className="text-right">
              <div className="font-heading text-lg font-extrabold text-brand-primary">{formatMoney(lastOrder.totalPrice)}</div>
              <div className="text-xs text-gray-dark">{formatDateTimeUz(lastOrder.createdAt)}</div>
            </div>
          </div>
        )}
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

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <Briefcase size={18} className="text-brand-primary" />
          <h2 className="font-heading font-bold text-ink">Kasb tarixi</h2>
        </div>
        <p className="mb-4 text-xs text-gray-dark">Xodimning bo'lim/kasb o'zgarishlari — vaqti va kimning tomonidan</p>

        {deptHistoryLoading ? (
          <Spinner className="py-8" />
        ) : deptHistory.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-dark">Hali kasbi o'zgartirilmagan</p>
        ) : (
          <div className="space-y-2">
            {deptHistory.map((event) => (
              <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bg p-3.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-gray-dark">{getDepartment(event.fromDepartment).label}</span>
                  <ArrowRight size={14} className="text-brand-primary" />
                  <span className="font-bold text-ink">{getDepartment(event.toDepartment).label}</span>
                </div>
                <div className="text-right text-xs text-gray-dark">
                  <div>{formatDateTimeUz(event.changedAt)}</div>
                  <div>{employeesMap[event.changedBy] ?? 'Admin'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {editOpen && <EditEmployeeDialog employee={employee} onClose={() => setEditOpen(false)} />}
      {changeDeptOpen && <ChangeDepartmentDialog employee={employee} onClose={() => setChangeDeptOpen(false)} />}
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

function HeaderActionButton({
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
      className={`rounded-xl bg-white/15 p-2.5 text-white backdrop-blur-sm transition-colors hover:bg-white/25 ${danger ? 'hover:bg-red-500/40' : ''}`}
    >
      {children}
    </button>
  )
}
