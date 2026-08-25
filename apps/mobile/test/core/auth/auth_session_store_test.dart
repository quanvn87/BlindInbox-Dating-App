import 'dart:async';

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

  test('a mutation waits for an in-flight refresh-token read', () async {
    final storage = MemorySecureStorageAdapter()
      ..values[AuthSessionStore.refreshTokenKey] = 'older-refresh-token'
      ..readStarted = Completer<void>()
      ..readCompleter = Completer<void>();
    final store = AuthSessionStore(storage);

    final olderRead = store.readRefreshToken();
    await storage.readStarted!.future;
    var newerSaveCompleted = false;
    final newerSave = store.saveRefreshToken('newer-refresh-token').then((_) {
      newerSaveCompleted = true;
    });
    await Future<void>.delayed(Duration.zero);

    expect(newerSaveCompleted, isFalse);
    storage.readCompleter!.complete();
    expect(await olderRead, 'older-refresh-token');
    await newerSave;
    expect(await store.readRefreshToken(), 'newer-refresh-token');
  });
}

final class MemorySecureStorageAdapter implements SecureStorageAdapter {
  final Map<String, String> values = {};
  Completer<void>? readCompleter;
  Completer<void>? readStarted;

  @override
  Future<void> delete({required String key}) async {
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
    return value;
  }

  @override
  Future<void> write({required String key, required String value}) async {
    values[key] = value;
  }
}
