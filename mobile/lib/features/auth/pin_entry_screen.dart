import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/services/auth_service.dart';

/// Xodim ismini tanlagach ko'rsatiladigan 4 xonali PIN ekrani (talab #2).
/// Muvaffaqiyatli bo'lsa signInWithCustomToken chaqiriladi va Firebase
/// Auth'ning o'zi sessiyani saqlaydi — keyingi safar ilova ochilganda shu
/// ekran umuman ko'rinmaydi (splash to'g'ridan-to'g'ri xodim paneliga
/// o'tkazadi).
class PinEntryScreen extends ConsumerStatefulWidget {
  final String employeeId;
  final String employeeName;

  const PinEntryScreen({super.key, required this.employeeId, required this.employeeName});

  @override
  ConsumerState<PinEntryScreen> createState() => _PinEntryScreenState();
}

class _PinEntryScreenState extends ConsumerState<PinEntryScreen> {
  static const _pinLength = 4;
  String _pin = '';
  bool _checking = false;
  String? _error;

  void _press(int n) {
    if (_checking || _pin.length >= _pinLength) return;
    setState(() {
      _pin += n.toString();
      _error = null;
    });
    if (_pin.length == _pinLength) {
      Future.delayed(const Duration(milliseconds: 150), _submit);
    }
  }

  void _backspace() {
    if (_pin.isEmpty) return;
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  Future<void> _submit() async {
    setState(() => _checking = true);
    try {
      await ref.read(authServiceProvider).loginWithPin(employeeId: widget.employeeId, pin: _pin);
      if (!mounted) return;
      context.go('/home');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = describeFunctionsError(e);
        _checking = false;
        _pin = '';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.primary,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 340),
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.06),
                border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                borderRadius: BorderRadius.circular(32),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: Colors.white.withValues(alpha: 0.12),
                    child: Text(
                      widget.employeeName.isNotEmpty ? widget.employeeName[0].toUpperCase() : '?',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 22),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    widget.employeeName,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _error ?? '$_pinLength xonali PIN kodingizni kiriting',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: _error != null ? AppColors.accent : Colors.white.withValues(alpha: 0.6),
                      fontSize: 13,
                      fontWeight: _error != null ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 22),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(_pinLength, (i) {
                      final active = i < _pin.length;
                      return Container(
                        margin: const EdgeInsets.symmetric(horizontal: 7),
                        width: 15,
                        height: 15,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: active ? Colors.white : Colors.transparent,
                          border: Border.all(color: Colors.white.withValues(alpha: active ? 1 : 0.35), width: 2),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: 26),
                  if (_checking)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 8),
                      child: CircularProgressIndicator(color: Colors.white),
                    )
                  else
                    GridView.count(
                      crossAxisCount: 3,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 1.3,
                      children: [
                        for (final n in [1, 2, 3, 4, 5, 6, 7, 8, 9]) _padButton(label: '$n', onTap: () => _press(n)),
                        const SizedBox(),
                        _padButton(label: '0', onTap: () => _press(0)),
                        _padButton(icon: Icons.backspace_outlined, onTap: _backspace),
                      ],
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _padButton({String? label, IconData? icon, required VoidCallback onTap}) {
    return Material(
      color: Colors.white.withValues(alpha: 0.06),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Center(
          child: icon != null
              ? Icon(icon, color: Colors.white.withValues(alpha: 0.6), size: 18)
              : Text(label!, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }
}
