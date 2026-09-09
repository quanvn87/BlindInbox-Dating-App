import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:blind_inbox/app/router.dart';
import 'package:blind_inbox/core/auth/auth_session.dart';
import 'package:blind_inbox/core/auth/auth_session_store.dart';
import 'package:blind_inbox/features/auth/data/auth_api.dart';
import 'package:blind_inbox/features/profile/data/profile_api.dart';

import '../features/auth/support/fake_auth_api.dart';
import '../features/profile/support/fake_profile_api.dart';

void main() {
  Future<GoRouter> pumpRouter(
    WidgetTester tester,
    AuthSessionController session,
  ) async {
    final router = createAppRouter(session);
    addTearDown(router.dispose);
    addTearDown(session.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authApiProvider.overrideWithValue(FakeAuthApi()),
          profileApiProvider.overrideWithValue(FakeProfileApi()),
          secureStorageAdapterProvider.overrideWithValue(
            MemorySecureStorageAdapter(),
          ),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
    return router;
  }

  testWidgets('unauthenticated sessions route to /sign-in', (tester) async {
    final session = AuthSessionController();

    final router = await pumpRouter(tester, session);

    expect(router.routeInformationProvider.value.uri.path, '/sign-in');
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.byKey(const ValueKey('phone-screen')), findsOneWidget);
  });

  testWidgets('profile-incomplete sessions route to /onboarding', (
    tester,
  ) async {
    final session = AuthSessionController(
      AuthSession.authenticated(
        accessToken: 'memory-only-access-token',
        userId: 'router-user',
        isProfileComplete: false,
      ),
    );

    final router = await pumpRouter(tester, session);

    expect(router.routeInformationProvider.value.uri.path, '/onboarding');
    expect(find.text('Complete your profile'), findsOneWidget);
    expect(find.byKey(const ValueKey('onboarding-screen')), findsOneWidget);
  });

  testWidgets('profile-complete sessions route to /home', (tester) async {
    final session = AuthSessionController(
      AuthSession.authenticated(
        accessToken: 'memory-only-access-token',
        userId: 'router-user',
        isProfileComplete: true,
      ),
    );

    final router = await pumpRouter(tester, session);

    expect(router.routeInformationProvider.value.uri.path, '/home');
    expect(find.text('Home'), findsOneWidget);
    expect(find.byKey(const ValueKey('home-screen')), findsOneWidget);
  });

  testWidgets('routing reacts when session state changes', (tester) async {
    final session = AuthSessionController();
    final router = await pumpRouter(tester, session);

    session.authenticate(
      accessToken: 'memory-only-access-token',
      userId: 'router-user',
      isProfileComplete: false,
    );
    await tester.pumpAndSettle();

    expect(router.routeInformationProvider.value.uri.path, '/onboarding');
    expect(find.byKey(const ValueKey('onboarding-screen')), findsOneWidget);

    session.markProfileComplete();
    await tester.pumpAndSettle();

    expect(router.routeInformationProvider.value.uri.path, '/home');
    expect(find.byKey(const ValueKey('home-screen')), findsOneWidget);
  });
}
