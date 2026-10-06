import 'package:cloud_firestore/cloud_firestore.dart';

/// Mahsulot rasmi holati: "eski" (qabul qilingandagi) va "tayyor"
/// (yuvilgandan keyingi). Server: lib/itemPhotos.ts.
enum PhotoState {
  before('before', 'Eski', 'Eski holati'),
  ready('ready', 'Tayyor', 'Tayyor holati');

  final String key;
  final String label;
  final String title;
  const PhotoState(this.key, this.label, this.title);

  static PhotoState? fromKey(Object? key) {
    for (final s in values) {
      if (s.key == key) return s;
    }
    return null;
  }
}

/// Har bir holat uchun ko'pi bilan shuncha rasm (server bilan bir xil).
const kMaxPhotosPerState = 2;

class ItemPhoto {
  final String fileId;
  final String url;
  final int? width;
  final int? height;
  final String? uploadedByName;
  final DateTime? uploadedAt;

  const ItemPhoto({
    required this.fileId,
    required this.url,
    this.width,
    this.height,
    this.uploadedByName,
    this.uploadedAt,
  });

  /// Firestore (Timestamp) yoki navbatdagi JSON (millisekund) — ikkalasi ham.
  static ItemPhoto? fromRaw(Object? raw) {
    if (raw is! Map) return null;
    final fileId = raw['fileId'];
    final url = raw['url'];
    if (fileId is! String || url is! String || fileId.isEmpty || url.isEmpty) return null;
    final at = raw['uploadedAt'];
    return ItemPhoto(
      fileId: fileId,
      url: url,
      width: (raw['width'] as num?)?.toInt(),
      height: (raw['height'] as num?)?.toInt(),
      uploadedByName: raw['uploadedByName']?.toString(),
      uploadedAt: at is Timestamp
          ? at.toDate()
          : at is num
              ? DateTime.fromMillisecondsSinceEpoch(at.toInt())
              : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'fileId': fileId,
        'url': url,
        if (width != null) 'width': width,
        if (height != null) 'height': height,
        if (uploadedByName != null) 'uploadedByName': uploadedByName,
        if (uploadedAt != null) 'uploadedAt': uploadedAt!.millisecondsSinceEpoch,
      };
}

class ItemPhotos {
  final List<ItemPhoto> before;
  final List<ItemPhoto> ready;

  const ItemPhotos({this.before = const [], this.ready = const []});

  static const empty = ItemPhotos();

  List<ItemPhoto> of(PhotoState state) => state == PhotoState.before ? before : ready;

  int get total => before.length + ready.length;
  bool get isEmpty => total == 0;

  bool contains(String fileId) => before.any((p) => p.fileId == fileId) || ready.any((p) => p.fileId == fileId);

  static ItemPhotos fromRaw(Object? raw) {
    if (raw is! Map) return empty;
    List<ItemPhoto> list(Object? value) =>
        value is List ? value.map(ItemPhoto.fromRaw).whereType<ItemPhoto>().toList() : const [];
    final result = ItemPhotos(before: list(raw['before']), ready: list(raw['ready']));
    return result.isEmpty ? empty : result;
  }

  Map<String, dynamic> toJson() => {
        'before': [for (final p in before) p.toJson()],
        'ready': [for (final p in ready) p.toJson()],
      };
}
