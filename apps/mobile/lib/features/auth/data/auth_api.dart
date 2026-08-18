import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:slow_dating/core/api/api_client.dart';

abstract interface class AuthApi {
  Future<OtpChallenge> requestOtp({
    required String phone,
    required String idempotencyKey,
  });

  Future<AuthTokens> verifyOtp({
    required String challengeId,
    required String code,
    required String deviceName,
    required String idempotencyKey,
  });

  Future<AuthTokens> refresh({
    required String refreshToken,
    required String idempotencyKey,
  });
}

final class OtpChallenge {
  const OtpChallenge({required this.challengeId, required this.expiresAt});

  final String challengeId;
  final DateTime expiresAt;
}

final class AuthTokens {
  const AuthTokens({
    required this.accessToken,
    required this.accessExpiresAt,
    required this.refreshToken,
    required this.refreshExpiresAt,
  });

  final String accessToken;
  final DateTime accessExpiresAt;
  final String refreshToken;
  final DateTime refreshExpiresAt;

  @override
  String toString() => 'AuthTokens(redacted)';
}

enum AuthApiFailure {
  invalidPhone,
  invalidOrExpiredCode,
  consumedCode,
  invalidRefresh,
  network,
  invalidResponse,
}

final class AuthApiException implements Exception {
  const AuthApiException(this.kind, this.userMessage);

  final AuthApiFailure kind;
  final String userMessage;

  @override
  String toString() => 'AuthApiException(kind: $kind)';
}

final class DioAuthApi implements AuthApi {
  const DioAuthApi(this._client);

  final Dio _client;

  @override
  Future<OtpChallenge> requestOtp({
    required String phone,
    required String idempotencyKey,
  }) async {
    try {
      final response = await _client.post<Object?>(
        '/auth/otp/request',
        data: {'phone': phone},
        options: _commandOptions(idempotencyKey),
      );
      final body = _body(response.data);
      return OtpChallenge(
        challengeId: _string(body, 'challengeId'),
        expiresAt: _dateTime(body, 'expiresAt'),
      );
    } on DioException catch (error) {
      if (error.response?.statusCode == 400) {
        throw const AuthApiException(
          AuthApiFailure.invalidPhone,
          'Enter a valid Vietnamese phone number.',
        );
      }
      throw _networkFailure;
    } on AuthApiException {
      rethrow;
    } on Object {
      throw _invalidResponse;
    }
  }

  @override
  Future<AuthTokens> verifyOtp({
    required String challengeId,
    required String code,
    required String deviceName,
    required String idempotencyKey,
  }) async {
    try {
      final response = await _client.post<Object?>(
        '/auth/otp/verify',
        data: {
          'challengeId': challengeId,
          'code': code,
          'deviceName': deviceName,
        },
        options: _commandOptions(idempotencyKey),
      );
      return _tokens(response.data);
    } on DioException catch (error) {
      if (error.response?.statusCode == 400) {
        throw const AuthApiException(
          AuthApiFailure.invalidOrExpiredCode,
          'The code is incorrect or has expired.',
        );
      }
      if (error.response?.statusCode == 409) {
        throw const AuthApiException(
          AuthApiFailure.consumedCode,
          'This code has already been used. Request a new code.',
        );
      }
      throw _networkFailure;
    } on AuthApiException {
      rethrow;
    } on Object {
      throw _invalidResponse;
    }
  }

  @override
  Future<AuthTokens> refresh({
    required String refreshToken,
    required String idempotencyKey,
  }) async {
    try {
      final response = await _client.post<Object?>(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: _commandOptions(idempotencyKey),
      );
      return _tokens(response.data);
    } on DioException catch (error) {
      if (error.response?.statusCode case 400 || 401) {
        throw const AuthApiException(
          AuthApiFailure.invalidRefresh,
          'Your session has expired. Please sign in again.',
        );
      }
      throw _networkFailure;
    } on AuthApiException {
      rethrow;
    } on Object {
      throw _invalidResponse;
    }
  }

  Options _commandOptions(String idempotencyKey) => Options(
    headers: {'Idempotency-Key': idempotencyKey},
    contentType: Headers.jsonContentType,
  );

  AuthTokens _tokens(Object? data) {
    final body = _body(data);
    return AuthTokens(
      accessToken: _string(body, 'accessToken'),
      accessExpiresAt: _dateTime(body, 'accessExpiresAt'),
      refreshToken: _string(body, 'refreshToken'),
      refreshExpiresAt: _dateTime(body, 'refreshExpiresAt'),
    );
  }

  Map<String, Object?> _body(Object? data) {
    if (data is! Map) {
      throw _invalidResponse;
    }
    return data.map((key, value) => MapEntry(key.toString(), value));
  }

  String _string(Map<String, Object?> body, String key) {
    final value = body[key];
    if (value is! String || value.isEmpty) {
      throw _invalidResponse;
    }
    return value;
  }

  DateTime _dateTime(Map<String, Object?> body, String key) {
    final value = _string(body, key);
    return DateTime.parse(value).toUtc();
  }
}

const _networkFailure = AuthApiException(
  AuthApiFailure.network,
  'Unable to connect. Check your connection and try again.',
);

const _invalidResponse = AuthApiException(
  AuthApiFailure.invalidResponse,
  'The server returned an unexpected response. Please try again.',
);

final authApiProvider = Provider<AuthApi>(
  (ref) => DioAuthApi(ref.watch(apiClientProvider)),
);
