import 'package:flutter_test/flutter_test.dart';
import 'package:slow_dating/core/auth/auth_session_store.dart';

void main() {
  test('persists and reads only the refresh token', () async {
    final storage = MemorySecureStorageAdapter();
    final store = AuthSessionStore(storage);

    await store.saveRefreshToken('refresh-secret');

    expect(await store.readRefreshToken(), 'refresh-secret');
    expect(storage.values, {
      AuthSessionStore.refreshTokenKey: 'refresh-secret',
    });
  });

  test('clears the persisted refresh token', () async {
    final storage = MemorySecureStorageAdapter();
    final store = AuthSessionStore(storage);
    await store.saveRefreshToken('refresh-secret');

    await store.clearRefreshToken();

    expect(await store.readRefreshToken(), isNull);
    expect(storage.values, isEmpty);
  });
}

final class MemorySecureStorageAdapter implements SecureStorageAdapter {
  final Map<String, String> values = {};

  @override
  Future<void> delete({required String key}) async {
    values.remove(key);
  }

  @override
  Future<String?> read({required String key}) async => values[key];

  @override
  Future<void> write({required String key, required String value}) async {
    values[key] = value;
  }
}
