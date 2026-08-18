import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:slow_dating/core/api/api_client.dart';

void main() {
  test('uses the Android emulator API URL by default', () {
    final client = createApiClient();
    const expectedBaseUrl = bool.hasEnvironment('API_BASE_URL')
        ? String.fromEnvironment('API_BASE_URL')
        : 'http://10.0.2.2:3000/v1';

    expect(client.options.baseUrl, expectedBaseUrl);
  });

  test('accepts an injected API base URL', () {
    final client = createApiClient(baseUrl: 'https://api.example.test/v1');

    expect(client.options.baseUrl, 'https://api.example.test/v1');
  });

  test('Android permits the default emulator HTTP API', () {
    final mainManifest = File('android/app/src/main/AndroidManifest.xml')
        .readAsStringSync();
    final debugManifest = File('android/app/src/debug/AndroidManifest.xml')
        .readAsStringSync();

    expect(
      mainManifest,
      contains('android.permission.INTERNET'),
      reason: 'API calls need network permission in packaged Android apps.',
    );
    expect(
      debugManifest,
      contains('android:usesCleartextTraffic="true"'),
      reason: 'The emulator development API URL uses HTTP.',
    );
  });
}
