import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/models/item_photo.dart';
import '../../core/utils/date_utils.dart';
import 'photo_image.dart';

/// To'liq ekranda ko'rsatiladigan bitta rasm.
class ViewerPhoto {
  final String heroTag;
  final PhotoState state;

  /// Shu holatdagi tartib raqami va jami ("Eski · 1/2").
  final int index;
  final int total;
  final String? url;
  final String? localPath;
  final ItemPhoto? photo;

  const ViewerPhoto({
    required this.heroTag,
    required this.state,
    required this.index,
    required this.total,
    this.url,
    this.localPath,
    this.photo,
  });
}

/// Rasmlarni to'liq ekranda ko'rish: varaqlash, ikki barmoq bilan
/// kattalashtirish, ruxsat bo'lsa o'chirish.
class PhotoViewerPage extends StatefulWidget {
  final List<ViewerPhoto> photos;
  final int initialIndex;
  final String subtitle;

  /// `null` — o'chirish tugmasi ko'rsatilmaydi. `true` qaytarsa rasm o'chdi.
  final Future<bool> Function(ViewerPhoto photo)? onDelete;

  const PhotoViewerPage({
    super.key,
    required this.photos,
    required this.initialIndex,
    required this.subtitle,
    this.onDelete,
  });

  static Future<void> open(
    BuildContext context, {
    required List<ViewerPhoto> photos,
    required int initialIndex,
    required String subtitle,
    Future<bool> Function(ViewerPhoto photo)? onDelete,
  }) {
    return Navigator.of(context).push(
      PageRouteBuilder<void>(
        opaque: false,
        barrierColor: Colors.black,
        transitionDuration: const Duration(milliseconds: 220),
        reverseTransitionDuration: const Duration(milliseconds: 180),
        pageBuilder: (_, __, ___) => PhotoViewerPage(
          photos: photos,
          initialIndex: initialIndex,
          subtitle: subtitle,
          onDelete: onDelete,
        ),
        transitionsBuilder: (_, animation, __, child) => FadeTransition(opacity: animation, child: child),
      ),
    );
  }

  @override
  State<PhotoViewerPage> createState() => _PhotoViewerPageState();
}

class _PhotoViewerPageState extends State<PhotoViewerPage> {
  late final PageController _controller = PageController(initialPage: widget.initialIndex);
  late final List<ViewerPhoto> _photos = [...widget.photos];
  late int _index = widget.initialIndex;
  bool _zoomed = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    final current = _photos[_index];
    final deleted = await widget.onDelete!(current);
    if (!deleted || !mounted) return;
    if (_photos.length == 1) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _photos.removeAt(_index);
      if (_index >= _photos.length) _index = _photos.length - 1;
    });
  }

  @override
  Widget build(BuildContext context) {
    final current = _photos[_index];
    final photo = current.photo;
    final canDelete = widget.onDelete != null && photo != null;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            PageView.builder(
              controller: _controller,
              physics: _zoomed ? const NeverScrollableScrollPhysics() : const PageScrollPhysics(),
              itemCount: _photos.length,
              onPageChanged: (i) => setState(() => _index = i),
              itemBuilder: (context, i) => _ZoomablePhoto(
                photo: _photos[i],
                onZoomChanged: (zoomed) {
                  if (zoomed != _zoomed) setState(() => _zoomed = zoomed);
                },
              ),
            ),
            // Yuqori panel: yopish, holat va tartib, o'chirish.
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: DecoratedBox(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0xB3000000), Color(0x00000000)],
                  ),
                ),
                child: SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(4, 4, 4, 18),
                    child: Row(
                      children: [
                        IconButton(
                          onPressed: () => Navigator.of(context).pop(),
                          tooltip: 'Yopish',
                          icon: const Icon(Icons.close_rounded, color: Colors.white),
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${current.state.title} · ${current.index}/${current.total}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15.5),
                              ),
                              Text(
                                widget.subtitle,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: Colors.white70, fontSize: 12.5),
                              ),
                            ],
                          ),
                        ),
                        if (canDelete)
                          IconButton(
                            onPressed: _delete,
                            tooltip: "Rasmni o'chirish",
                            icon: const Icon(Icons.delete_outline_rounded, color: Colors.white),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            // Pastki panel: kim va qachon yuklagan / yuklanish holati.
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      colors: [Color(0xB3000000), Color(0x00000000)],
                    ),
                  ),
                  child: SafeArea(
                    top: false,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 24, 20, 14),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (_photos.length > 1)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  for (var i = 0; i < _photos.length; i++)
                                    AnimatedContainer(
                                      duration: const Duration(milliseconds: 180),
                                      margin: const EdgeInsets.symmetric(horizontal: 3),
                                      width: i == _index ? 18 : 6,
                                      height: 6,
                                      decoration: BoxDecoration(
                                        color: i == _index ? Colors.white : Colors.white38,
                                        borderRadius: BorderRadius.circular(3),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          Text(
                            photo == null
                                ? "Hali yuklanmagan — internet bo'lganda o'zi yuklanadi"
                                : [
                                    if (photo.uploadedByName != null) photo.uploadedByName!,
                                    if (photo.uploadedAt != null) formatDateTimeUz(photo.uploadedAt!),
                                  ].join(' · '),
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Colors.white70, fontSize: 12.5, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ZoomablePhoto extends StatefulWidget {
  final ViewerPhoto photo;
  final ValueChanged<bool> onZoomChanged;
  const _ZoomablePhoto({required this.photo, required this.onZoomChanged});

  @override
  State<_ZoomablePhoto> createState() => _ZoomablePhotoState();
}

class _ZoomablePhotoState extends State<_ZoomablePhoto> {
  final _transform = TransformationController();
  TapDownDetails? _doubleTapAt;

  @override
  void initState() {
    super.initState();
    _transform.addListener(() => widget.onZoomChanged(_transform.value.getMaxScaleOnAxis() > 1.01));
  }

  @override
  void dispose() {
    _transform.dispose();
    super.dispose();
  }

  /// Ikki marta bosish — shu nuqtani 2.5 barobar kattalashtirish / qaytarish.
  void _toggleZoom() {
    if (_transform.value.getMaxScaleOnAxis() > 1.01) {
      _transform.value = Matrix4.identity();
      return;
    }
    final at = _doubleTapAt?.localPosition ?? Offset.zero;
    const scale = 2.5;
    _transform.value = Matrix4.identity()
      ..translate(-at.dx * (scale - 1), -at.dy * (scale - 1))
      ..scale(scale);
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.photo;
    final Widget image = p.localPath != null
        ? LocalPhotoImage(path: p.localPath!, thumb: false, fit: BoxFit.contain)
        : p.url != null
            ? PhotoImage(url: p.url!, thumb: false, fit: BoxFit.contain)
            : const PhotoPlaceholder(broken: true, dark: true);
    return GestureDetector(
      onDoubleTapDown: (d) => _doubleTapAt = d,
      onDoubleTap: _toggleZoom,
      child: InteractiveViewer(
        transformationController: _transform,
        minScale: 1,
        maxScale: 5,
        child: SizedBox.expand(child: Hero(tag: p.heroTag, child: image)),
      ),
    );
  }
}
