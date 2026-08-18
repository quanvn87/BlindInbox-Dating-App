import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class SecureStorageAdapter {
  Future<String?> read({required String key});

  Future<void> write({required String key, required String value});

  Future<void> delete({required String key});
}

final class FlutterSecureStorageAdapter implements SecureStorageAdapter {
  const FlutterSecureStorageAdapter([
    this._storage = const FlutterSecureStorage(),
  ]);

  final FlutterSecureStorage _storage;

  @override
  Future<void> delete({required String key}) => _storage.delete(key: key);

  @override
  Future<String?> read({required String key}) => _storage.read(key: key);

  @override
  Future<void> write({required String key, required String value}) =>
      _storage.write(key: key, value: value);
}

final class AuthSessionStore {
  const AuthSessionStore(this._storage);

  static const refreshTokenKey = 'refresh_token';

  final SecureStorageAdapter _storage;

  Future<String?> readRefreshToken() => _storage.read(key: refreshTokenKey);

  Future<void> saveRefreshToken(String refreshToken) =>
      _storage.write(key: refreshTokenKey, value: refreshToken);

  Future<void> clearRefreshToken() => _storage.delete(key: refreshTokenKey);
}

final secureStorageAdapterProvider = Provider<SecureStorageAdapter>(
  (ref) => const FlutterSecureStorageAdapter(),
);

final authSessionStoreProvider = Provider<AuthSessionStore>(
  (ref) => AuthSessionStore(ref.watch(secureStorageAdapterProvider)),
);
