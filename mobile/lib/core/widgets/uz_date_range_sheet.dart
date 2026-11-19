import 'package:flutter/material.dart';

import '../../app/theme.dart';

/// O'zbekcha kalendar — kun, oraliq yoki butun oyni tanlash (pastdan
/// chiqadigan oyna). Hafta dushanbadan, oy va kun nomlari o'zbekcha,
/// kelajak kunlar yopiq.
///
/// Natija — [DateTimeRange] (bitta kunda start == end), bekor qilinsa null.
Future<DateTimeRange?> showUzDateRangeSheet(
  BuildContext context, {
  DateTimeRange? initial,
  DateTime? firstDate,
  int maxDays = 92,
}) {
  return showModalBottomSheet<DateTimeRange>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _UzDateRangeSheet(initial: initial, firstDate: firstDate, maxDays: maxDays),
  );
}

const kUzMonths = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const _weekdays = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

/// "3-noyabr" / "3–19-noyabr" / "28-oktabr – 3-noyabr" — sarlavhalar uchun.
String formatUzRange(DateTimeRange r) {
  String dm(DateTime d) => '${d.day}-${kUzMonths[d.month - 1].toLowerCase()}';
  final s = _day(r.start);
  final e = _day(r.end);
  if (s == e) return dm(e);
  if (s.year == e.year && s.month == e.month) return '${s.day}–${dm(e)}';
  return '${dm(s)} – ${dm(e)}';
}

/// Kalendar oyi oralig'i: 1-sanadan oy oxirigacha (joriy oyda — bugungacha).
DateTimeRange monthRangeOf(DateTime month, {DateTime? now}) {
  final today = _day(now ?? DateTime.now());
  final first = DateTime(month.year, month.month, 1);
  final last = DateTime(month.year, month.month + 1, 0);
  return DateTimeRange(start: first, end: last.isAfter(today) ? today : last);
}

class _UzDateRangeSheet extends StatefulWidget {
  final DateTimeRange? initial;
  final DateTime? firstDate;
  final int maxDays;
  const _UzDateRangeSheet({this.initial, this.firstDate, required this.maxDays});

  @override
  State<_UzDateRangeSheet> createState() => _UzDateRangeSheetState();
}

class _UzDateRangeSheetState extends State<_UzDateRangeSheet> {
  late final DateTime _today = _day(DateTime.now());
  late DateTime _month;
  DateTime? _start;
  DateTime? _end;

  @override
  void initState() {
    super.initState();
    final init = widget.initial;
    _start = init == null ? null : _day(init.start);
    _end = init == null ? null : _day(init.end);
    final focus = _end ?? _today;
    _month = DateTime(focus.year, focus.month);
  }

  bool get _canNext => DateTime(_month.year, _month.month + 1).isBefore(DateTime(_today.year, _today.month + 1));
  bool get _canPrev {
    final first = widget.firstDate;
    return first == null || DateTime(_month.year, _month.month - 1).isAfter(DateTime(first.year, first.month - 1));
  }

  void _tap(DateTime day) {
    setState(() {
      if (_start == null || _end != null) {
        _start = day;
        _end = null;
      } else if (day.isBefore(_start!)) {
        _end = _start;
        _start = day;
      } else {
        _end = day;
      }
    });
  }

  void _finish(DateTimeRange r) => Navigator.of(context).pop(r);

  DateTimeRange? get _selection {
    if (_start == null) return null;
    return DateTimeRange(start: _start!, end: _end ?? _start!);
  }

  String? get _error {
    final s = _selection;
    if (s == null) return null;
    final days = s.end.difference(s.start).inDays + 1;
    return days > widget.maxDays ? 'Oraliq ${widget.maxDays} kundan oshmasin' : null;
  }

  @override
  Widget build(BuildContext context) {
    final monday = _today.subtract(Duration(days: _today.weekday - 1));
    final presets = <(String, DateTimeRange)>[
      ('Bugun', DateTimeRange(start: _today, end: _today)),
      ('Kecha', DateTimeRange(start: _today.subtract(const Duration(days: 1)), end: _today.subtract(const Duration(days: 1)))),
      ('Shu hafta', DateTimeRange(start: monday, end: _today)),
      ('Shu oy', monthRangeOf(_today)),
      ("O'tgan oy", monthRangeOf(DateTime(_today.year, _today.month - 1))),
    ];
    final selection = _selection;

    return Container(
      decoration: const BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
              ),
              const SizedBox(height: 14),
              const Text('Davrni tanlang', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: AppColors.ink)),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final (label, range) in presets)
                    ActionChip(
                      label: Text(label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                      onPressed: () => _finish(range),
                      backgroundColor: AppColors.surface,
                      side: const BorderSide(color: AppColors.border),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      visualDensity: VisualDensity.compact,
                    ),
                ],
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.fromLTRB(8, 6, 8, 10),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        IconButton(
                          tooltip: 'Oldingi oy',
                          onPressed: _canPrev ? () => setState(() => _month = DateTime(_month.year, _month.month - 1)) : null,
                          icon: const Icon(Icons.chevron_left_rounded),
                        ),
                        Expanded(
                          child: Text(
                            '${kUzMonths[_month.month - 1]} ${_month.year}',
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.ink),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Keyingi oy',
                          onPressed: _canNext ? () => setState(() => _month = DateTime(_month.year, _month.month + 1)) : null,
                          icon: const Icon(Icons.chevron_right_rounded),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        for (final w in _weekdays)
                          Expanded(
                            child: Center(
                              child: Text(
                                w,
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  color: w == 'Ya' ? AppColors.danger : AppColors.grayDark,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    _MonthGrid(month: _month, today: _today, start: _start, end: _end, firstDate: widget.firstDate, onTap: _tap),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      selection == null
                          ? 'Boshlanish kunini bosing'
                          : _end == null
                              ? '${formatUzRange(selection)} — endi tugash kunini bosing'
                              : formatUzRange(selection),
                      style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                        color: _error != null ? AppColors.danger : AppColors.grayDark,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: () => _finish(monthRangeOf(_month, now: _today)),
                    child: const Text('Butun oy', style: TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ],
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700)),
                ),
              const SizedBox(height: 6),
              SizedBox(
                height: 50,
                child: FilledButton(
                  onPressed: selection == null || _error != null ? null : () => _finish(selection),
                  child: const Text('Tanlash', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MonthGrid extends StatelessWidget {
  final DateTime month;
  final DateTime today;
  final DateTime? start;
  final DateTime? end;
  final DateTime? firstDate;
  final ValueChanged<DateTime> onTap;

  const _MonthGrid({required this.month, required this.today, required this.start, required this.end, required this.firstDate, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final first = DateTime(month.year, month.month, 1);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final offset = first.weekday - 1;
    final cells = offset + daysInMonth;
    final rows = (cells / 7).ceil();
    final rangeEnd = end ?? start;

    return Column(
      children: [
        for (var r = 0; r < rows; r++)
          Row(
            children: [
              for (var c = 0; c < 7; c++)
                Expanded(
                  child: Builder(builder: (context) {
                    final index = r * 7 + c - offset;
                    if (index < 0 || index >= daysInMonth) return const SizedBox(height: 42);
                    final day = DateTime(month.year, month.month, index + 1);
                    final disabled = day.isAfter(today) || (firstDate != null && day.isBefore(_day(firstDate!)));
                    final isStart = start != null && day == start;
                    final isEnd = rangeEnd != null && day == rangeEnd;
                    final inRange = start != null && rangeEnd != null && !day.isBefore(start!) && !day.isAfter(rangeEnd);
                    final edge = isStart || isEnd;
                    return GestureDetector(
                      onTap: disabled ? null : () => onTap(day),
                      child: Container(
                        height: 42,
                        margin: const EdgeInsets.symmetric(vertical: 2),
                        decoration: BoxDecoration(
                          color: inRange && !edge ? AppColors.primary.withValues(alpha: 0.10) : Colors.transparent,
                          borderRadius: BorderRadius.horizontal(
                            left: Radius.circular(isStart || c == 0 ? 12 : 0),
                            right: Radius.circular(isEnd || c == 6 ? 12 : 0),
                          ),
                        ),
                        alignment: Alignment.center,
                        child: Container(
                          width: 38,
                          height: 38,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: edge ? AppColors.primary : null,
                            shape: BoxShape.circle,
                            border: day == today && !edge ? Border.all(color: AppColors.primary, width: 1.5) : null,
                          ),
                          child: Text(
                            '${day.day}',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: edge || day == today ? FontWeight.w900 : FontWeight.w600,
                              color: edge
                                  ? Colors.white
                                  : disabled
                                      ? AppColors.border
                                      : c == 6
                                          ? AppColors.danger
                                          : AppColors.ink,
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                ),
            ],
          ),
      ],
    );
  }
}
