import {
  BadgePercent,
  BarChart3,
  Eye,
  FileSpreadsheet,
  HandCoins,
  ImageMinus,
  ImagePlus,
  Images,
  Plus,
  Printer,
  Receipt,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { apiPost } from '@/lib/api'
import { type Employee } from '@/lib/employees'

/**
 * Xodim vakolatlari — bitta ro'yxat (PermissionsDialog shu yerdan quradi).
 * Har birini server alohida route orqali saqlaydi va har bir amalda qayta
 * tekshiradi; bu yerdagi holat faqat boshqaruv uchun.
 */
export type PermissionKey =
  | 'canCreateOrders'
  | 'canDoOnsiteWashing'
  | 'canTakePrepayment'
  | 'canSeeWorkshopQueue'
  | 'canViewStats'
  | 'canViewFinance'
  | 'canAddExpenses'
  | 'canPrintDailyReport'
  | 'canAccessWarehouse'
  | 'canPrintReceipts'
  | 'canViewPhotos'
  | 'canUploadPhotos'
  | 'canDeletePhotos'

export const PERMISSION_GROUPS = ['Buyurtmalar', "Ko'rsatkichlar va pul", 'Ombor va chek', 'Rasmlar'] as const

export interface PermissionDef {
  key: PermissionKey
  group: (typeof PERMISSION_GROUPS)[number]
  icon: LucideIcon
  title: string
  /** Kartadagi qisqa nom (profil sahifasidagi xulosa). */
  short: string
  description: string
  /** Yoqilgandan / o'chirilgandan keyin nima o'zgargani. */
  onText: string
  offText: string
  appliesTo?: (e: Employee) => boolean
  save: (employeeId: string, value: boolean) => Promise<unknown>
}

/** routes/employeeAdmin.ts: TOGGLE_PERMISSIONS — umumiy route. */
const generic = (permission: PermissionKey) => (employeeId: string, value: boolean) =>
  apiPost('/adminSetEmployeePermission', { employeeId, permission, value })

const own = (path: string, field: PermissionKey) => (employeeId: string, value: boolean) =>
  apiPost(path, { employeeId, [field]: value })

export const PERMISSIONS: PermissionDef[] = [
  {
    key: 'canCreateOrders',
    group: 'Buyurtmalar',
    icon: Plus,
    title: 'Buyurtma yaratish',
    short: 'Buyurtma yaratish',
    description: "Mijoz o'zi kelganda buyurtma ochish — ilovada \"+\" tugmasi",
    onText: "Buyurtma ocha oladi — ilovada \"+\" tugmasi paydo bo'ladi.",
    offText: 'Endi buyurtma ocha olmaydi.',
    appliesTo: (e) => e.department !== 'dispatcher',
    save: own('/adminSetEmployeeOrderPermission', 'canCreateOrders'),
  },
  {
    key: 'canDoOnsiteWashing',
    group: 'Buyurtmalar',
    icon: Users,
    title: 'Joyida yuvish jamoasi',
    short: 'Joyida yuvish',
    description: 'Sotuv menejeri uni joyida yuvish jamoasiga biriktira oladi',
    onText: 'Joyida yuvish jamoasiga biriktirilishi mumkin.',
    offText: 'Endi joyida yuvish jamoasiga tanlanmaydi.',
    appliesTo: (e) => e.department === 'worker' || e.department === 'delivery',
    save: own('/adminSetEmployeeOnsitePermission', 'canDoOnsiteWashing'),
  },
  {
    key: 'canSeeWorkshopQueue',
    group: 'Buyurtmalar',
    icon: Eye,
    title: 'Sex navbatini ko\'rish',
    short: 'Sex navbati',
    description: "Sexga keladigan buyurtmalar navbati; o'chirilsa — faqat o'ziga biriktirilgan joyida yuvish ishlari",
    onText: "Sexga keladigan buyurtmalar navbatini ko'radi.",
    offText: "Navbat yashirildi — faqat o'ziga biriktirilgan ishlarni ko'radi.",
    appliesTo: (e) => e.department === 'worker',
    save: own('/adminSetEmployeeWorkshopVisibility', 'canSeeWorkshopQueue'),
  },
  {
    key: 'canTakePrepayment',
    group: 'Buyurtmalar',
    icon: HandCoins,
    title: "Oldindan to'lov olish",
    short: "Oldindan to'lov",
    description: "Topshirishdan oldin mijozdan qisman yoki to'liq to'lov qabul qilish",
    onText: "Oldindan to'lov qabul qila oladi — summa o'sha kuni uning kassasiga tushadi.",
    offText: "Endi oldindan to'lov qabul qila olmaydi. Avvalgilari saqlanadi.",
    save: generic('canTakePrepayment'),
  },
  {
    key: 'canViewStats',
    group: "Ko'rsatkichlar va pul",
    icon: BarChart3,
    title: "Kunlik ko'rsatkichlar",
    short: "Ko'rsatkichlar",
    description: "Bugungi sex, yuvish, yetkazish ko'rsatkichlari va yig'ilishi kerak bo'lgan summa",
    onText: "Ilovada kunlik ko'rsatkichlarni ko'radi.",
    offText: "Endi kunlik ko'rsatkichlarni ko'rmaydi.",
    save: own('/adminSetEmployeeStatsPermission', 'canViewStats'),
  },
  {
    key: 'canViewFinance',
    group: "Ko'rsatkichlar va pul",
    icon: BadgePercent,
    title: "Qarz va chegirmalar",
    short: 'Qarz va chegirma',
    description: "Qarzdorlar, qisman to'lovlar va berilgan chegirmalar ro'yxati",
    onText: "Qarzdorlar va chegirmalar ro'yxatini ko'ra oladi.",
    offText: "Endi bu ma'lumotni ko'ra olmaydi.",
    save: own('/adminSetEmployeeFinancePermission', 'canViewFinance'),
  },
  {
    key: 'canAddExpenses',
    group: "Ko'rsatkichlar va pul",
    icon: Receipt,
    title: "Chiqim qo'shish",
    short: 'Chiqimlar',
    description: "Yoqilg'i, texnik xizmat kabi chiqimlarni ilovadan kiritish",
    onText: "Chiqim kirita oladi — \"qo'limdagi naqddan\"si o'sha kungi naqddan ayiriladi.",
    offText: 'Endi chiqim kirita olmaydi. Avvalgilari saqlanadi.',
    save: generic('canAddExpenses'),
  },
  {
    key: 'canPrintDailyReport',
    group: "Ko'rsatkichlar va pul",
    icon: FileSpreadsheet,
    title: 'Kunlik hisobot cheki',
    short: 'Hisobot cheki',
    description: "Barcha xodimlar ishi va qo'ldagi pullar bo'yicha kunlik chek",
    onText: "Kunlik hisobot chekini ko'rib, chop eta oladi.",
    offText: "Endi kunlik hisobot chekini ko'ra olmaydi.",
    save: generic('canPrintDailyReport'),
  },
  {
    key: 'canAccessWarehouse',
    group: 'Ombor va chek',
    icon: Warehouse,
    title: 'Omborxona',
    short: 'Omborxona',
    description: "Uzoq olib ketilmagan tayyor mahsulotlarni ko'rish va topshirish",
    onText: "Omborxonani ko'radi va ombordagi mahsulotlarni topshira oladi.",
    offText: "Endi Omborxonani ko'ra olmaydi.",
    save: own('/adminSetEmployeeWarehousePermission', 'canAccessWarehouse'),
  },
  {
    key: 'canPrintReceipts',
    group: 'Ombor va chek',
    icon: Printer,
    title: 'Chek chiqarish',
    short: 'Chek',
    description: 'Buyurtma chekini Bluetooth printerda chop etish',
    onText: 'Buyurtma chekini chop eta oladi.',
    offText: 'Endi chek chiqara olmaydi.',
    save: generic('canPrintReceipts'),
  },
  {
    key: 'canViewPhotos',
    group: 'Rasmlar',
    icon: Images,
    title: "Rasmlarni ko'rish",
    short: "Rasm ko'rish",
    description: 'Mahsulotlarning eski va tayyor holat rasmlari',
    onText: "Mahsulot rasmlarini ko'ra oladi.",
    offText: "Endi mahsulot rasmlarini ko'ra olmaydi.",
    save: generic('canViewPhotos'),
  },
  {
    key: 'canUploadPhotos',
    group: 'Rasmlar',
    icon: ImagePlus,
    title: "Rasm qo'shish",
    short: "Rasm qo'shish",
    description: "Kamera yoki galereyadan rasm (har holatga 2 tagacha)",
    onText: "Mahsulotlarga rasm qo'sha oladi.",
    offText: "Endi rasm qo'sha olmaydi.",
    save: generic('canUploadPhotos'),
  },
  {
    key: 'canDeletePhotos',
    group: 'Rasmlar',
    icon: ImageMinus,
    title: "Rasmni o'chirish",
    short: "Rasm o'chirish",
    description: "Saqlangan rasmlarni butunlay o'chirish",
    onText: "Saqlangan rasmlarni o'chira oladi.",
    offText: "Endi rasmlarni o'chira olmaydi.",
    save: generic('canDeletePhotos'),
  },
]

export const permissionsFor = (e: Employee): PermissionDef[] => PERMISSIONS.filter((p) => !p.appliesTo || p.appliesTo(e))
