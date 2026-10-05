import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../sync/action_queue.dart';
import '../sync/pending_action.dart';
import 'auth_service.dart' show apiClientProvider;

/// Xodim ilovadan kiritgan chiqim (server: routes/expenses.ts).
class ExpenseEntry {
  final String id;
  final String name;
  final num amount;
  final String? note;

  /// Xodim qo'lidagi naqddan to'langan — o'sha kungi topshiriladigan
  /// naqddan ayiriladi.
  final bool fromCash;
  final DateTime? at;

  /// Hali serverga yetib bormagan (oflayn navbatda).
  final bool pending;

  /// Server rad etgan — navbatda xato bilan turibdi.
  final String? error;

  const ExpenseEntry({
    required this.id,
    required this.name,
    required this.amount,
    required this.fromCash,
    required this.at,
    this.note,
    this.pending = false,
    this.error,
  });

  bool get failed => error != null;

  factory ExpenseEntry.fromMap(Map<Object?, Object?> m) => ExpenseEntry(
        id: m['id']?.toString() ?? '',
        name: m['name']?.toString() ?? 'Chiqim',
        amount: (m['amount'] as num?) ?? 0,
        note: m['note']?.toString(),
        fromCash: m['fromCash'] == true,
        at: DateTime.tryParse(m['at']?.toString() ?? '')?.toLocal(),
      );

  /// Navbatdagi `/addExpense` amalidan — serverdan javob kelguncha.
  factory ExpenseEntry.fromAction(PendingAction a) => ExpenseEntry(
        id: a.id,
        name: a.body['name']?.toString() ?? 'Chiqim',
        amount: (a.body['amount'] as num?) ?? 0,
        note: a.body['note']?.toString(),
        fromCash: a.body['fromCash'] == true,
        at: a.createdAt,
        pending: true,
        error: a.failed ? (a.error ?? 'Server rad etdi') : null,
      );
}

const kAddExpensePath = '/addExpense';

/// Serverdagi ro'yxat + navbatdagi (hali yuborilmagan) chiqimlar, eng
/// yangisi birinchi. Server allaqachon qabul qilgani takrorlanmaydi —
/// ilova chiqim ID'sini o'zi beradi va u navbat amali ID'si bilan bir xil.
List<ExpenseEntry> mergeExpenses(List<ExpenseEntry> server, List<PendingAction> queue) {
  final known = {for (final e in server) e.id};
  final pending = [
    for (final a in queue)
      if (a.path == kAddExpensePath && !known.contains(a.id)) ExpenseEntry.fromAction(a),
  ];
  return [...pending, ...server]..sort((a, b) => (b.at ?? DateTime(0)).compareTo(a.at ?? DateTime(0)));
}

/// Qo'ldagi naqd: yig'ilgani va undan qilingan chiqimlar. Rad etilgan
/// (xato) chiqim hisobga olinmaydi — u hech qayerga yozilmagan.
({num collected, num cashExpenses, num inHand}) cashInHand(num collected, List<ExpenseEntry> expenses) {
  final spent = expenses.where((e) => e.fromCash && !e.failed).fold<num>(0, (s, e) => s + e.amount);
  return (collected: collected, cashExpenses: spent, inHand: collected - spent);
}

class ExpensesRepository {
  final Ref _ref;
  ExpensesRepository(this._ref);

  /// Navbat orqali — internet bo'lmasa ham darhol saqlanadi va ulanish
  /// tiklanganda yuboriladi.
  void add({required String name, required num amount, required bool fromCash, String? note}) {
    final id = newActionId();
    _ref.read(actionQueueProvider.notifier).enqueue(
          PendingAction(
            id: id,
            path: kAddExpensePath,
            body: {
              'expenseId': id,
              'name': name,
              'amount': amount,
              'fromCash': fromCash,
              if (note != null && note.isNotEmpty) 'note': note,
              'actionId': id,
            },
            effect: const {'kind': 'expense.add'},
            label: 'Chiqim · $name',
            createdAt: DateTime.now(),
          ),
        );
  }

  /// Yuborilmagan chiqim navbatdan olib tashlanadi; serverdagisi esa
  /// to'g'ridan-to'g'ri o'chiriladi — server shartlarni (shu kun, naqd
  /// hali topshirilmagan) tekshirib, sababini darhol aytishi uchun.
  Future<void> delete(ExpenseEntry expense) async {
    if (expense.pending) {
      _ref.read(actionQueueProvider.notifier).discard(expense.id);
      return;
    }
    final token = await _ref.read(idTokenProvider)();
    await _ref.read(apiClientProvider).post('/deleteMyExpense', idToken: token, body: {'expenseId': expense.id});
  }
}

final expensesRepositoryProvider = Provider<ExpensesRepository>(ExpensesRepository.new);
