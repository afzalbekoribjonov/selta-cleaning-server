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
