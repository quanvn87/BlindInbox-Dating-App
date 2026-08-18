import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:slow_dating/core/api/api_client.dart';
import 'package:slow_dating/features/profile/domain/profile_models.dart';

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
  const DioProfileApi(this._client);

  final Dio _client;

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
  Future<ProfileInput?> getProfile({required String accessToken}) async {
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

const _underage = ProfileApiException(
  ProfileApiFailure.underage,
  'You must be at least 18 years old to use Slow Dating.',
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

const _invalidResponse = ProfileApiException(
  ProfileApiFailure.invalidResponse,
  'The server returned an unexpected response. Please try again.',
);

final profileApiProvider = Provider<ProfileApi>(
  (ref) => DioProfileApi(ref.watch(apiClientProvider)),
);
