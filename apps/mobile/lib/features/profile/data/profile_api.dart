import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:blind_inbox/core/api/api_client.dart';
import 'package:blind_inbox/core/auth/auth_session.dart';
import 'package:blind_inbox/core/auth/auth_session_store.dart';
import 'package:blind_inbox/features/auth/data/auth_api.dart';
import 'package:blind_inbox/features/profile/domain/profile_models.dart';

abstract interface class ProfileApi {
  Future<ProfileCatalog> getCatalog();

  Future<ProfileInput?> getProfile({required String accessToken});

  Future<ProfileInput> putProfile({
    required String accessToken,
    required String idempotencyKey,
    required ProfileInput input,
  });
}

enum ProfileApiFailure {
  underage,
  invalidProfile,
  unauthorized,
  network,
  invalidResponse,
}

final class ProfileApiException implements Exception {
  const ProfileApiException(this.kind, this.userMessage);

  final ProfileApiFailure kind;
  final String userMessage;

  @override
  String toString() => 'ProfileApiException(kind: $kind)';
}

final class DioProfileApi implements ProfileApi {
  const DioProfileApi(this._client, {this.refreshCoordinator});

  final Dio _client;
  final ProfileRefreshCoordinator? refreshCoordinator;

  @override
  Future<ProfileCatalog> getCatalog() async {
    try {
      final response = await _client.get<Object?>('/catalog/profile-options');
      return ProfileCatalog.fromJson(response.data);
    } on DioException {
      throw _catalogNetworkFailure;
    } on ProfileApiException {
      rethrow;
    } on Object {
      throw _invalidResponse;
    }
  }

  @override
  Future<ProfileInput?> getProfile({required String accessToken}) {
    return _authenticated(
      accessToken,
      (currentAccessToken) => _getProfile(currentAccessToken),
    );
  }

  Future<ProfileInput?> _getProfile(String accessToken) async {
    try {
      final response = await _client.get<Object?>(
        '/me/profile',
        options: _bearerOptions(accessToken),
      );
      return ProfileInput.fromJson(response.data);
    } on DioException catch (error) {
      if (error.response?.statusCode == 404) {
        return null;
      }
      if (error.response?.statusCode == 401) {
        throw _unauthorized;
      }
      throw _profileResolutionNetworkFailure;
    } on ProfileApiException {
      rethrow;
    } on Object {
      throw _invalidResponse;
    }
  }

  @override
  Future<ProfileInput> putProfile({
    required String accessToken,
    required String idempotencyKey,
    required ProfileInput input,
  }) {
    return _authenticated(
      accessToken,
      (currentAccessToken) => _putProfile(
        accessToken: currentAccessToken,
        idempotencyKey: idempotencyKey,
        input: input,
      ),
    );
  }

  Future<ProfileInput> _putProfile({
    required String accessToken,
    required String idempotencyKey,
    required ProfileInput input,
  }) async {
    try {
      final response = await _client.put<Object?>(
        '/me/profile',
        data: input.toJson(),
        options: _bearerOptions(accessToken, idempotencyKey: idempotencyKey),
      );
      return ProfileInput.fromJson(response.data);
    } on DioException catch (error) {
      if (error.response?.statusCode == 401) {
        throw _unauthorized;
      }
      if (error.response?.statusCode == 400) {
        if (_containsErrorCode(error.response?.data, 'PROFILE_UNDERAGE')) {
          throw _underage;
        }
        throw _invalidProfile;
      }
      throw _saveNetworkFailure;
    } on ProfileApiException {
      rethrow;
    } on Object {
      throw _invalidResponse;
    }
  }

  Future<T> _authenticated<T>(
    String accessToken,
    Future<T> Function(String accessToken) request,
  ) {
    final coordinator = refreshCoordinator;
    if (coordinator == null) {
      return request(accessToken);
    }
    return coordinator.execute(accessToken: accessToken, request: request);
  }

  Options _bearerOptions(String accessToken, {String? idempotencyKey}) {
    final headers = <String, Object?>{'Authorization': 'Bearer $accessToken'};
    if (idempotencyKey != null) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    return Options(headers: headers, contentType: Headers.jsonContentType);
  }

  bool _containsErrorCode(Object? value, String expected) {
    if (value is Map) {
      if (value['code'] == expected) {
        return true;
      }
      return value.values.any((child) => _containsErrorCode(child, expected));
    }
    if (value is List) {
      return value.any((child) => _containsErrorCode(child, expected));
    }
    return false;
  }
}

typedef ProfileRefreshIdGenerator = String Function();

final class ProfileRefreshCoordinator {
  ProfileRefreshCoordinator({
    required this.authApi,
    required this.sessionStore,
    required this.sessionController,
    ProfileRefreshIdGenerator? generateId,
  }) : _generateId = generateId ?? generateProfileRefreshCommandId;

  final AuthApi authApi;
  final AuthSessionStore sessionStore;
  final AuthSessionController sessionController;
  final ProfileRefreshIdGenerator _generateId;

  ({int generation, String userId, String accessToken, Future<String> future})?
  _refreshInFlight;
  ({int fromGeneration, int toGeneration, String userId})?
  _lastRefreshTransition;

  Future<T> execute<T>({
    required String accessToken,
    required Future<T> Function(String accessToken) request,
  }) async {
    final initialGeneration = sessionController.generation;
    final initialUserId = sessionController.value.userId;
    try {
      return await request(accessToken);
    } on ProfileApiException catch (error) {
      if (error.kind != ProfileApiFailure.unauthorized) {
        rethrow;
      }
    }

    late final String requestUserId;
    try {
      requestUserId = accessTokenSubject(accessToken);
    } on FormatException {
      throw _unauthorized;
    }
    final currentSession = sessionController.value;
    final currentAccessToken = currentSession.accessToken;
    if (initialUserId == null ||
        initialUserId != requestUserId ||
        currentAccessToken == null ||
        currentSession.userId != requestUserId) {
      throw _unauthorized;
    }
    if (currentAccessToken != accessToken) {
      final transition = _lastRefreshTransition;
      if (transition == null ||
          transition.fromGeneration != initialGeneration ||
          transition.toGeneration != sessionController.generation ||
          transition.userId != requestUserId) {
        throw _unauthorized;
      }
      try {
        if (accessTokenSubject(currentAccessToken) != requestUserId) {
          throw _unauthorized;
        }
      } on FormatException {
        throw _unauthorized;
      }
      return request(currentAccessToken);
    }
    if (sessionController.generation != initialGeneration) {
      throw _unauthorized;
    }
    final retryAccessToken = await _singleFlightRefresh(
      generation: initialGeneration,
      userId: initialUserId,
      accessToken: accessToken,
    );
    return request(retryAccessToken);
  }

  Future<String> _singleFlightRefresh({
    required int generation,
    required String userId,
    required String accessToken,
  }) {
    final existing = _refreshInFlight;
    if (existing != null &&
        existing.generation == generation &&
        existing.userId == userId &&
        existing.accessToken == accessToken) {
      return existing.future;
    }

    final created = _refresh(
      generation: generation,
      userId: userId,
      accessToken: accessToken,
    );
    _refreshInFlight = (
      generation: generation,
      userId: userId,
      accessToken: accessToken,
      future: created,
    );
    return created.whenComplete(() {
      if (identical(_refreshInFlight?.future, created)) {
        _refreshInFlight = null;
      }
    });
  }

  Future<String> _refresh({
    required int generation,
    required String userId,
    required String accessToken,
  }) async {
    void requireCurrentSession() {
      final session = sessionController.value;
      if (sessionController.generation != generation ||
          session.userId != userId ||
          session.accessToken != accessToken) {
        throw _unauthorized;
      }
    }

    requireCurrentSession();
    late final String? refreshToken;
    try {
      refreshToken = await sessionStore.readRefreshToken();
    } on Object {
      throw _refreshNetworkFailure;
    }
    if (refreshToken == null || refreshToken.isEmpty) {
      throw _unauthorized;
    }
    requireCurrentSession();

    late final AuthTokens tokens;
    try {
      tokens = await authApi.refresh(
        refreshToken: refreshToken,
        idempotencyKey: _generateId(),
      );
    } on AuthApiException catch (error) {
      if (error.kind == AuthApiFailure.invalidRefresh) {
        requireCurrentSession();
        try {
          await sessionStore.clearRefreshToken();
        } on Object {
          // The memory session must still be invalidated.
        }
        requireCurrentSession();
        sessionController.signOut();
        throw _unauthorized;
      }
      throw _refreshNetworkFailure;
    } on Object {
      throw _refreshNetworkFailure;
    }

    requireCurrentSession();
    String refreshedUserId;
    try {
      refreshedUserId = accessTokenSubject(tokens.accessToken);
    } on FormatException {
      throw _invalidResponse;
    }
    if (refreshedUserId != userId) {
      throw _invalidResponse;
    }
    try {
      await sessionStore.saveRefreshToken(tokens.refreshToken);
    } on Object {
      throw _refreshNetworkFailure;
    }
    requireCurrentSession();
    sessionController.replaceAccessToken(tokens.accessToken);
    _lastRefreshTransition = (
      fromGeneration: generation,
      toGeneration: sessionController.generation,
      userId: userId,
    );
    return tokens.accessToken;
  }
}

String generateProfileRefreshCommandId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes
      .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
      .join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-'
      '${hex.substring(20)}';
}

const _underage = ProfileApiException(
  ProfileApiFailure.underage,
  'You must be at least 18 years old to use BlindInbox.',
);

const _invalidProfile = ProfileApiException(
  ProfileApiFailure.invalidProfile,
  'Check your profile details and try again.',
);

const _unauthorized = ProfileApiException(
  ProfileApiFailure.unauthorized,
  'Your session has expired. Please sign in again.',
);

const _catalogNetworkFailure = ProfileApiException(
  ProfileApiFailure.network,
  'Unable to load profile options. Check your connection and try again.',
);

const _profileResolutionNetworkFailure = ProfileApiException(
  ProfileApiFailure.network,
  'Unable to resolve your profile. Check your connection and try again.',
);

const _saveNetworkFailure = ProfileApiException(
  ProfileApiFailure.network,
  'Unable to save your profile. Check your connection and try again.',
);

const _refreshNetworkFailure = ProfileApiException(
  ProfileApiFailure.network,
  'Unable to refresh your session. Check your connection and try again.',
);

const _invalidResponse = ProfileApiException(
  ProfileApiFailure.invalidResponse,
  'The server returned an unexpected response. Please try again.',
);

final profileApiProvider = Provider<ProfileApi>((ref) {
  return DioProfileApi(
    ref.watch(apiClientProvider),
    refreshCoordinator: ProfileRefreshCoordinator(
      authApi: ref.watch(authApiProvider),
      sessionStore: ref.watch(authSessionStoreProvider),
      sessionController: ref.read(authSessionControllerProvider),
    ),
  );
});
