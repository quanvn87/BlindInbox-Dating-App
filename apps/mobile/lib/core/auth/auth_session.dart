import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

@immutable
final class AuthSession {
  const AuthSession.unauthenticated()
    : accessToken = null,
      isProfileComplete = false;

  factory AuthSession.authenticated({
    required String accessToken,
    required bool isProfileComplete,
  }) => AuthSession._(
    accessToken: accessToken,
    isProfileComplete: isProfileComplete,
  );

  const AuthSession._({
    required this.accessToken,
    required this.isProfileComplete,
  });

  final String? accessToken;
  final bool isProfileComplete;

  bool get isAuthenticated => accessToken != null;

  @override
  String toString() =>
      'AuthSession(isAuthenticated: $isAuthenticated, '
      'isProfileComplete: $isProfileComplete)';
}

final class AuthSessionController extends ValueNotifier<AuthSession> {
  AuthSessionController([super.value = const AuthSession.unauthenticated()]);

  void authenticate({
    required String accessToken,
    required bool isProfileComplete,
  }) {
    value = AuthSession.authenticated(
      accessToken: accessToken,
      isProfileComplete: isProfileComplete,
    );
  }

  void markProfileComplete() {
    final accessToken = value.accessToken;
    if (accessToken == null) {
      return;
    }

    value = AuthSession.authenticated(
      accessToken: accessToken,
      isProfileComplete: true,
    );
  }

  void signOut() {
    value = const AuthSession.unauthenticated();
  }
}

final authSessionControllerProvider =
    ChangeNotifierProvider<AuthSessionController>(
      (ref) => AuthSessionController(),
    );
