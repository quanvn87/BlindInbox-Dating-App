import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:slow_dating/features/auth/data/auth_api.dart';

void main() {
  test(
    'request OTP sends the documented shape and parses 202 metadata',
    () async {
      const commandId = '00000000-0000-4000-8000-000000000001';
      late RequestOptions captured;
      final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
        ..httpClientAdapter = StubAdapter((options) {
          captured = options;
          return jsonResponse(202, {
            'challengeId': 'challenge-id',
            'expiresAt': '2030-01-01T00:01:00.000Z',
          });
        });
      final api = DioAuthApi(dio);

      final result = await api.requestOtp(
        phone: '0901234567',
        idempotencyKey: commandId,
      );

      expect(captured.path, '/auth/otp/request');
      expect(captured.headers['Idempotency-Key'], commandId);
      expect(captured.data, {'phone': '0901234567'});
      expect(result.challengeId, 'challenge-id');
      expect(result.expiresAt, DateTime.utc(2030, 1, 1, 0, 1));
    },
  );

  test(
    'verify OTP sends the documented shape and parses all token fields',
    () async {
      late RequestOptions captured;
      final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
        ..httpClientAdapter = StubAdapter((options) {
          captured = options;
          return jsonResponse(200, tokenResponse());
        });
      final api = DioAuthApi(dio);

      final result = await api.verifyOtp(
        challengeId: 'challenge-id',
        code: List.generate(6, (index) => index + 1).join(),
        deviceName: 'Test device',
        idempotencyKey: '00000000-0000-4000-8000-000000000002',
      );

      expect(captured.path, '/auth/otp/verify');
      expect(
        captured.headers['Idempotency-Key'],
        '00000000-0000-4000-8000-000000000002',
      );
      expect(captured.data, {
        'challengeId': 'challenge-id',
        'code': List.generate(6, (index) => index + 1).join(),
        'deviceName': 'Test device',
      });
      expect(result.accessExpiresAt, DateTime.utc(2030, 1, 1, 1));
      expect(result.refreshExpiresAt, DateTime.utc(2030, 2));
    },
  );

  test('refresh sends the persisted credential with a command id', () async {
    late RequestOptions captured;
    final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
      ..httpClientAdapter = StubAdapter((options) {
        captured = options;
        return jsonResponse(200, tokenResponse());
      });
    final api = DioAuthApi(dio);

    await api.refresh(
      refreshToken: 'persisted-refresh-token',
      idempotencyKey: '00000000-0000-4000-8000-000000000003',
    );

    expect(captured.path, '/auth/refresh');
    expect(captured.data, {'refreshToken': 'persisted-refresh-token'});
    expect(
      captured.headers['Idempotency-Key'],
      '00000000-0000-4000-8000-000000000003',
    );
  });

  test(
    'maps an inactive account response without leaking server detail',
    () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
        ..httpClientAdapter = StubAdapter(
          (_) => jsonResponse(403, {'message': 'sensitive server detail'}),
        );
      final api = DioAuthApi(dio);

      await expectLater(
        api.verifyOtp(
          challengeId: 'challenge-id',
          code: List.generate(6, (index) => index + 1).join(),
          deviceName: 'Test device',
          idempotencyKey: '00000000-0000-4000-8000-000000000006',
        ),
        throwsA(
          isA<AuthApiException>()
              .having(
                (error) => error.kind,
                'kind',
                AuthApiFailure.inactiveAccount,
              )
              .having(
                (error) => error.toString(),
                'redacted diagnostics',
                isNot(contains('sensitive server detail')),
              ),
        ),
      );
    },
  );

  test('maps invalid refresh without leaking response content', () async {
    final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
      ..httpClientAdapter = StubAdapter(
        (_) => jsonResponse(401, {'message': 'sensitive server detail'}),
      );
    final api = DioAuthApi(dio);

    await expectLater(
      api.refresh(
        refreshToken: 'persisted-refresh-token',
        idempotencyKey: '00000000-0000-4000-8000-000000000004',
      ),
      throwsA(
        isA<AuthApiException>()
            .having(
              (error) => error.kind,
              'kind',
              AuthApiFailure.invalidRefresh,
            )
            .having(
              (error) => error.toString(),
              'redacted diagnostics',
              isNot(contains('sensitive server detail')),
            ),
      ),
    );
  });

  test('treats a rejected refresh request as an invalid credential', () async {
    final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
      ..httpClientAdapter = StubAdapter(
        (_) => jsonResponse(400, {'message': 'invalid request'}),
      );
    final api = DioAuthApi(dio);

    await expectLater(
      api.refresh(
        refreshToken: 'malformed-persisted-credential',
        idempotencyKey: '00000000-0000-4000-8000-000000000005',
      ),
      throwsA(
        isA<AuthApiException>().having(
          (error) => error.kind,
          'kind',
          AuthApiFailure.invalidRefresh,
        ),
      ),
    );
  });
}

Map<String, Object> tokenResponse() => {
  'accessToken': 'access-token',
  'accessExpiresAt': '2030-01-01T01:00:00.000Z',
  'refreshToken': 'refresh-token',
  'refreshExpiresAt': '2030-02-01T00:00:00.000Z',
};

ResponseBody jsonResponse(int statusCode, Object body) =>
    ResponseBody.fromString(
      jsonEncode(body),
      statusCode,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

final class StubAdapter implements HttpClientAdapter {
  StubAdapter(this.handler);

  final ResponseBody Function(RequestOptions options) handler;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => handler(options);
}
