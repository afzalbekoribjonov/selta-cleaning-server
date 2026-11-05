import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/services/auth_service.dart' show describeApiError, employeeClaimsProvider;
import '../../core/services/stats_repository.dart' show dateKeyOf;
import '../../core/services/supervisor_repository.dart';
import '../../core/utils/money_utils.dart';
import '../../core/widgets/employee_avatar.dart';
import '../../core/widgets/filter_pill.dart';
import '../../core/widgets/selta_loader.dart';
import 'staff_detail_screen.dart';
import 'supervisor_widgets.dart';

/// Xodimlar guruhi (filtr).
enum _Group { all, workers, drivers, others }

/// "Xodimlar" — har bir xodimning tanlangan kundagi ishi, davomati va
/// ko'rilmagan ogohlantirishlari. Bitta server so'rovi (`/supervisorStaff`),
/// natija qurilmada saqlanadi — internetsiz ham oxirgisi ko'rinadi.
class StaffTab extends ConsumerStatefulWidget {
  const StaffTab({super.key});

  @override
  ConsumerState<StaffTab> createState() => _StaffTabState();
}

class _StaffTabState extends ConsumerState<StaffTab> {
  DateTime _day = DateTime.now();
  _Group _group = _Group.all;
  String _search = '';

  bool _inGroup(StaffMember s, _Group g) => switch (g) {
        _Group.all => true,
        _Group.workers => s.isWorker,
        _Group.drivers => s.isDriver,
        _Group.others => !s.isWorker && !s.isDriver,
      };

  @override
  Widget build(BuildContext context) {
    final date = dateKeyOf(_day);
    final isToday = date == todayKey();
    final myId = ref.watch(employeeClaimsProvider).valueOrNull?.employeeId;
    final async = ref.watch(supervisorStaffProvider(date));
    final staff = (async.valueOrNull ?? const <StaffMember>[]).where((s) => s.id != myId).toList();

    final shown =
        staff.where((s) => _inGroup(s, _group)).where((s) => _search.isEmpty || s.fullName.toLowerCase().contains(_search)).toList()
          // Ishlaganlari tepada (eng ko'p ishlagani birinchi), keyin ism bo'yicha.
          ..sort((a, b) {
            final byWork = b.workTotal.compareTo(a.workTotal);
            return byWork != 0 ? byWork : a.fullName.toLowerCase().compareTo(b.fullName.toLowerCase());
          });

    final arrived = staff.where((s) => s.attendanceStatus != null).length;
    final late = staff.where((s) => s.attendanceStatus == 'late').length;
    final working = staff.where((s) => s.workTotal > 0).length;

    return RefreshIndicator(
      onRefresh: () => ref.refresh(supervisorStaffProvider(date).future),
      child: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            sliver: SliverList.list(
              children: [
                DayNavigator(day: _day, onChanged: (d) => setState(() => _day = d)),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(child: _Stat(value: '$arrived/${staff.length}', label: 'Ishga keldi', color: AppColors.success)),
                    const SizedBox(width: 8),
                    Expanded(
                        child: _Stat(value: '$late', label: 'Kechikdi', color: late > 0 ? const Color(0xFFDD6B20) : AppColors.grayDark)),
                    const SizedBox(width: 8),
                    Expanded(child: _Stat(value: '$working', label: 'Ish qayd etdi', color: AppColors.primary)),
                  ],
                ),
              ],
            ),
          ),
          SliverToBoxAdapter(
            child: FilterPillBar(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              children: [
                for (final g in _Group.values)
                  FilterPill(
                    label: switch (g) {
                      _Group.all => 'Hammasi',
                      _Group.workers => 'Ishchilar',
                      _Group.drivers => 'Dastavchiklar',
                      _Group.others => 'Boshqalar',
                    },
                    count: staff.where((s) => _inGroup(s, g)).length,
                    selected: _group == g,
                    onTap: () => setState(() => _group = g),
                  ),
              ],
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 8),
            sliver: SliverToBoxAdapter(
              child: TextField(
                onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
                decoration: const InputDecoration(
                  hintText: 'Xodim ismi',
                  prefixIcon: Icon(Icons.search_rounded, size: 20),
                  isDense: true,
                ),
              ),
            ),
          ),
          if (async.isLoading && staff.isEmpty)
            const SliverFillRemaining(hasScrollBody: false, child: Center(child: SeltaLoader(size: 36)))
          else if (async.hasError && staff.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(describeApiError(async.error!),
                        textAlign: TextAlign.center, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 10),
                    OutlinedButton(onPressed: () => ref.invalidate(supervisorStaffProvider(date)), child: const Text('Qayta urinish')),
                  ],
                ),
              ),
            )
          else if (shown.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: Text('Xodim topilmadi', style: TextStyle(color: AppColors.grayDark, fontWeight: FontWeight.w600))),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 2, 16, 24),
              sliver: SliverList.separated(
                itemCount: shown.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) => _StaffCard(
                  member: shown[i],
                  showAttendance: true,
                  isToday: isToday,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(builder: (_) => StaffDetailScreen(member: shown[i], initialDay: _day)),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String value;
  final String label;
  final Color color;
  const _Stat({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: color, height: 1.1)),
          ),
          const SizedBox(height: 2),
          Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11.5, color: AppColors.grayDark, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

/// Xodimning shu kundagi ishi — bo'limiga mos ko'rsatkichlar.
List<InfoChip> workChipsOf(StaffMember s) {
  final chips = <InfoChip>[
    if (s.isWorker || s.washed > 0) InfoChip(text: 'Yuvdi ${s.washed}', color: AppColors.info, icon: Icons.water_drop_rounded),
    if (s.isWorker || s.packed > 0) InfoChip(text: 'Qadoqladi ${s.packed}', color: AppColors.warning, icon: Icons.inventory_2_rounded),
    if (s.isDriver || s.pickedUp > 0)
      InfoChip(text: 'Olib keldi ${s.pickedUp}', color: AppColors.primary, icon: Icons.local_shipping_rounded),
    if (s.isDriver || s.delivered > 0)
      InfoChip(text: 'Yetkazdi ${s.delivered}', color: AppColors.success, icon: Icons.check_circle_rounded),
    if (s.deliveredTotal > 0) InfoChip(text: formatMoneyShortUz(s.deliveredTotal), color: AppColors.success, icon: Icons.payments_rounded),
    if (s.department == 'dispatcher' || s.created > 0)
      InfoChip(text: 'Buyurtma ${s.created}', color: AppColors.secondary, icon: Icons.note_add_rounded),
  ];
  return chips;
}

/// Davomat yorlig'i (belgilanmagan bo'lsa null).
InfoChip? attendanceChipOf(StaffMember s) {
  final time = s.attendanceTime ?? '';
  return switch (s.attendanceStatus) {
    'late' => InfoChip(text: time.isEmpty ? 'Kechikdi' : 'Kechikdi $time', color: const Color(0xFFDD6B20), icon: Icons.schedule_rounded),
    null => null,
    _ => InfoChip(text: time.isEmpty ? 'Ishda' : 'Keldi $time', color: AppColors.success, icon: Icons.login_rounded),
  };
}

class _StaffCard extends StatelessWidget {
  final StaffMember member;
  final bool showAttendance;
  final bool isToday;
  final VoidCallback onTap;

  const _StaffCard({required this.member, required this.showAttendance, required this.isToday, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final chips = workChipsOf(member);
    final attendance = attendanceChipOf(member);
    final nothing = member.workTotal == 0;

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 12, 8, 12),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), border: Border.all(color: AppColors.border)),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              EmployeeAvatar(name: member.fullName, size: 44),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            member.fullName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.ink),
                          ),
                        ),
                        if (member.pendingWarnings > 0) ...[
                          const SizedBox(width: 6),
                          Tooltip(
                            message: "Ko'rilmagan ogohlantirish",
                            child: InfoChip(text: '${member.pendingWarnings}', color: AppColors.danger, icon: Icons.warning_amber_rounded),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      member.departmentLabel.isEmpty ? member.department : member.departmentLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, color: AppColors.grayDark, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        if (showAttendance && attendance != null) attendance,
                        if (showAttendance && attendance == null && isToday)
                          const InfoChip(text: 'Davomat yo\'q', color: AppColors.gray, icon: Icons.schedule_rounded),
                        if (nothing && chips.isEmpty) const InfoChip(text: 'Ish qayd etilmagan', color: AppColors.gray) else ...chips,
                      ],
                    ),
                  ],
                ),
              ),
              const Padding(
                padding: EdgeInsets.only(top: 10),
                child: Icon(Icons.chevron_right_rounded, color: AppColors.gray),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
