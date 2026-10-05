import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/task.dart';
import '../sync/action_queue.dart';
import '../sync/pending_action.dart';
import 'auth_service.dart' show authStateProvider;

/// Navbatdagi topshiriq holati o'zgarishi (ekranda darhol ko'rsatish uchun).
const kTaskStatusEffect = 'task.status';

/// "Boshqa" bo'limdagi xodimga tayinlangan topshiriqlar — o'qish
/// to'g'ridan-to'g'ri Firestore orqali (real-vaqtli, faqat o'ziniki),
/// holat o'zgarishi server orqali (talab: status hech qachon to'g'ridan-
/// to'g'ri klientdan yozilmaydi).
///
/// Yozish OFLAYN NAVBAT orqali: internetsiz ham "Bajarildi" darhol
/// ko'rinadi va ulanish tiklanganda serverga yetkaziladi.
class TasksRepository {
  final Ref _ref;
  TasksRepository(this._ref);

  Stream<List<Task>> watchMyTasks(String employeeId) {
    return FirebaseFirestore.instance
        .collection('tasks')
        .where('employeeId', isEqualTo: employeeId)
        .snapshots()
        .map((snap) => snap.docs.map(Task.fromFirestore).toList());
  }

  void _enqueue(String path, Map<String, dynamic> body, Map<String, dynamic> effect, String label) {
    final id = newActionId();
    _ref.read(actionQueueProvider.notifier).enqueue(
          PendingAction(
            id: id,
            path: path,
            body: {...body, 'actionId': id},
            effect: effect,
            label: label,
            createdAt: DateTime.now(),
          ),
        );
  }

  void markDone(Task task) => _enqueue(
        '/markTaskDone',
        {'taskId': task.id},
        {'kind': kTaskStatusEffect, 'taskId': task.id, 'status': 'done', 'at': DateTime.now().millisecondsSinceEpoch},
        'Topshiriq bajarildi · ${task.title}',
      );

  void markDelayed(Task task, {String? delayNote}) => _enqueue(
        '/markTaskDelayed',
        {'taskId': task.id, if (delayNote != null) 'delayNote': delayNote},
        {'kind': kTaskStatusEffect, 'taskId': task.id, 'status': 'delayed', if (delayNote != null) 'delayNote': delayNote},
        'Topshiriq kechikmoqda · ${task.title}',
      );
}

/// Topshiriqlar ro'yxatiga navbatdagi holat o'zgarishlarini qo'llaydi.
/// Rad etilgan amal qo'llanmaydi — u aslida sodir bo'lmagan.
List<Task> applyTaskActions(List<Task> tasks, List<PendingAction> actions) {
  final changes = {
    for (final a in actions)
      if (!a.failed && a.kind == kTaskStatusEffect) a.effect['taskId'] as String: a.effect,
  };
  if (changes.isEmpty) return tasks;
  return [
    for (final t in tasks)
      if (changes[t.id] case final e?)
        t.copyWith(
          status: e['status'] as String?,
          delayNote: e['delayNote'] as String?,
          completedAt: e['at'] is num ? DateTime.fromMillisecondsSinceEpoch((e['at'] as num).toInt()) : null,
        )
      else
        t,
  ];
}

final tasksRepositoryProvider = Provider<TasksRepository>(TasksRepository.new);

final _myTasksStreamProvider = StreamProvider.family<List<Task>, String>((ref, employeeId) {
  ref.watch(authStateProvider);
  return ref.read(tasksRepositoryProvider).watchMyTasks(employeeId);
});

/// Xodimning topshiriqlari — navbatdagi (hali yuborilmagan) o'zgarishlar bilan.
final myTasksProvider = Provider.family<AsyncValue<List<Task>>, String>((ref, employeeId) {
  final actions = ref.watch(actionQueueProvider);
  return ref.watch(_myTasksStreamProvider(employeeId)).whenData((tasks) => applyTaskActions(tasks, actions));
});
