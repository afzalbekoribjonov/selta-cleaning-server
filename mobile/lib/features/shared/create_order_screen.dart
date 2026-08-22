import 'package:flutter/material.dart';

import '../dispatcher/new_order_tab.dart';

void openCreateOrderScreen(BuildContext context) {
  Navigator.of(context).push(MaterialPageRoute(builder: (context) => const CreateOrderScreen()));
}

/// Sotuv menejeri bo'lmagan, ammo admin panelda "Buyurtma yaratish
/// huquqi" berilgan xodim uchun — `NewOrderTab`ning o'zini alohida
/// sahifa sifatida ochadi (talab: "+" tugmasi orqali kirish). Xuddi
/// sotuv menejerining formasi bilan bir xil — shu jumladan "O'zi keldi"
/// tanlovi ham mavjud.
class CreateOrderScreen extends StatelessWidget {
  const CreateOrderScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Yangi buyurtma')),
      body: NewOrderTab(onSaved: () => Navigator.of(context).pop()),
    );
  }
}
