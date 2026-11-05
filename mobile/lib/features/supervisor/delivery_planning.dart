import '../../core/models/order.dart';
import '../../core/models/order_item.dart';
import '../../core/services/supervisor_repository.dart';
import '../delivery/driver_tasks.dart' show isAssignmentOpen;

/// Dastavchikka berilishi mumkin bo'lgan buyurtma turi.
enum PlanKind { delivery, pickup }

/// Buyurtmaning hozir "Tayyor" mahsulotlari.
List<OrderItem> readyItemsOf(Order o) => [
      for (final i in o.itemsMirror ?? const <OrderItem>[])
        if (i.status == 'ready') i,
    ];

/// Topshiriqqa qo'shsa bo'ladigan buyurtma: yangi (mijozdan olib kelish)
/// yoki sexda turgan va kamida bitta mahsuloti tayyor (yetkazish).
PlanKind? planKindOf(Order o) {
  if (o.serviceType != 'pickup' || o.isDone) return null;
  if (o.status == 'new' || o.status == 'picked_up') return PlanKind.pickup;
  if (o.status == 'brought_in' && (o.itemStatusCounts['ready'] ?? 0) > 0) return PlanKind.delivery;
  return null;
}

/// Shu dastavchikning [date] kungi hozirgi topshirig'i — server qabul
/// qiladigan ko'rinishda: bajarib bo'lingan buyurtmalar tashlanadi,
/// mahsulotlardan esa faqat hali "Tayyor"lari qoladi (aks holda server
/// butun saqlashni rad etardi).
List<AssignmentStop> currentStopsFor(List<Order> orders, String driverId, String date) {
  final assigned = orders.where((o) {
    final a = o.assignment;
    return a != null && a.driverId == driverId && a.date == date && isAssignmentOpen(o);
  }).toList()
    ..sort((x, y) => x.assignment!.seq.compareTo(y.assignment!.seq));

  final stops = <AssignmentStop>[];
  for (final o in assigned) {
    final a = o.assignment!;
    if (a.isPickup) {
      if (planKindOf(o) == PlanKind.pickup) stops.add((orderId: o.id, itemIds: const []));
      continue;
    }
    final ready = readyItemsOf(o).map((i) => i.id).toSet();
    final ids = a.itemIds.isEmpty ? ready.toList() : a.itemIds.where(ready.contains).toList();
    if (ids.isNotEmpty) stops.add((orderId: o.id, itemIds: ids));
  }
  return stops;
}

/// Bitta buyurtmani dastavchikning topshirig'iga qo'shadi (yoki
/// mahsulotlarini yangilaydi) va butun ro'yxatni saqlaydi.
Future<({int assigned, int cleared})> addOrderToDriver(
  SupervisorRepository repo, {
  required List<Order> orders,
  required Order order,
  required String driverId,
  required String date,
  List<String> itemIds = const [],
}) {
  final stops = currentStopsFor(orders, driverId, date).where((s) => s.orderId != order.id).toList()
    ..add((orderId: order.id, itemIds: itemIds));
  return repo.assignDeliveries(driverId: driverId, date: date, stops: stops, note: _noteOf(orders, driverId, date));
}

/// Buyurtmani dastavchikning topshirig'idan olib tashlaydi.
Future<void> removeOrderFromDriver(SupervisorRepository repo, Order order) => repo.clearAssignment(order.id);

/// Mavjud topshiriq izohi — qayta saqlashda yo'qolib qolmasin.
String? _noteOf(List<Order> orders, String driverId, String date) {
  for (final o in orders) {
    final a = o.assignment;
    if (a != null && a.driverId == driverId && a.date == date && a.note != null) return a.note;
  }
  return null;
}

/// Shu kunga shu dastavchikka biriktirilgan ochiq buyurtmalar soni.
int stopCountFor(List<Order> orders, String driverId, String date) =>
    orders.where((o) => o.assignment?.driverId == driverId && o.assignment?.date == date && isAssignmentOpen(o)).length;
