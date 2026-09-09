import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:blind_inbox/app/router.dart';
import 'package:blind_inbox/features/auth/presentation/auth_controller.dart';

final class SlowDatingApp extends ConsumerWidget {
  const SlowDatingApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.read(authControllerProvider.notifier);
    return MaterialApp.router(
      title: 'BlindInbox',
      debugShowCheckedModeBanner: false,
      routerConfig: ref.watch(appRouterProvider),
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
      ),
    );
  }
}
