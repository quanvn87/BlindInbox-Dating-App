import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:blind_inbox/core/auth/auth_session.dart';

void main() {
  test('extracts a stable non-persistent user identity from JWT sub', () {
    final token = _jwt({'sub': 'user-123', 'sessionId': 'session-1'});

    expect(accessTokenSubject(token), 'user-123');
  });

  test('rejects malformed identity claims without echoing the token', () {
    const malformed = 'header.payload.signature-sensitive';

    expect(
      () => accessTokenSubject(malformed),
      throwsA(
        isA<FormatException>().having(
          (error) => error.toString(),
          'redacted error',
          isNot(contains(malformed)),
        ),
      ),
    );
  });
}

String _jwt(Map<String, Object?> payload) =>
    '${base64Url.encode(utf8.encode('{}')).replaceAll('=', '')}.'
    '${base64Url.encode(utf8.encode(jsonEncode(payload))).replaceAll('=', '')}.'
    'signature';
