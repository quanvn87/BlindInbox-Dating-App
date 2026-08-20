import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Android application backup is disabled for secure token storage', () {
    final manifest = File('android/app/src/main/AndroidManifest.xml')
        .readAsStringSync();
    final applicationTag = RegExp(
      r'<application\b[^>]*\bandroid:allowBackup="false"',
      multiLine: true,
    );

    expect(
      manifest,
      matches(applicationTag),
      reason:
          'flutter_secure_storage ciphertext must not be restored without '
          'its Android Keystore key.',
    );
  });
}
