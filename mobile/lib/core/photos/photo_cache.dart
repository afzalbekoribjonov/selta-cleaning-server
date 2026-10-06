import 'dart:typed_data';

import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Rasmlar qurilma xotirasida SAQLANADI va qayta yuklanmaydi.
///
/// ImageKit'dagi har bir rasm manzili o'zgarmas (fayl almashtirilmaydi —
/// o'chirilib, yangisi boshqa manzil bilan yuklanadi). Shuning uchun bir
/// marta yuklangan rasm cheksiz yaroqli hisoblanadi: odatiy kesh esa
/// serverning `Cache-Control` sarlavhasiga qarab bir necha kundan keyin
/// rasmni qayta yuklardi — bu ImageKit trafigi limitini behuda sarflaydi.
const _forever = Duration(days: 3650);

/// Yuklangan javobning "yaroqlilik muddati"ni cheksiz qiladi.
class _KeepForeverFileService extends FileService {
  final HttpFileService _inner = HttpFileService();

  @override
  Future<FileServiceResponse> get(String url, {Map<String, String>? headers}) async =>
      _KeepForever(await _inner.get(url, headers: headers));
}

class _KeepForever implements FileServiceResponse {
  final FileServiceResponse _response;
  _KeepForever(this._response);

  @override
  Stream<List<int>> get content => _response.content;
  @override
  int? get contentLength => _response.contentLength;
  @override
  int get statusCode => _response.statusCode;
  @override
  String? get eTag => _response.eTag;
  @override
  String get fileExtension => _response.fileExtension;
  @override
  DateTime get validTill => DateTime.now().add(_forever);
}

/// Kichik nusxalar (ro'yxat/katakchalar) va asl rasmlar alohida keshda:
/// ko'p sonli kichik nusxa katta rasmlarni keshdan siqib chiqarmasin.
/// Uzoq vaqt (bir yil) ochilmagan rasmlargina o'chadi.
class PhotoCaches {
  final BaseCacheManager thumbs;
  final BaseCacheManager full;
  const PhotoCaches({required this.thumbs, required this.full});
}

PhotoCaches? _caches;

final photoCachesProvider = Provider<PhotoCaches>((ref) {
  return _caches ??= PhotoCaches(
    thumbs: CacheManager(
      Config('seltaPhotoThumbs', stalePeriod: const Duration(days: 365), maxNrOfCacheObjects: 2000, fileService: _KeepForeverFileService()),
    ),
    full: CacheManager(
      Config('seltaPhotoFull', stalePeriod: const Duration(days: 365), maxNrOfCacheObjects: 400, fileService: _KeepForeverFileService()),
    ),
  );
});

/// Kichik nusxa — ImageKit o'zi kichraytirib beradi (~15-30 KB), shuning
/// uchun katakchalar uchun asl rasm (200-400 KB) yuklanmaydi.
String photoThumbUrl(String url) => '$url${url.contains('?') ? '&' : '?'}tr=w-400,h-400,c-at_max,q-70';

/// Rasmni yuklagan qurilmada u qayta yuklanmasin: o'z baytlari ikkala
/// keshga ham yoziladi.
Future<void> cacheUploadedPhoto(PhotoCaches caches, String url, List<int> bytes) async {
  final data = bytes is Uint8List ? bytes : Uint8List.fromList(bytes);
  await caches.full.putFile(url, data, maxAge: _forever, fileExtension: 'jpg');
  await caches.thumbs.putFile(photoThumbUrl(url), data, maxAge: _forever, fileExtension: 'jpg');
}
