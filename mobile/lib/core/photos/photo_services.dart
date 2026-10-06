import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

import '../services/auth_service.dart' show employeeClaimsProvider;
import '../services/employee_repository.dart';

/// Rasm vakolatlari (admin panel → xodim). Admin — hammasi.
class PhotoPermissions {
  final bool canView;
  final bool canUpload;
  final bool canDelete;
  const PhotoPermissions({this.canView = false, this.canUpload = false, this.canDelete = false});

  static PhotoPermissions of(Map<String, dynamic>? employee, String? role) {
    final admin = role == 'admin';
    return PhotoPermissions(
      canView: admin || employee?['canViewPhotos'] == true,
      canUpload: admin || employee?['canUploadPhotos'] == true,
      canDelete: admin || employee?['canDeletePhotos'] == true,
    );
  }

  bool get any => canView || canUpload;
}

final photoPermissionsProvider = Provider<PhotoPermissions>((ref) {
  return PhotoPermissions.of(
    ref.watch(currentEmployeeProvider).valueOrNull,
    ref.watch(employeeClaimsProvider).valueOrNull?.role,
  );
});

/// Server bergan bir martalik yuklash imzosi (server: routes/photos.ts).
class UploadAuth {
  final String uploadUrl;
  final String publicKey;
  final String token;
  final int expire;
  final String signature;
  final String folder;
  final String fileName;

  const UploadAuth({
    required this.uploadUrl,
    required this.publicKey,
    required this.token,
    required this.expire,
    required this.signature,
    required this.folder,
    required this.fileName,
  });

  factory UploadAuth.fromJson(Map<String, dynamic> j) {
    String str(String key) {
      final v = j[key];
      if (v is! String || v.isEmpty) throw FormatException('upload auth: $key');
      return v;
    }

    final expire = j['expire'];
    if (expire is! num) throw const FormatException('upload auth: expire');
    return UploadAuth(
      uploadUrl: str('uploadUrl'),
      publicKey: str('publicKey'),
      token: str('token'),
      expire: expire.toInt(),
      signature: str('signature'),
      folder: str('folder'),
      fileName: str('fileName'),
    );
  }
}

class UploadedPhoto {
  final String fileId;
  final String url;
  const UploadedPhoto(this.fileId, this.url);
}

class PhotoUploadException implements Exception {
  final String message;

  /// Internet/xizmat vaqtincha — navbat keyinroq o'zi qayta urinadi.
  final bool transient;
  const PhotoUploadException(this.message, {required this.transient});

  @override
  String toString() => message;
}

abstract class PhotoUploader {
  Future<UploadedPhoto> upload(UploadAuth auth, List<int> bytes);
}

/// Rasmni to'g'ridan-to'g'ri ImageKit'ga yuklaydi (server orqali emas —
/// tezroq, Render'ga yuk tushmaydi). Imzo serverdan, maxfiy kalit ilovada yo'q.
class ImageKitUploader implements PhotoUploader {
  static const _timeout = Duration(seconds: 90);
  final http.Client _client;

  ImageKitUploader({http.Client? client}) : _client = client ?? http.Client();

  @override
  Future<UploadedPhoto> upload(UploadAuth auth, List<int> bytes) async {
    final uri = Uri.tryParse(auth.uploadUrl);
    // Rasm faqat ImageKit'ga ketadi — boshqa manzilga hech qachon.
    if (uri == null || uri.scheme != 'https' || uri.host != 'upload.imagekit.io') {
      throw const PhotoUploadException("Yuklash manzili noto'g'ri", transient: false);
    }
    final request = http.MultipartRequest('POST', uri)
      ..fields.addAll({
        'fileName': auth.fileName,
        'publicKey': auth.publicKey,
        'signature': auth.signature,
        'expire': '${auth.expire}',
        'token': auth.token,
        'folder': auth.folder,
        'useUniqueFileName': 'true',
      })
      ..files.add(http.MultipartFile.fromBytes('file', bytes, filename: auth.fileName));

    final http.Response response;
    try {
      response = await http.Response.fromStream(await _client.send(request).timeout(_timeout)).timeout(_timeout);
    } on TimeoutException {
      throw const PhotoUploadException('Yuklash juda uzoq davom etdi', transient: true);
    } on SocketException {
      throw const PhotoUploadException("Internet yo'q", transient: true);
    } on http.ClientException {
      throw const PhotoUploadException("Internet yo'q", transient: true);
    }

    Map<String, dynamic> body = const {};
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) body = decoded;
    } catch (_) {}

    if (response.statusCode == 200) {
      final fileId = body['fileId'];
      final url = body['url'];
      if (fileId is String && fileId.isNotEmpty && url is String && url.isNotEmpty) return UploadedPhoto(fileId, url);
      throw const PhotoUploadException("Rasm xizmati kutilmagan javob qaytardi", transient: true);
    }
    if (response.statusCode == 429 || response.statusCode >= 500) {
      throw const PhotoUploadException('Rasm xizmati band — keyinroq yuklanadi', transient: true);
    }
    final message = body['message'];
    throw PhotoUploadException(
      "Rasmni yuklab bo'lmadi${message is String && message.isNotEmpty ? ': $message' : ''}",
      transient: false,
    );
  }
}

final photoUploaderProvider = Provider<PhotoUploader>((ref) => ImageKitUploader());

/// Kamera/galereya. Rasm darhol kichraytirib, siqib olinadi (~200-400 KB):
/// yuklash tez, ImageKit xotirasi va trafigi tejaladi.
abstract class PhotoPicker {
  /// Tanlangan/olingan fayllar yo'li (bekor qilinsa bo'sh).
  Future<List<String>> pick({required bool camera, required int max});

  /// Android kamera ochiq paytda ilovani xotiradan chiqarib yuborsa —
  /// olingan rasm qayta ochilganda shu yerdan qaytariladi.
  Future<List<String>> retrieveLost();
}

class PhotoPickException implements Exception {
  final String message;
  const PhotoPickException(this.message);
}

class DevicePhotoPicker implements PhotoPicker {
  static const _maxSide = 1600.0;
  static const _quality = 80;
  final _picker = ImagePicker();

  @override
  Future<List<String>> pick({required bool camera, required int max}) async {
    if (max <= 0) return const [];
    try {
      if (camera) {
        final file = await _picker.pickImage(
          source: ImageSource.camera,
          maxWidth: _maxSide,
          maxHeight: _maxSide,
          imageQuality: _quality,
          preferredCameraDevice: CameraDevice.rear,
          requestFullMetadata: false,
        );
        return file == null ? const [] : [file.path];
      }
      if (max >= 2) {
        final files = await _picker.pickMultiImage(
          maxWidth: _maxSide,
          maxHeight: _maxSide,
          imageQuality: _quality,
          limit: max,
          requestFullMetadata: false,
        );
        return files.take(max).map((f) => f.path).toList();
      }
      final file = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: _maxSide,
        maxHeight: _maxSide,
        imageQuality: _quality,
        requestFullMetadata: false,
      );
      return file == null ? const [] : [file.path];
    } on PlatformException catch (e) {
      if (e.code.contains('camera_access_denied')) {
        throw const PhotoPickException("Kameraga ruxsat berilmagan — telefon sozlamalaridan ruxsat bering");
      }
      if (e.code.contains('photo_access_denied')) {
        throw const PhotoPickException("Galereyaga ruxsat berilmagan — telefon sozlamalaridan ruxsat bering");
      }
      throw PhotoPickException("Rasmni olib bo'lmadi: ${e.message ?? e.code}");
    }
  }

  @override
  Future<List<String>> retrieveLost() async {
    if (!Platform.isAndroid) return const [];
    final response = await _picker.retrieveLostData();
    if (response.isEmpty) return const [];
    final files = response.files ?? (response.file == null ? const <XFile>[] : [response.file!]);
    return files.map((f) => f.path).toList();
  }
}

final photoPickerProvider = Provider<PhotoPicker>((ref) => DevicePhotoPicker());

/// Yuklanishini kutayotgan rasmlar shu papkada turadi (ilova yopilsa
/// ham yo'qolmaydi; yuklangach o'chiriladi).
final photoStorageDirProvider = FutureProvider<Directory>((ref) async {
  final base = await getApplicationDocumentsDirectory();
  final dir = Directory('${base.path}${Platform.pathSeparator}photo_queue');
  await dir.create(recursive: true);
  return dir;
});
