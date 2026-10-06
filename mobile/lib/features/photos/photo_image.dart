import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/photos/photo_cache.dart';

/// ImageKit rasmi — qurilma keshidan (bir marta yuklangach qayta
/// yuklanmaydi, internetsiz ham ko'rinadi).
///
/// [thumb] — katakchalar uchun kichik nusxa (ImageKit kichraytiradi);
/// aks holda asl rasm, u yuklanguncha kichik nusxasi ko'rsatib turiladi.
class PhotoImage extends ConsumerWidget {
  final String url;
  final bool thumb;
  final BoxFit fit;

  const PhotoImage({super.key, required this.url, this.thumb = true, this.fit = BoxFit.cover});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final caches = ref.watch(photoCachesProvider);
    final dpr = MediaQuery.devicePixelRatioOf(context);
    if (thumb) {
      return CachedNetworkImage(
        imageUrl: photoThumbUrl(url),
        cacheManager: caches.thumbs,
        fit: fit,
        memCacheWidth: (200 * dpr).round(),
        fadeInDuration: const Duration(milliseconds: 150),
        placeholder: (_, __) => const PhotoPlaceholder(),
        errorWidget: (_, __, ___) => const PhotoPlaceholder(broken: true),
      );
    }
    return CachedNetworkImage(
      imageUrl: url,
      cacheManager: caches.full,
      fit: fit,
      fadeInDuration: const Duration(milliseconds: 150),
      placeholder: (_, __) => Stack(
        fit: StackFit.expand,
        children: [
          CachedNetworkImage(
            imageUrl: photoThumbUrl(url),
            cacheManager: caches.thumbs,
            fit: fit,
            errorWidget: (_, __, ___) => const SizedBox.shrink(),
          ),
          const Center(child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5)),
        ],
      ),
      errorWidget: (_, __, ___) => const PhotoPlaceholder(broken: true, dark: true),
    );
  }
}

/// Hali yuklanmagan (navbatdagi) rasm — telefondagi fayldan.
class LocalPhotoImage extends StatelessWidget {
  final String path;
  final bool thumb;
  final BoxFit fit;

  const LocalPhotoImage({super.key, required this.path, this.thumb = true, this.fit = BoxFit.cover});

  @override
  Widget build(BuildContext context) {
    final dpr = MediaQuery.devicePixelRatioOf(context);
    return Image.file(
      File(path),
      fit: fit,
      cacheWidth: thumb ? (200 * dpr).round() : null,
      errorBuilder: (_, __, ___) => const PhotoPlaceholder(broken: true),
    );
  }
}

class PhotoPlaceholder extends StatelessWidget {
  final bool broken;
  final bool dark;
  const PhotoPlaceholder({super.key, this.broken = false, this.dark = false});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: dark ? Colors.black : AppColors.bg,
      child: Center(
        child: Icon(
          broken ? Icons.broken_image_outlined : Icons.image_outlined,
          color: dark ? Colors.white54 : AppColors.gray,
          size: 26,
        ),
      ),
    );
  }
}
