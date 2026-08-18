import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:slow_dating/app/app.dart';
import 'package:slow_dating/core/auth/auth_session_store.dart';
import 'package:slow_dating/features/auth/data/auth_api.dart';
import 'package:slow_dating/features/auth/presentation/otp_screen.dart';

import 'support/fake_auth_api.dart';

void main() {
  testWidgets('phone and captured OTP flow routes to onboarding', (
    tester,
  ) async {
    final api = FakeAuthApi();
    api.requestCompleter = Completer<OtpChallenge>();
    final storage = MemorySecureStorageAdapter();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authApiProvider.overrideWithValue(api),
          secureStorageAdapterProvider.overrideWithValue(storage),
        ],
        child: const SlowDatingApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('phone-screen')), findsOneWidget);
    await tester.enterText(
      find.byKey(const ValueKey('phone-input')),
      '0901234567',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Send code'));
    await tester.pump();

    expect(find.bySemanticsLabel('Sending code'), findsOneWidget);
    api.requestCompleter!.complete(
      OtpChallenge(challengeId: 'captured-challenge', expiresAt: api.expiresAt),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('otp-screen')), findsOneWidget);
    api.verifyCompleter = Completer<AuthTokens>();
    await tester.enterText(
      find.byKey(const ValueKey('otp-input')),
      api.deliveredCode,
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Verify code'));
    await tester.pump();

    expect(find.bySemanticsLabel('Verifying code'), findsOneWidget);
    api.verifyCompleter!.complete(api.tokens);
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('onboarding-screen')), findsOneWidget);
    expect(find.text(api.tokens.accessToken), findsNothing);
    expect(find.text(api.tokens.refreshToken), findsNothing);
    expect(storage.values.keys, [AuthSessionStore.refreshTokenKey]);
  });

  testWidgets('recoverable request error keeps phone input', (tester) async {
    final api = FakeAuthApi()
      ..requestFailure = const AuthApiException(
        AuthApiFailure.invalidPhone,
        'Enter a valid Vietnamese phone number.',
      );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authApiProvider.overrideWithValue(api),
          secureStorageAdapterProvider.overrideWithValue(
            MemorySecureStorageAdapter(),
          ),
        ],
        child: const SlowDatingApp(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const ValueKey('phone-input')),
      'invalid phone',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Send code'));
    await tester.pumpAndSettle();

    expect(api.requests, hasLength(1));
    expect(find.text('Enter a valid Vietnamese phone number.'), findsOneWidget);
    expect(find.text('invalid phone'), findsOneWidget);
    expect(find.byKey(const ValueKey('phone-screen')), findsOneWidget);
  });

  testWidgets('direct code route hides resend without a challenge', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authApiProvider.overrideWithValue(FakeAuthApi()),
          secureStorageAdapterProvider.overrideWithValue(
            MemorySecureStorageAdapter(),
          ),
        ],
        child: const MaterialApp(home: OtpScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Request a code before verifying.'), findsOneWidget);
    expect(find.textContaining('Resend'), findsNothing);
  });
}
