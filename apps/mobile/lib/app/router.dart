import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:slow_dating/core/auth/auth_session.dart';

GoRouter createAppRouter(AuthSessionController session) {
  return GoRouter(
    initialLocation: '/',
    refreshListenable: session,
    redirect: (context, state) {
      final target = switch (session.value) {
        AuthSession(:final isAuthenticated) when !isAuthenticated => '/sign-in',
        AuthSession(isProfileComplete: false) => '/onboarding',
        _ => '/home',
      };

      return state.uri.path == target ? null : target;
    },
    routes: [
      GoRoute(path: '/', builder: (context, state) => const SizedBox.shrink()),
      GoRoute(
        path: '/sign-in',
        builder: (context, state) => const _PlaceholderScreen(
          key: ValueKey('sign-in-screen'),
          label: 'Sign in',
        ),
      ),
      GoRoute(
        path: '/onboarding',
        builder: (context, state) => const _PlaceholderScreen(
          key: ValueKey('onboarding-screen'),
          label: 'Complete your profile',
        ),
      ),
      GoRoute(
        path: '/home',
        builder: (context, state) => const _PlaceholderScreen(
          key: ValueKey('home-screen'),
          label: 'Home',
        ),
      ),
    ],
  );
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final router = createAppRouter(ref.read(authSessionControllerProvider));
  ref.onDispose(router.dispose);
  return router;
});

final class _PlaceholderScreen extends StatelessWidget {
  const _PlaceholderScreen({required super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Semantics(
          header: true,
          child: Text(label, style: Theme.of(context).textTheme.headlineSmall),
        ),
      ),
    );
  }
}
