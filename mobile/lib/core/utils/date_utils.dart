const List<String> _uzMonths = [
  '', 'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

/// `intl`ning "uz" lokal ma'lumotini ishga tushirishga qaram bo'lmaslik
/// uchun qo'lda formatlanadi (locale-init runtime xatosi xavfini oldini
/// olish uchun ataylab shunday).
String formatDateUz(DateTime date) => '${date.day}-${_uzMonths[date.month]}';

String formatDateTimeUz(DateTime date) {
  final h = date.hour.toString().padLeft(2, '0');
  final m = date.minute.toString().padLeft(2, '0');
  return '${formatDateUz(date)}, $h:$m';
}

/// Bosh harf bilan, 1-indeksli — banner/bo'lim sarlavhalari uchun
/// (admin_web'dagi UZ_MONTHS_FULL bilan bir xil naqsh).
const List<String> uzMonthsCapitalized = [
  '', 'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

String formatMonthYearUz(DateTime date) => '${uzMonthsCapitalized[date.month]} ${date.year}';

/// Muddatgacha necha kun qolganini o'zbekcha matnga aylantiradi — jamoa
/// buyurtma kartalarida "necha kun qoldi" ko'rsatish uchun.
String formatDaysLeftUz(DateTime dueDate) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final due = DateTime(dueDate.year, dueDate.month, dueDate.day);
  final diff = due.difference(today).inDays;
  if (diff < 0) return '${-diff} kun kechikdi';
  if (diff == 0) return 'Bugun oxirgi kun';
  if (diff == 1) return 'Ertaga muddati tugaydi';
  return '$diff kun qoldi';
}
