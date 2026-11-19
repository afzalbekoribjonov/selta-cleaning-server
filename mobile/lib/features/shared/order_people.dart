import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models/order.dart';
import '../../core/services/staff_directory.dart';
import '../../core/utils/date_utils.dart';
import '../../core/widgets/employee_avatar.dart';

/// Buyurtmaga kim mas'ul — barcha ichki kartalarda bir xil (talab: buyurtma
/// tarixida sotuv menejeri, olib kelgan dastavchik va joyida yuvish jamoasi
/// ko'rinib tursin).
///
///   Sotuv menejeri — Madina Sobirova · 3-noyabr, 14:20
///   Olib keldi     — Akmal Qodirov · 3-noyabr, 16:05
///   Jamoa          — Bobur (Ishchi · Gilam), Akmal (Dastavchik)
class OrderPeopleRows extends ConsumerWidget {
  final Order order;
  const OrderPeopleRows({super.key, required this.order});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staff = ref.watch(staffDirectoryProvider).valueOrNull;
    final creator = staff.nameOf(order.createdBy) ?? (order.createdBy.isEmpty ? null : 'Admin');
    final broughtBy = order.pickedUpByName ?? staff.nameOf(order.pickedUpBy);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _PersonRow(
          icon: Icons.support_agent_rounded,
          label: 'Sotuv menejeri',
          name: creator ?? '—',
          detail: formatDateTimeUz(order.createdAt),
        ),
        if (order.serviceType == 'pickup' && order.intakeMethod == 'walk_in')
          _PersonRow(
            icon: Icons.storefront_rounded,
            label: 'Qabul',
            name: "Mijoz o'zi olib keldi",
            detail: order.pickedUpAt != null ? formatDateTimeUz(order.pickedUpAt!) : null,
          )
        else if (order.serviceType == 'pickup' && (broughtBy != null || order.pickedUpAt != null))
          _PersonRow(
            icon: Icons.local_shipping_rounded,
            label: 'Olib keldi',
            name: broughtBy ?? '—',
            detail: order.pickedUpAt != null ? formatDateTimeUz(order.pickedUpAt!) : null,
          ),
        if (order.serviceType == 'onsite' && order.assignedTeam.isNotEmpty) ...[
          const SizedBox(height: 4),
          const Text('Jamoa', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.grayDark)),
          const SizedBox(height: 6),
          TeamMembersList(memberIds: order.assignedTeam),
        ],
      ],
    );
  }
}

class _PersonRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String name;
  final String? detail;

  const _PersonRow({required this.icon, required this.label, required this.name, this.detail});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: AppColors.grayDark),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(
              TextSpan(children: [
                TextSpan(text: '$label: ', style: const TextStyle(color: AppColors.grayDark)),
                TextSpan(text: name, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.ink)),
                if (detail != null) TextSpan(text: '  ·  $detail', style: const TextStyle(color: AppColors.gray, fontSize: 12.5)),
              ]),
              style: const TextStyle(fontSize: 13.5, height: 1.35),
            ),
          ),
        ],
      ),
    );
  }
}

/// Joyida yuvish jamoasi — har bir a'zo avatari, ismi va kasbi bilan
/// (talab: a'zolar hech qayerda ko'rinmasdi).
class TeamMembersList extends ConsumerWidget {
  final List<String> memberIds;
  const TeamMembersList({super.key, required this.memberIds});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staff = ref.watch(staffDirectoryProvider).valueOrNull;
    return Column(
      children: [
        for (final id in memberIds)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              children: [
                EmployeeAvatar(name: staff?[id]?.fullName ?? '?', size: 32),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        staff?[id]?.fullName ?? 'Xodim',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.ink),
                      ),
                      if ((staff?[id]?.roleLine ?? '').isNotEmpty)
                        Text(
                          staff![id]!.roleLine,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12, color: AppColors.grayDark, fontWeight: FontWeight.w600),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
