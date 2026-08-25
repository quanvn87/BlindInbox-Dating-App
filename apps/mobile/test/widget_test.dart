import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:slow_dating/app/app.dart';
import 'package:slow_dating/core/auth/auth_session_store.dart';
import 'package:slow_dating/features/auth/data/auth_api.dart';

import 'features/auth/support/fake_auth_api.dart';

void main() {
  testWidgets('app starts on the phone sign-in screen', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authApiProvider.overrideWithValue(FakeAuthApi()),
          secureStorageAdapterProvider.overrideWithValue(
            MemorySecureStorageAdapter(),
          ),
        ],
        child: const SlowDatingApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sign in'), findsOneWidget);
    expect(find.byKey(const ValueKey('phone-screen')), findsOneWidget);
  });
}
