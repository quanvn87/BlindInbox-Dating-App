import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:slow_dating/core/auth/auth_session.dart';
import 'package:slow_dating/core/auth/auth_session_store.dart';
import 'package:slow_dating/features/auth/data/auth_api.dart';
import 'package:slow_dating/features/auth/presentation/auth_controller.dart';
import 'package:slow_dating/features/profile/data/profile_api.dart';
import 'package:slow_dating/features/profile/domain/profile_models.dart';

import 'support/fake_auth_api.dart';
import '../profile/support/fake_profile_api.dart';

void main() {
  late DateTime now;
  late FakeAuthApi api;
  late MemorySecureStorageAdapter storage;
  late AuthSessionStore store;
  late AuthSessionController session;
  late FakeProfileApi profileApi;
  late ManualAuthTicker ticker;
  late SequenceIdGenerator ids;
  late AuthController controller;
  late bool controllerDisposed;
  late bool sessionDisposed;

  setUp(() {
    now = DateTime.utc(2030);
    api = FakeAuthApi()..expiresAt = now.add(const Duration(seconds: 60));
    storage = MemorySecureStorageAdapter();
    store = AuthSessionStore(storage);
    session = AuthSessionController();
    profileApi = FakeProfileApi();
    ticker = ManualAuthTicker();
    ids = SequenceIdGenerator();
    controllerDisposed = false;
    sessionDisposed = false;
    controller = AuthController(
      api: api,
      sessionStore: store,
      sessionController: session,
      profileApi: profileApi,
      clock: () => now,
      ticker: ticker,
      generateId: ids.call,
      deviceName: 'Test device',
    );
  });

  tearDown(() {
    if (!controllerDisposed) {
      controller.dispose();
    }
    if (!sessionDisposed) {
      session.dispose();
    }
  });

  test('requests an OTP and starts countdown from server expiry', () async {
    final sent = await controller.requestOtp(' 0901234567 ');

    expect(sent, isTrue);
    expect(api.requests.single.phone, '0901234567');
    expect(api.requests.single.idempotencyKey, ids.generated.single);
    expect(controller.state.challengeId, 'challenge-1');
    expect(controller.state.remainingSeconds, 60);
    expect(controller.state.canResend, isFalse);
    expect(ticker.isRunning, isTrue);
  });

  test('shows invalid phone error and preserves the entered phone', () async {
    api.requestFailure = const AuthApiException(
      AuthApiFailure.invalidPhone,
      'Enter a valid Vietnamese phone number.',
    );

    final sent = await controller.requestOtp('not-a-phone');

    expect(sent, isFalse);
    expect(controller.state.phone, 'not-a-phone');
    expect(
      controller.state.errorMessage,
      'Enter a valid Vietnamese phone number.',
    );
    expect(controller.state.challengeId, isNull);
  });

  test('countdown follows server expiry and unlocks resend at zero', () async {
    await controller.requestOtp('0901234567');

    now = now.add(const Duration(seconds: 59));
    ticker.tick();
    expect(controller.state.remainingSeconds, 1);
    expect(controller.state.canResend, isFalse);

    now = now.add(const Duration(seconds: 1));
    ticker.tick();
    expect(controller.state.remainingSeconds, 0);
    expect(controller.state.canResend, isTrue);
    expect(ticker.isRunning, isFalse);
  });

  test('rejects resend before expiry and uses a new id after expiry', () async {
    await controller.requestOtp('0901234567');
    final firstId = api.requests.single.idempotencyKey;

    expect(await controller.resendOtp(), isFalse);
    expect(api.requests, hasLength(1));

    now = api.expiresAt;
    ticker.tick();
    api.expiresAt = now.add(const Duration(seconds: 90));
    expect(await controller.resendOtp(), isTrue);

    expect(api.requests, hasLength(2));
    expect(api.requests.last.idempotencyKey, isNot(firstId));
  });

  test('wrong code keeps challenge and exposes a recoverable error', () async {
    await controller.requestOtp('0901234567');
    final challenge = controller.state.challengeId;
    final wrongCode = api.deliveredCode.split('').reversed.join();

    final verified = await controller.verifyOtp(wrongCode);

    expect(verified, isFalse);
    expect(controller.state.challengeId, challenge);
    expect(controller.state.phone, '0901234567');
    expect(
      controller.state.errorMessage,
      'The code is incorrect or has expired.',
    );
    expect(session.value.isAuthenticated, isFalse);
  });

  test(
    'verify persists only refresh token and authenticates in memory',
    () async {
      await controller.requestOtp('0901234567');

      final verified = await controller.verifyOtp(api.deliveredCode);

      expect(verified, isTrue);
      expect(storage.values, {
        AuthSessionStore.refreshTokenKey: api.tokens.refreshToken,
      });
      expect(session.value.accessToken, api.tokens.accessToken);
      expect(session.value.isProfileComplete, isFalse);
      expect(profileApi.profileReads, [api.tokens.accessToken]);
      expect(controller.state.errorMessage, isNull);
      expect(api.verifications.single.idempotencyKey, ids.generated.last);
    },
  );

  test(
    'late OTP storage completion cannot overwrite a newer session',
    () async {
      await controller.requestOtp('0901234567');
      storage.writeStarted = Completer<void>();
      storage.writeCompleter = Completer<void>();

      final verification = controller.verifyOtp(api.deliveredCode);
      await storage.writeStarted!.future;
      session.authenticate(
        accessToken: fakeAccessToken(userId: 'newer-user'),
        userId: 'newer-user',
        isProfileComplete: false,
      );
      storage.writeCompleter!.complete();

      expect(await verification, isFalse);
      expect(session.value.userId, 'newer-user');
    },
  );

  test('late OTP storage error cannot clear a newer credential', () async {
    await controller.requestOtp('0901234567');
    storage.writeStarted = Completer<void>();
    storage.writeCompleter = Completer<void>();

    final verification = controller.verifyOtp(api.deliveredCode);
    await storage.writeStarted!.future;
    session.authenticate(
      accessToken: fakeAccessToken(userId: 'newer-user'),
      userId: 'newer-user',
      isProfileComplete: false,
    );
    final newerSave = store.saveRefreshToken('newer-refresh-token');
    final delayedWrite = storage.writeCompleter!;
    storage.writeCompleter = null;
    delayedWrite.completeError(StateError('delayed write failure'));

    expect(await verification, isFalse);
    await newerSave;
    expect(session.value.userId, 'newer-user');
    expect(await store.readRefreshToken(), 'newer-refresh-token');
  });

  test(
    'fresh OTP session with an existing profile routes as complete',
    () async {
      profileApi.currentProfile = completeProfileInput;
      await controller.requestOtp('0901234567');

      final verified = await controller.verifyOtp(api.deliveredCode);

      expect(verified, isTrue);
      expect(session.value.isProfileComplete, isTrue);
      expect(profileApi.profileReads, [api.tokens.accessToken]);
      expect(await store.readRefreshToken(), api.tokens.refreshToken);
    },
  );

  test(
    'fresh profile resolution failure does not persist issued tokens',
    () async {
      profileApi.getFailure = const ProfileApiException(
        ProfileApiFailure.network,
        'Unable to resolve your profile. Check your connection and try again.',
      );
      await controller.requestOtp('0901234567');

      final verified = await controller.verifyOtp(api.deliveredCode);

      expect(verified, isFalse);
      expect(session.value.isAuthenticated, isFalse);
      expect(await store.readRefreshToken(), isNull);
      expect(profileApi.profileReads, [api.tokens.accessToken]);
      expect(
        controller.state.errorMessage,
        'Unable to resolve your profile. Check your connection and try again.',
      );
      expect(
        controller.state.toString(),
        isNot(contains(api.tokens.accessToken)),
      );
      expect(
        controller.state.toString(),
        isNot(contains(api.tokens.refreshToken)),
      );
    },
  );

  test('late OTP profile error cannot sign out a newer session', () async {
    await controller.requestOtp('0901234567');
    profileApi.getStarted = Completer<void>();
    profileApi.getCompleter = Completer<ProfileInput?>();

    final verification = controller.verifyOtp(api.deliveredCode);
    await profileApi.getStarted!.future;
    session.authenticate(
      accessToken: fakeAccessToken(userId: 'newer-user'),
      userId: 'newer-user',
      isProfileComplete: false,
    );
    profileApi.getCompleter!.completeError(
      const ProfileApiException(
        ProfileApiFailure.network,
        'Unable to resolve the profile.',
      ),
    );

    expect(await verification, isFalse);
    expect(session.value.userId, 'newer-user');
  });

  test(
    'verify persistence failure clears stale token and stays signed out',
    () async {
      storage.values[AuthSessionStore.refreshTokenKey] = 'stored-refresh-token';
      storage.writeFailure = StateError('sensitive storage failure detail');
      await controller.requestOtp('0901234567');

      final verified = await controller.verifyOtp(api.deliveredCode);

      expect(verified, isFalse);
      expect(await store.readRefreshToken(), isNull);
      expect(session.value.isAuthenticated, isFalse);
      expect(
        controller.state.errorMessage,
        'Something went wrong. Please try again.',
      );
      expect(
        controller.state.errorMessage,
        isNot(contains('sensitive storage failure detail')),
      );
    },
  );

  test('restore rotates refresh token and rebuilds memory session', () async {
    await store.saveRefreshToken('stored-refresh-token');

    final restored = await controller.restoreSession();

    expect(restored, isTrue);
    expect(api.refreshes.single.refreshToken, 'stored-refresh-token');
    expect(api.refreshes.single.idempotencyKey, ids.generated.single);
    expect(await store.readRefreshToken(), api.tokens.refreshToken);
    expect(session.value.accessToken, api.tokens.accessToken);
    expect(session.value.isProfileComplete, isFalse);
    expect(profileApi.profileReads, [api.tokens.accessToken]);
  });

  test(
    'delayed stale restore read cannot consume a newer session credential',
    () async {
      await store.saveRefreshToken('account-a-refresh-token');
      storage.readStarted = Completer<void>();
      storage.readCompleter = Completer<void>();

      final restoration = controller.restoreSession();
      await storage.readStarted!.future;
      session.authenticate(
        accessToken: fakeAccessToken(userId: 'account-b'),
        userId: 'account-b',
        isProfileComplete: false,
      );
      final newerSave = store.saveRefreshToken('account-b-refresh-token');
      storage.readCompleter!.complete();

      expect(await restoration, isFalse);
      await newerSave;
      expect(api.refreshes, isEmpty);
      expect(session.value.userId, 'account-b');
      expect(await store.readRefreshToken(), 'account-b-refresh-token');
    },
  );

  test(
    'returning session with an existing profile routes as complete',
    () async {
      await store.saveRefreshToken('stored-refresh-token');
      profileApi.currentProfile = completeProfileInput;

      final restored = await controller.restoreSession();

      expect(restored, isTrue);
      expect(session.value.accessToken, api.tokens.accessToken);
      expect(session.value.isProfileComplete, isTrue);
      expect(profileApi.profileReads, [api.tokens.accessToken]);
    },
  );

  test(
    'late restore storage completion cannot overwrite a newer session',
    () async {
      await store.saveRefreshToken('stored-refresh-token');
      storage.writeStarted = Completer<void>();
      storage.writeCompleter = Completer<void>();

      final restoration = controller.restoreSession();
      await storage.writeStarted!.future;
      session.authenticate(
        accessToken: fakeAccessToken(userId: 'newer-user'),
        userId: 'newer-user',
        isProfileComplete: false,
      );
      storage.writeCompleter!.complete();

      expect(await restoration, isFalse);
      expect(session.value.userId, 'newer-user');
    },
  );

  test('late restore profile error cannot sign out a newer session', () async {
    await store.saveRefreshToken('stored-refresh-token');
    profileApi.getStarted = Completer<void>();
    profileApi.getCompleter = Completer<ProfileInput?>();

    final restoration = controller.restoreSession();
    await profileApi.getStarted!.future;
    session.authenticate(
      accessToken: fakeAccessToken(userId: 'newer-user'),
      userId: 'newer-user',
      isProfileComplete: false,
    );
    await store.saveRefreshToken('newer-refresh-token');
    profileApi.getCompleter!.completeError(
      const ProfileApiException(
        ProfileApiFailure.network,
        'Unable to resolve the profile.',
      ),
    );

    expect(await restoration, isFalse);
    expect(session.value.userId, 'newer-user');
    expect(await store.readRefreshToken(), 'newer-refresh-token');
  });

  test('returning session with a 404 profile routes to onboarding', () async {
    await store.saveRefreshToken('stored-refresh-token');
    profileApi.currentProfile = null;

    final restored = await controller.restoreSession();

    expect(restored, isTrue);
    expect(session.value.isProfileComplete, isFalse);
    expect(profileApi.profileReads, [api.tokens.accessToken]);
  });

  test('profile resolution failure does not expose server details', () async {
    await store.saveRefreshToken('stored-refresh-token');
    profileApi.getFailure = const ProfileApiException(
      ProfileApiFailure.network,
      'Unable to resolve your profile. Check your connection and try again.',
    );

    final restored = await controller.restoreSession();

    expect(restored, isFalse);
    expect(session.value.isAuthenticated, isFalse);
    expect(
      controller.state.errorMessage,
      'Unable to resolve your profile. Check your connection and try again.',
    );
  });

  test('invalid refresh clears persisted and memory session', () async {
    await store.saveRefreshToken('invalid-refresh-token');
    session.authenticate(
      accessToken: 'stale-access-token',
      userId: 'stale-user',
      isProfileComplete: true,
    );
    api.refreshFailure = const AuthApiException(
      AuthApiFailure.invalidRefresh,
      'Your session has expired. Please sign in again.',
    );

    final restored = await controller.restoreSession();

    expect(restored, isFalse);
    expect(await store.readRefreshToken(), isNull);
    expect(session.value.isAuthenticated, isFalse);
  });

  test(
    'failed persistence after refresh rotation clears stale token',
    () async {
      storage.values[AuthSessionStore.refreshTokenKey] = 'stored-refresh-token';
      storage.writeFailure = StateError('secure storage write failed');

      final restored = await controller.restoreSession();

      expect(restored, isFalse);
      expect(await store.readRefreshToken(), isNull);
      expect(session.value.isAuthenticated, isFalse);
    },
  );

  for (final failure in [
    const AuthApiException(
      AuthApiFailure.invalidRefresh,
      'Your session has expired. Please sign in again.',
    ),
    const AuthApiException(
      AuthApiFailure.network,
      'Unable to connect. Check your connection and try again.',
    ),
  ]) {
    test(
      'API restore failure completes safely after disposal: ${failure.kind}',
      () async {
        storage.values[AuthSessionStore.refreshTokenKey] =
            'stored-refresh-token';
        session.authenticate(
          accessToken: 'session-before-disposal',
          userId: 'disposal-user',
          isProfileComplete: true,
        );
        api.refreshCompleter = Completer<AuthTokens>();
        final restore = controller.restoreSession();
        await Future<void>.delayed(Duration.zero);

        controller.dispose();
        controllerDisposed = true;
        session.dispose();
        sessionDisposed = true;
        api.refreshCompleter!.completeError(failure);

        await expectLater(restore, completion(isFalse));
        expect(session.value.accessToken, 'session-before-disposal');
      },
    );
  }

  test('storage restore failure completes safely after disposal', () async {
    storage.values[AuthSessionStore.refreshTokenKey] = 'stored-refresh-token';
    session.authenticate(
      accessToken: 'session-before-disposal',
      userId: 'disposal-user',
      isProfileComplete: true,
    );
    storage.writeCompleter = Completer<void>();
    final restore = controller.restoreSession();
    await Future<void>.delayed(Duration.zero);

    controller.dispose();
    controllerDisposed = true;
    session.dispose();
    sessionDisposed = true;
    storage.writeCompleter!.completeError(
      StateError('secure storage write failed'),
    );

    await expectLater(restore, completion(isFalse));
    expect(session.value.accessToken, 'session-before-disposal');
  });

  test('double restore suppresses a duplicate refresh command', () async {
    await store.saveRefreshToken('stored-refresh-token');
    api.refreshCompleter = Completer<AuthTokens>();

    final first = controller.restoreSession();
    await Future<void>.delayed(Duration.zero);
    final second = controller.restoreSession();

    expect(api.refreshes, hasLength(1));
    expect(ids.generated, hasLength(1));
    expect(await second, isFalse);
    api.refreshCompleter!.complete(api.tokens);
    expect(await first, isTrue);
  });

  test('a later explicit retry creates a new logical command id', () async {
    api.requestFailure = const AuthApiException(
      AuthApiFailure.network,
      'Unable to connect. Check your connection and try again.',
    );
    await controller.requestOtp('0901234567');
    api.requestFailure = null;

    await controller.requestOtp('0901234567');

    expect(api.requests, hasLength(2));
    expect(
      api.requests.first.idempotencyKey,
      isNot(api.requests.last.idempotencyKey),
    );
  });

  test('double request tap shares one in-flight logical command', () async {
    api.requestCompleter = Completer<OtpChallenge>();

    final first = controller.requestOtp('0901234567');
    final second = controller.requestOtp('0901234567');
    await Future<void>.delayed(Duration.zero);

    expect(api.requests, hasLength(1));
    expect(ids.generated, hasLength(1));
    expect(await second, isFalse);
    api.requestCompleter!.complete(
      OtpChallenge(challengeId: 'challenge-delayed', expiresAt: api.expiresAt),
    );
    expect(await first, isTrue);
  });

  test('double verify tap shares one in-flight logical command', () async {
    await controller.requestOtp('0901234567');
    api.verifyCompleter = Completer<AuthTokens>();

    final first = controller.verifyOtp(api.deliveredCode);
    final second = controller.verifyOtp(api.deliveredCode);
    await Future<void>.delayed(Duration.zero);

    expect(api.verifications, hasLength(1));
    expect(ids.generated, hasLength(2));
    expect(await second, isFalse);
    api.verifyCompleter!.complete(api.tokens);
    expect(await first, isTrue);
  });

  test('production command ids are RFC 4122 version 4 UUIDs', () {
    final commandId = generateAuthCommandId();

    expect(
      commandId,
      matches(
        RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ),
      ),
    );
  });
}

final class ManualAuthTicker implements AuthTicker {
  void Function()? _onTick;

  bool get isRunning => _onTick != null;

  @override
  void start(void Function() onTick) => _onTick = onTick;

  @override
  void stop() => _onTick = null;

  void tick() => _onTick?.call();

  @override
  void dispose() => stop();
}

final class SequenceIdGenerator {
  final List<String> generated = [];

  String call() {
    final value =
        '00000000-0000-4000-8000-${(generated.length + 1).toString().padLeft(12, '0')}';
    generated.add(value);
    return value;
  }
}
