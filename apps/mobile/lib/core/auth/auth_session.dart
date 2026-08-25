import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

@immutable
final class AuthSession {
  const AuthSession.unauthenticated()
    : accessToken = null,
      userId = null,
      isProfileComplete = false;

  factory AuthSession.authenticated({
    required String accessToken,
    required String userId,
    required bool isProfileComplete,
  }) {
    if (accessToken.isEmpty || userId.isEmpty) {
      throw ArgumentError('Authenticated session values must be nonempty');
    }
    return AuthSession._(
      accessToken: accessToken,
      userId: userId,
      isProfileComplete: isProfileComplete,
    );
  }

  const AuthSession._({
    required this.accessToken,
    required this.userId,
    required this.isProfileComplete,
  });

  final String? accessToken;
  final String? userId;
  final bool isProfileComplete;

  bool get isAuthenticated => accessToken != null && userId != null;

  @override
  String toString() =>
      'AuthSession(isAuthenticated: $isAuthenticated, '
      'isProfileComplete: $isProfileComplete)';
}

final class AuthSessionController extends ValueNotifier<AuthSession> {
  AuthSessionController([super.value = const AuthSession.unauthenticated()]);

  int _generation = 0;
  int _sessionLineage = 0;

  int get generation => _generation;
  int get sessionLineage => _sessionLineage;

  void authenticate({
    required String accessToken,
    required String userId,
    required bool isProfileComplete,
  }) {
    _generation += 1;
    _sessionLineage += 1;
    value = AuthSession.authenticated(
      accessToken: accessToken,
      userId: userId,
      isProfileComplete: isProfileComplete,
    );
  }

  void authenticateFromAccessToken({
    required String accessToken,
    required bool isProfileComplete,
  }) {
    authenticate(
      accessToken: accessToken,
      userId: accessTokenSubject(accessToken),
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
      userId: value.userId!,
      isProfileComplete: true,
    );
  }

  void replaceAccessToken(String accessToken) {
    if (!value.isAuthenticated) {
      return;
    }
    _generation += 1;
    value = AuthSession.authenticated(
      accessToken: accessToken,
      userId: value.userId!,
      isProfileComplete: value.isProfileComplete,
    );
  }

  void signOut() {
    _generation += 1;
    _sessionLineage += 1;
    value = const AuthSession.unauthenticated();
  }

  void invalidatePendingOperations() {
    _generation += 1;
    _sessionLineage += 1;
  }
}

String accessTokenSubject(String accessToken) {
  try {
    final parts = accessToken.split('.');
    if (parts.length != 3 || parts.any((part) => part.isEmpty)) {
      throw const FormatException();
    }
    final payload = jsonDecode(
      utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
    );
    if (payload is! Map || payload['sub'] is! String) {
      throw const FormatException();
    }
    final subject = (payload['sub'] as String).trim();
    if (subject.isEmpty) {
      throw const FormatException();
    }
    return subject;
  } on Object {
    throw const FormatException('Invalid access token identity');
  }
}

final authSessionControllerProvider =
    ChangeNotifierProvider<AuthSessionController>(
      (ref) => AuthSessionController(),
    );
