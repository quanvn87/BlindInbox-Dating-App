import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:slow_dating/app/router.dart';
import 'package:slow_dating/core/auth/auth_session.dart';

void main() {
  Future<GoRouter> pumpRouter(
    WidgetTester tester,
    AuthSessionController session,
  ) async {
    final router = createAppRouter(session);
    addTearDown(router.dispose);
    addTearDown(session.dispose);

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
    return router;
  }

  testWidgets('unauthenticated sessions route to /sign-in', (tester) async {
    final session = AuthSessionController();

    final router = await pumpRouter(tester, session);

    expect(router.routeInformationProvider.value.uri.path, '/sign-in');
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.byKey(const ValueKey('sign-in-screen')), findsOneWidget);
  });

  testWidgets('profile-incomplete sessions route to /onboarding', (
    tester,
  ) async {
    final session = AuthSessionController(
      AuthSession.authenticated(
        accessToken: 'memory-only-access-token',
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
