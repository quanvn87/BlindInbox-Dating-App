import 'dart:async';
import 'dart:convert';

import 'package:slow_dating/core/auth/auth_session_store.dart';
import 'package:slow_dating/features/auth/data/auth_api.dart';

final class FakeAuthApi implements AuthApi {
  DateTime expiresAt = DateTime.utc(2030, 1, 1, 0, 1);
  AuthTokens tokens = AuthTokens(
    accessToken: fakeAccessToken(),
    accessExpiresAt: DateTime.utc(2030, 1, 1, 1),
    refreshToken: 'refresh-token-from-fake',
    refreshExpiresAt: DateTime.utc(2030, 2),
  );
  AuthApiException? requestFailure;
  AuthApiException? verifyFailure;
  AuthApiException? refreshFailure;
  Completer<OtpChallenge>? requestCompleter;
  Completer<AuthTokens>? verifyCompleter;
  Completer<AuthTokens>? refreshCompleter;

  final List<({String phone, String idempotencyKey})> requests = [];
  final List<
    ({
      String challengeId,
      String code,
      String deviceName,
      String idempotencyKey,
    })
  >
  verifications = [];
  final List<({String refreshToken, String idempotencyKey})> refreshes = [];

  late String deliveredCode;

  @override
  Future<OtpChallenge> requestOtp({
    required String phone,
    required String idempotencyKey,
  }) async {
    requests.add((phone: phone, idempotencyKey: idempotencyKey));
    final failure = requestFailure;
    if (failure != null) {
      throw failure;
    }

    deliveredCode = List.generate(
      6,
      (index) => (index + requests.length).remainder(10),
    ).join();
    final completer = requestCompleter;
    if (completer != null) {
      return completer.future;
    }
    return OtpChallenge(
      challengeId: 'challenge-${requests.length}',
      expiresAt: expiresAt,
    );
  }

  @override
  Future<AuthTokens> verifyOtp({
    required String challengeId,
    required String code,
    required String deviceName,
    required String idempotencyKey,
  }) async {
    verifications.add((
      challengeId: challengeId,
      code: code,
      deviceName: deviceName,
      idempotencyKey: idempotencyKey,
    ));
    final failure = verifyFailure;
    if (failure != null) {
      throw failure;
    }
    if (code != deliveredCode) {
      throw const AuthApiException(
        AuthApiFailure.invalidOrExpiredCode,
        'The code is incorrect or has expired.',
      );
    }
    final completer = verifyCompleter;
    if (completer != null) {
      return completer.future;
    }
    return tokens;
  }

  @override
  Future<AuthTokens> refresh({
    required String refreshToken,
    required String idempotencyKey,
  }) async {
    refreshes.add((refreshToken: refreshToken, idempotencyKey: idempotencyKey));
    final failure = refreshFailure;
    if (failure != null) {
      throw failure;
    }
    final completer = refreshCompleter;
    if (completer != null) {
      return completer.future;
    }
    return tokens;
  }
}

String fakeAccessToken({String userId = 'fake-user'}) {
  final header = base64Url.encode(utf8.encode('{}')).replaceAll('=', '');
  final payload = base64Url
      .encode(utf8.encode(jsonEncode({'sub': userId})))
      .replaceAll('=', '');
  return '$header.$payload.signature';
}

final class MemorySecureStorageAdapter implements SecureStorageAdapter {
  final Map<String, String> values = {};
  Object? readFailure;
  Object? writeFailure;
  Object? deleteFailure;
  Completer<void>? readCompleter;
  Completer<void>? readStarted;
  Completer<void>? writeCompleter;
  Completer<void>? writeStarted;

  @override
  Future<void> delete({required String key}) async {
    final failure = deleteFailure;
    if (failure != null) {
      throw failure;
    }
    values.remove(key);
  }

  @override
  Future<String?> read({required String key}) async {
    final value = values[key];
    final started = readStarted;
    if (started != null && !started.isCompleted) {
      started.complete();
    }
    final completer = readCompleter;
    if (completer != null) {
      await completer.future;
    }
    final failure = readFailure;
    if (failure != null) {
      throw failure;
    }
    return value;
  }

  @override
  Future<void> write({required String key, required String value}) async {
    final started = writeStarted;
    if (started != null && !started.isCompleted) {
      started.complete();
    }
    final completer = writeCompleter;
    if (completer != null) {
      await completer.future;
    }
    final failure = writeFailure;
    if (failure != null) {
      throw failure;
    }
    values[key] = value;
  }
}
