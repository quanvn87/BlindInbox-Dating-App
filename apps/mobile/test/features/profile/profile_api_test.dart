import 'dart:convert';
import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:blind_inbox/core/auth/auth_session.dart';
import 'package:blind_inbox/core/auth/auth_session_store.dart';
import 'package:blind_inbox/features/auth/data/auth_api.dart';
import 'package:blind_inbox/features/profile/data/profile_api.dart';

import '../auth/support/fake_auth_api.dart' show MemorySecureStorageAdapter;
import 'support/fake_profile_api.dart';

void main() {
  const commandId = '00000000-0000-4000-8000-000000000001';

  test(
    '401 refreshes, rotates storage, and retries PUT with the same key',
    () async {
      final requests = <RequestOptions>[];
      final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
        ..httpClientAdapter = AsyncStubAdapter((options) async {
          requests.add(options);
          if (options.headers['Authorization'] ==
              'Bearer ${testAccessToken('profile-api-user', 'old')}') {
            return jsonResponse(401, {'message': 'expired'});
          }
          return jsonResponse(200, completeProfileInput.toJson());
        });
      final harness = await createHarness(dio);

      await harness.api.putProfile(
        accessToken: testAccessToken('profile-api-user', 'old'),
        idempotencyKey: commandId,
        input: completeProfileInput,
      );

      expect(requests, hasLength(2));
      expect(requests.map((request) => request.headers['Idempotency-Key']), [
        commandId,
        commandId,
      ]);
      expect(
        requests.last.headers['Authorization'],
        'Bearer ${testAccessToken('profile-api-user', 'new')}',
      );
      expect(harness.authApi.refreshCount, 1);
      expect(await harness.store.readRefreshToken(), 'new-refresh');
      expect(
        harness.session.value.accessToken,
        testAccessToken('profile-api-user', 'new'),
      );
    },
  );

  test('concurrent authenticated calls share one refresh', () async {
    final requests = <RequestOptions>[];
    final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
      ..httpClientAdapter = AsyncStubAdapter((options) async {
        requests.add(options);
        if (options.headers['Authorization'] ==
            'Bearer ${testAccessToken('profile-api-user', 'old')}') {
          return jsonResponse(401, {'message': 'expired'});
        }
        return jsonResponse(200, completeProfileInput.toJson());
      });
    final harness = await createHarness(dio);

    await Future.wait([
      harness.api.getProfile(
        accessToken: testAccessToken('profile-api-user', 'old'),
      ),
      harness.api.putProfile(
        accessToken: testAccessToken('profile-api-user', 'old'),
        idempotencyKey: commandId,
        input: completeProfileInput,
      ),
    ]);

    expect(harness.authApi.refreshCount, 1);
    expect(requests, hasLength(4));
  });

  test('a retried request is attempted exactly once', () async {
    var profileRequests = 0;
    final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
      ..httpClientAdapter = AsyncStubAdapter((options) async {
        profileRequests += 1;
        return jsonResponse(401, {'message': 'still unauthorized'});
      });
    final harness = await createHarness(dio);

    await expectLater(
      harness.api.getProfile(
        accessToken: testAccessToken('profile-api-user', 'old'),
      ),
      throwsA(
        isA<ProfileApiException>().having(
          (error) => error.kind,
          'kind',
          ProfileApiFailure.unauthorized,
        ),
      ),
    );

    expect(profileRequests, 2);
    expect(harness.authApi.refreshCount, 1);
    expect(harness.session.value.isAuthenticated, isTrue);
  });

  test(
    'network refresh failure preserves storage and memory session',
    () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
        ..httpClientAdapter = AsyncStubAdapter(
          (_) async => jsonResponse(401, {'message': 'expired'}),
        );
      final harness = await createHarness(dio);
      harness.authApi.refreshFailure = const AuthApiException(
        AuthApiFailure.network,
        'Unable to connect. Check your connection and try again.',
      );

      await expectLater(
        harness.api.getProfile(
          accessToken: testAccessToken('profile-api-user', 'old'),
        ),
        throwsA(isA<ProfileApiException>()),
      );

      expect(await harness.store.readRefreshToken(), 'old-refresh');
      expect(
        harness.session.value.accessToken,
        testAccessToken('profile-api-user', 'old'),
      );
    },
  );

  test(
    'invalid refresh clears storage and memory without token leakage',
    () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
        ..httpClientAdapter = AsyncStubAdapter(
          (_) async => jsonResponse(401, {'message': 'expired'}),
        );
      final harness = await createHarness(dio);
      harness.authApi.refreshFailure = const AuthApiException(
        AuthApiFailure.invalidRefresh,
        'Your session has expired. Please sign in again.',
      );

      Object? captured;
      try {
        await harness.api.getProfile(
          accessToken: testAccessToken('profile-api-user', 'old'),
        );
      } on Object catch (error) {
        captured = error;
      }

      expect(captured, isA<ProfileApiException>());
      expect(
        captured.toString(),
        isNot(contains(testAccessToken('profile-api-user', 'old'))),
      );
      expect(captured.toString(), isNot(contains('old-refresh')));
      expect(await harness.store.readRefreshToken(), isNull);
      expect(harness.session.value.isAuthenticated, isFalse);
    },
  );

  test(
    'a late refresh cannot overwrite a replacement account session',
    () async {
      final refreshResult = Completer<AuthTokens>();
      final refreshStarted = Completer<void>();
      final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
        ..httpClientAdapter = AsyncStubAdapter(
          (_) async => jsonResponse(401, {'message': 'expired'}),
        );
      final harness = await createHarness(dio);
      harness.authApi.onRefresh = () {
        if (!refreshStarted.isCompleted) {
          refreshStarted.complete();
        }
        return refreshResult.future;
      };

      final staleRequest = harness.api.getProfile(
        accessToken: testAccessToken('profile-api-user', 'old'),
      );
      await refreshStarted.future;
      await harness.store.saveRefreshToken('account-b-refresh');
      harness.session.authenticate(
        accessToken: 'account-b-access',
        userId: 'account-b',
        isProfileComplete: false,
      );
      refreshResult.complete(
        AuthTokens(
          accessToken: testAccessToken('profile-api-user', 'late-account-a'),
          accessExpiresAt: DateTime.utc(2030),
          refreshToken: 'late-account-a-refresh',
          refreshExpiresAt: DateTime.utc(2030, 2),
        ),
      );

      await expectLater(staleRequest, throwsA(isA<ProfileApiException>()));
      expect(await harness.store.readRefreshToken(), 'account-b-refresh');
      expect(harness.session.value.userId, 'account-b');
      expect(harness.session.value.accessToken, 'account-b-access');
    },
  );

  test(
    'a refresh completing after sign-out cannot restore the session',
    () async {
      final refreshResult = Completer<AuthTokens>();
      final refreshStarted = Completer<void>();
      final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
        ..httpClientAdapter = AsyncStubAdapter(
          (_) async => jsonResponse(401, {'message': 'expired'}),
        );
      final harness = await createHarness(dio);
      harness.authApi.onRefresh = () {
        if (!refreshStarted.isCompleted) {
          refreshStarted.complete();
        }
        return refreshResult.future;
      };

      final staleRequest = harness.api.getProfile(
        accessToken: testAccessToken('profile-api-user', 'old'),
      );
      await refreshStarted.future;
      harness.session.signOut();
      refreshResult.complete(
        AuthTokens(
          accessToken: testAccessToken('profile-api-user', 'late'),
          accessExpiresAt: DateTime.utc(2030),
          refreshToken: 'late-refresh',
          refreshExpiresAt: DateTime.utc(2030, 2),
        ),
      );

      await expectLater(staleRequest, throwsA(isA<ProfileApiException>()));
      expect(harness.session.value.isAuthenticated, isFalse);
      expect(await harness.store.readRefreshToken(), 'old-refresh');
    },
  );

  test('rejects a refreshed access token for a different subject', () async {
    final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
      ..httpClientAdapter = AsyncStubAdapter(
        (_) async => jsonResponse(401, {'message': 'expired'}),
      );
    final harness = await createHarness(dio);
    harness.authApi.onRefresh = () async => AuthTokens(
      accessToken: testAccessToken('different-user', 'wrong-subject'),
      accessExpiresAt: DateTime.utc(2030),
      refreshToken: 'different-user-refresh',
      refreshExpiresAt: DateTime.utc(2030, 2),
    );

    await expectLater(
      harness.api.getProfile(
        accessToken: testAccessToken('profile-api-user', 'old'),
      ),
      throwsA(
        isA<ProfileApiException>().having(
          (error) => error.kind,
          'kind',
          ProfileApiFailure.invalidResponse,
        ),
      ),
    );
    expect(await harness.store.readRefreshToken(), 'old-refresh');
    expect(
      harness.session.value.accessToken,
      testAccessToken('profile-api-user', 'old'),
    );
  });

  test('a stale 401 never retries with a different account token', () async {
    final releaseResponse = Completer<void>();
    final firstRequestStarted = Completer<void>();
    final requests = <RequestOptions>[];
    final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
      ..httpClientAdapter = AsyncStubAdapter((options) async {
        requests.add(options);
        if (!firstRequestStarted.isCompleted) {
          firstRequestStarted.complete();
        }
        await releaseResponse.future;
        return jsonResponse(401, {'message': 'expired'});
      });
    final harness = await createHarness(dio);

    final staleRequest = harness.api.getProfile(
      accessToken: testAccessToken('profile-api-user', 'old'),
    );
    await firstRequestStarted.future;
    harness.session.authenticate(
      accessToken: 'account-b-access',
      userId: 'account-b',
      isProfileComplete: false,
    );
    releaseResponse.complete();

    await expectLater(staleRequest, throwsA(isA<ProfileApiException>()));
    expect(requests, hasLength(1));
    expect(harness.authApi.refreshCount, 0);
  });

  test('a request token for another subject is never substituted', () async {
    var requestCount = 0;
    final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
      ..httpClientAdapter = AsyncStubAdapter((_) async {
        requestCount += 1;
        return jsonResponse(401, {'message': 'expired'});
      });
    final harness = await createHarness(dio);

    await expectLater(
      harness.api.getProfile(
        accessToken: testAccessToken('account-b', 'initially-mismatched'),
      ),
      throwsA(isA<ProfileApiException>()),
    );

    expect(requestCount, 1);
    expect(harness.authApi.refreshCount, 0);
  });

  test('same-user reauthentication does not authorize a stale retry', () async {
    final releaseResponse = Completer<void>();
    final firstRequestStarted = Completer<void>();
    var requestCount = 0;
    final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'))
      ..httpClientAdapter = AsyncStubAdapter((_) async {
        requestCount += 1;
        if (!firstRequestStarted.isCompleted) {
          firstRequestStarted.complete();
        }
        await releaseResponse.future;
        return jsonResponse(401, {'message': 'expired'});
      });
    final harness = await createHarness(dio);
    final staleRequest = harness.api.getProfile(
      accessToken: testAccessToken('profile-api-user', 'old'),
    );
    await firstRequestStarted.future;
    harness.session.signOut();
    harness.session.authenticate(
      accessToken: testAccessToken('profile-api-user', 'reauthenticated'),
      userId: 'profile-api-user',
      isProfileComplete: false,
    );
    releaseResponse.complete();

    await expectLater(staleRequest, throwsA(isA<ProfileApiException>()));
    expect(requestCount, 1);
    expect(harness.authApi.refreshCount, 0);
  });
}

Future<
  ({
    DioProfileApi api,
    RefreshingAuthApi authApi,
    AuthSessionStore store,
    AuthSessionController session,
  })
>
createHarness(Dio dio) async {
  final authApi = RefreshingAuthApi();
  final storage = MemorySecureStorageAdapter();
  final store = AuthSessionStore(storage);
  await store.saveRefreshToken('old-refresh');
  final session = AuthSessionController(
    AuthSession.authenticated(
      accessToken: testAccessToken('profile-api-user', 'old'),
      userId: 'profile-api-user',
      isProfileComplete: false,
    ),
  );
  final coordinator = ProfileRefreshCoordinator(
    authApi: authApi,
    sessionStore: store,
    sessionController: session,
    generateId: () => '00000000-0000-4000-8000-000000000099',
  );
  return (
    api: DioProfileApi(dio, refreshCoordinator: coordinator),
    authApi: authApi,
    store: store,
    session: session,
  );
}

final class RefreshingAuthApi implements AuthApi {
  int refreshCount = 0;
  AuthApiException? refreshFailure;
  Future<AuthTokens> Function()? onRefresh;

  @override
  Future<AuthTokens> refresh({
    required String refreshToken,
    required String idempotencyKey,
  }) async {
    refreshCount += 1;
    final failure = refreshFailure;
    if (failure != null) {
      throw failure;
    }
    final refresh = onRefresh;
    if (refresh != null) {
      return refresh();
    }
    await Future<void>.delayed(Duration.zero);
    return AuthTokens(
      accessToken: testAccessToken('profile-api-user', 'new'),
      accessExpiresAt: DateTime.utc(2030),
      refreshToken: 'new-refresh',
      refreshExpiresAt: DateTime.utc(2030, 2),
    );
  }

  @override
  Future<OtpChallenge> requestOtp({
    required String phone,
    required String idempotencyKey,
  }) => throw UnimplementedError();

  @override
  Future<AuthTokens> verifyOtp({
    required String challengeId,
    required String code,
    required String deviceName,
    required String idempotencyKey,
  }) => throw UnimplementedError();
}

final class AsyncStubAdapter implements HttpClientAdapter {
  AsyncStubAdapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) => handler(options);
}

ResponseBody jsonResponse(int statusCode, Object body) =>
    ResponseBody.fromString(
      jsonEncode(body),
      statusCode,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

String testAccessToken(String subject, String marker) {
  final header = base64Url.encode(utf8.encode('{"alg":"HS256","typ":"JWT"}'));
  final payload = base64Url.encode(
    utf8.encode(jsonEncode({'sub': subject, 'marker': marker})),
  );
  return '$header.$payload.signature';
}
