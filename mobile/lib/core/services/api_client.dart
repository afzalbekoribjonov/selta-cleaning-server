import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';

/// server/'dagi ApiError bilan mos — { error, message } shaklidagi JSON
/// xato javobini o'raydi.
class ApiException implements Exception {
  final int status;
  final String code;
  final String message;

  const ApiException(this.status, this.code, this.message);
}

/// `server/` (Render'dagi Express backend)ga so'rov yuboruvchi umumiy
/// klient — Cloud Functions'ning `httpsCallable` o'rnini bosadi (Blaze
/// rejasi shart bo'lmasligi uchun).
class ApiClient {
  final http.Client _client = http.Client();

  Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? body,
    String? idToken,
  }) async {
    final uri = Uri.parse('$kServerBaseUrl$path');
    late http.Response response;
    try {
      response = await _client.post(
        uri,
        headers: {
          'Content-Type': 'application/json',
          if (idToken != null) 'Authorization': 'Bearer $idToken',
        },
        body: jsonEncode(body ?? const {}),
      );
    } catch (_) {
      throw const ApiException(0, 'unavailable', "Serverga ulanib bo'lmadi");
    }

    Map<String, dynamic> decoded;
    try {
      decoded = response.body.isEmpty ? const {} : jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      // Server kutilmagan (JSON bo'lmagan) javob qaytardi — masalan 404/502
      // HTML sahifasi. Route mavjud emasligi eng ehtimoliy sabab.
      throw ApiException(response.statusCode, 'internal', "Server kutilmagan javob qaytardi (${response.statusCode})");
    }

    if (response.statusCode >= 400) {
      throw ApiException(
        response.statusCode,
        decoded['error'] as String? ?? 'internal',
        decoded['message'] as String? ?? "Noma'lum xatolik yuz berdi",
      );
    }
    return decoded;
  }
}
