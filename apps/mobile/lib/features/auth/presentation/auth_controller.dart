import 'dart:async';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:slow_dating/core/auth/auth_session.dart';
import 'package:slow_dating/core/auth/auth_session_store.dart';
import 'package:slow_dating/features/auth/data/auth_api.dart';
import 'package:slow_dating/features/auth/domain/auth_state.dart';

typedef AuthClock = DateTime Function();
typedef AuthIdGenerator = String Function();

abstract interface class AuthTicker {
  void start(void Function() onTick);
  void stop();
  void dispose();
}

final class TimerAuthTicker implements AuthTicker {
  Timer? _timer;

  @override
  void start(void Function() onTick) {
    stop();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => onTick());
  }

  @override
  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  @override
  void dispose() => stop();
}

final class AuthController extends StateNotifier<AuthState> {
  factory AuthController({
    required AuthApi api,
    required AuthSessionStore sessionStore,
    required AuthSessionController sessionController,
    AuthClock? clock,
    AuthTicker? ticker,
    AuthIdGenerator? generateId,
    String deviceName = 'Slow Dating mobile',
  }) => AuthController._(
    api: api,
    sessionStore: sessionStore,
    sessionController: sessionController,
    clock: clock ?? DateTime.now,
    ticker: ticker ?? TimerAuthTicker(),
    generateId: generateId ?? generateAuthCommandId,
    deviceName: deviceName,
  );

  AuthController._({
    required this._api,
    required this._sessionStore,
    required this._sessionController,
    required this._clock,
    required this._ticker,
    required this._generateId,
    required this.deviceName,
  }) : super(const AuthState());

  final AuthApi _api;
  final AuthSessionStore _sessionStore;
  final AuthSessionController _sessionController;
  final AuthClock _clock;
  final AuthTicker _ticker;
  final AuthIdGenerator _generateId;
  final String deviceName;

  bool _disposed = false;

  Future<bool> requestOtp(String phone) {
    return _requestOtp(phone.trim(), preserveChallenge: false);
  }

  Future<bool> resendOtp() async {
    _updateCountdown();
    if (!state.canResend) {
      return false;
    }
    return _requestOtp(state.phone, preserveChallenge: true);
  }

  Future<bool> _requestOtp(
    String phone, {
    required bool preserveChallenge,
  }) async {
    if (_disposed || state.isBusy) {
      return false;
    }
    if (phone.isEmpty) {
      state = state.copyWith(
        phone: phone,
        errorMessage: 'Enter a valid Vietnamese phone number.',
      );
      return false;
    }

    final commandId = _generateId();
    state = state.copyWith(
      phone: phone,
      challengeId: preserveChallenge ? state.challengeId : null,
      expiresAt: preserveChallenge ? state.expiresAt : null,
      remainingSeconds: preserveChallenge ? state.remainingSeconds : 0,
      operation: AuthOperation.requestingOtp,
      errorMessage: null,
    );
    try {
      final challenge = await _api.requestOtp(
        phone: phone,
        idempotencyKey: commandId,
      );
      if (_disposed) {
        return false;
      }
      state = state.copyWith(
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt,
        remainingSeconds: _remainingSeconds(challenge.expiresAt),
        operation: AuthOperation.idle,
        errorMessage: null,
      );
      _startCountdown();
      return true;
    } on AuthApiException catch (error) {
      if (!_disposed) {
        state = state.copyWith(
          operation: AuthOperation.idle,
          errorMessage: error.userMessage,
        );
      }
      return false;
    } on Object {
      if (!_disposed) {
        state = state.copyWith(
          operation: AuthOperation.idle,
          errorMessage: _unexpectedError,
        );
      }
      return false;
    }
  }

  Future<bool> verifyOtp(String code) async {
    if (_disposed || state.isBusy) {
      return false;
    }
    final challengeId = state.challengeId;
    if (challengeId == null) {
      state = state.copyWith(errorMessage: 'Request a code before verifying.');
      return false;
    }
    final normalizedCode = code.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(normalizedCode)) {
      state = state.copyWith(errorMessage: 'Enter the six-digit code.');
      return false;
    }

    final commandId = _generateId();
    state = state.copyWith(
      operation: AuthOperation.verifyingOtp,
      errorMessage: null,
    );
    try {
      final tokens = await _api.verifyOtp(
        challengeId: challengeId,
        code: normalizedCode,
        deviceName: deviceName,
        idempotencyKey: commandId,
      );
      try {
        await _sessionStore.saveRefreshToken(tokens.refreshToken);
      } on Object {
        await _clearPersistedRefreshToken();
        if (!_disposed) {
          _sessionController.signOut();
          state = state.copyWith(
            operation: AuthOperation.idle,
            errorMessage: _unexpectedError,
          );
        }
        return false;
      }
      if (_disposed) {
        return false;
      }
      _sessionController.authenticate(
        accessToken: tokens.accessToken,
        isProfileComplete: false,
      );
      _ticker.stop();
      state = state.copyWith(operation: AuthOperation.idle, errorMessage: null);
      return true;
    } on AuthApiException catch (error) {
      if (!_disposed) {
        state = state.copyWith(
          operation: AuthOperation.idle,
          errorMessage: error.userMessage,
        );
      }
      return false;
    } on Object {
      if (!_disposed) {
        state = state.copyWith(
          operation: AuthOperation.idle,
          errorMessage: _unexpectedError,
        );
      }
      return false;
    }
  }

  Future<bool> restoreSession() async {
    if (_disposed || state.isBusy) {
      return false;
    }
    state = state.copyWith(
      operation: AuthOperation.restoringSession,
      errorMessage: null,
    );
    try {
      final storedRefreshToken = await _sessionStore.readRefreshToken();
      if (_disposed) {
        return false;
      }
      if (storedRefreshToken == null) {
        state = state.copyWith(operation: AuthOperation.idle);
        return false;
      }
      if (storedRefreshToken.isEmpty) {
        await _clearPersistedRefreshToken();
        _finishRestoreFailure(errorMessage: null);
        return false;
      }

      final tokens = await _api.refresh(
        refreshToken: storedRefreshToken,
        idempotencyKey: _generateId(),
      );
      try {
        await _sessionStore.saveRefreshToken(tokens.refreshToken);
      } on Object {
        await _clearPersistedRefreshToken();
        _finishRestoreFailure(errorMessage: _unexpectedError);
        return false;
      }
      if (_disposed) {
        return false;
      }
      _sessionController.authenticate(
        accessToken: tokens.accessToken,
        isProfileComplete: false,
      );
      state = state.copyWith(operation: AuthOperation.idle);
      return true;
    } on AuthApiException catch (error) {
      if (error.kind == AuthApiFailure.invalidRefresh) {
        await _clearPersistedRefreshToken();
      }
      _finishRestoreFailure(errorMessage: error.userMessage);
      return false;
    } on Object {
      _finishRestoreFailure(errorMessage: _unexpectedError);
      return false;
    }
  }

  Future<void> _clearPersistedRefreshToken() async {
    try {
      await _sessionStore.clearRefreshToken();
    } on Object {
      // Memory state can still be cleared if secure storage is unavailable.
    }
  }

  void _finishRestoreFailure({required String? errorMessage}) {
    if (_disposed) {
      return;
    }
    _sessionController.signOut();
    state = state.copyWith(
      operation: AuthOperation.idle,
      errorMessage: errorMessage,
    );
  }

  void _startCountdown() {
    if (state.remainingSeconds == 0) {
      _ticker.stop();
      return;
    }
    _ticker.start(_updateCountdown);
  }

  void _updateCountdown() {
    if (_disposed) {
      return;
    }
    final expiresAt = state.expiresAt;
    if (expiresAt == null) {
      _ticker.stop();
      return;
    }
    final remaining = _remainingSeconds(expiresAt);
    state = state.copyWith(remainingSeconds: remaining);
    if (remaining == 0) {
      _ticker.stop();
    }
  }

  int _remainingSeconds(DateTime expiresAt) {
    final remainingMicroseconds = expiresAt.difference(_clock()).inMicroseconds;
    if (remainingMicroseconds <= 0) {
      return 0;
    }
    return (remainingMicroseconds + Duration.microsecondsPerSecond - 1) ~/
        Duration.microsecondsPerSecond;
  }

  @override
  void dispose() {
    _disposed = true;
    _ticker.dispose();
    super.dispose();
  }
}

String generateAuthCommandId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes
      .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
      .join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-'
      '${hex.substring(20)}';
}

const _unexpectedError = 'Something went wrong. Please try again.';

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>(
  (ref) {
    final controller = AuthController(
      api: ref.watch(authApiProvider),
      sessionStore: ref.watch(authSessionStoreProvider),
      sessionController: ref.read(authSessionControllerProvider),
    );
    controller.restoreSession().ignore();
    return controller;
  },
);
