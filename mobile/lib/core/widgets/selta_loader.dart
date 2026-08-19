import 'package:flutter/material.dart';

/// Selta Cleaning logotipi aylanib turadigan umumiy yuklanish ko'rsatkichi
/// — ilova bo'ylab oddiy `CircularProgressIndicator` o'rniga ishlatiladi
/// (talab: "Selta Cleaning logosi yuklanishlar paytida aylanib turishi",
/// "har bir qism Selta Cleaning ruhiyatini berishi kerak").
class SeltaLoader extends StatefulWidget {
  final double size;
  final bool white;
  final String? label;

  const SeltaLoader({super.key, this.size = 44, this.white = false, this.label});

  @override
  State<SeltaLoader> createState() => _SeltaLoaderState();
}

class _SeltaLoaderState extends State<SeltaLoader> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final icon = RotationTransition(
      turns: _controller,
      child: Image.asset(
        widget.white ? 'assets/brand/icon_white.png' : 'assets/brand/icon_purple.png',
        width: widget.size,
        height: widget.size,
      ),
    );

    if (widget.label == null) return icon;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        icon,
        const SizedBox(height: 14),
        Text(
          widget.label!,
          style: TextStyle(
            color: widget.white ? Colors.white.withValues(alpha: 0.85) : const Color(0xFF7A7482),
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

/// To'liq ekranli markazlashgan yuklanish holati — sahifa `.when(loading:)`
/// bo'g'inlarida qayta-qayta yozmaslik uchun.
class SeltaLoadingView extends StatelessWidget {
  final String label;
  const SeltaLoadingView({super.key, this.label = 'Yuklanmoqda...'});

  @override
  Widget build(BuildContext context) {
    return Center(child: SeltaLoader(label: label));
  }
}
