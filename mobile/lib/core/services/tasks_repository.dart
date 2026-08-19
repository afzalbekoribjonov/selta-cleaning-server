import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/task.dart';
import 'api_client.dart';
import 'auth_service.dart' show apiClientProvider, authStateProvider;

/// "Boshqa" bo'limdagi xodimga tayinlangan topshiriqlar — o'qish
/// to'g'ridan-to'g'ri Firestore orqali (real-vaqtli, faqat o'ziniki),
/// holat o'zgarishi server orqali (talab: status hech qachon to'g'ridan-
/// to'g'ri klientdan yozilmaydi).
class TasksRepository {
  final ApiClient _api;
  TasksRepository(this._api);

  Stream<List<Task>> watchMyTasks(String employeeId) {
    return FirebaseFirestore.instance
        .collection('tasks')
        .where('employeeId', isEqualTo: employeeId)
        .snapshots()
        .map((snap) => snap.docs.map(Task.fromFirestore).toList());
  }

  Future<String> _idToken() async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) throw StateError('Tizimga kirilmagan');
    return token;
  }

  Future<void> markDone(String taskId) async {
    await _api.post('/markTaskDone', idToken: await _idToken(), body: {'taskId': taskId});
  }

  Future<void> markDelayed(String taskId, {String? delayNote}) async {
    await _api.post(
      '/markTaskDelayed',
      idToken: await _idToken(),
      body: {'taskId': taskId, if (delayNote != null) 'delayNote': delayNote},
    );
  }
}

final tasksRepositoryProvider = Provider<TasksRepository>((ref) => TasksRepository(ref.watch(apiClientProvider)));

final myTasksProvider = StreamProvider.family<List<Task>, String>((ref, employeeId) {
  ref.watch(authStateProvider);
  return ref.watch(tasksRepositoryProvider).watchMyTasks(employeeId);
});
