import 'package:flutter/foundation.dart';

enum AuthOperation { idle, requestingOtp, verifyingOtp, restoringSession }

@immutable
final class AuthState {
  const AuthState({
    this.phone = '',
    this.challengeId,
    this.expiresAt,
    this.remainingSeconds = 0,
    this.operation = AuthOperation.idle,
    this.errorMessage,
  });

  final String phone;
  final String? challengeId;
  final DateTime? expiresAt;
  final int remainingSeconds;
  final AuthOperation operation;
  final String? errorMessage;

  bool get isBusy => operation != AuthOperation.idle;
  bool get isRequesting => operation == AuthOperation.requestingOtp;
  bool get isVerifying => operation == AuthOperation.verifyingOtp;
  bool get hasChallenge => challengeId != null;
  bool get canResend => hasChallenge && remainingSeconds == 0 && !isBusy;

  AuthState copyWith({
    String? phone,
    Object? challengeId = _unchanged,
    Object? expiresAt = _unchanged,
    int? remainingSeconds,
    AuthOperation? operation,
    Object? errorMessage = _unchanged,
  }) {
    return AuthState(
      phone: phone ?? this.phone,
      challengeId: identical(challengeId, _unchanged)
          ? this.challengeId
          : challengeId as String?,
      expiresAt: identical(expiresAt, _unchanged)
          ? this.expiresAt
          : expiresAt as DateTime?,
      remainingSeconds: remainingSeconds ?? this.remainingSeconds,
      operation: operation ?? this.operation,
      errorMessage: identical(errorMessage, _unchanged)
          ? this.errorMessage
          : errorMessage as String?,
    );
  }

  @override
  String toString() =>
      'AuthState(hasPhone: ${phone.isNotEmpty}, hasChallenge: $hasChallenge, '
      'remainingSeconds: $remainingSeconds, operation: $operation, '
      'hasError: ${errorMessage != null})';
}

const _unchanged = Object();
