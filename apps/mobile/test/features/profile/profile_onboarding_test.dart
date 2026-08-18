import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:slow_dating/app/router.dart';
import 'package:slow_dating/core/auth/auth_session.dart';
import 'package:slow_dating/features/profile/data/profile_api.dart';
import 'package:slow_dating/features/profile/presentation/profile_controller.dart';

import 'support/fake_profile_api.dart';

void main() {
  testWidgets('explains 18+ access and renders every active option with text', (
    tester,
  ) async {
    final harness = await _pumpOnboarding(tester);
    addTearDown(harness.dispose);

    expect(
      find.text(
        'Slow Dating is for adults aged 18 and over. Your birth date confirms eligibility.',
      ),
      findsOneWidget,
    );
    expect(find.text('A man'), findsNWidgets(2));
    expect(find.text('A woman'), findsNWidgets(2));
    expect(find.text('In my own words'), findsNWidgets(2));
    expect(find.text('Friendship only'), findsOneWidget);
    expect(find.text('A long-term relationship'), findsOneWidget);
    expect(find.text('Unavailable'), findsNothing);
    expect(find.text('My ideal slow date is...'), findsOneWidget);
    expect(
      find.text('Your precise location is not shown to other members.'),
      findsOneWidget,
    );
    final province = find.byKey(const ValueKey('home-location-province'));
    await tester.ensureVisible(province);
    await tester.tap(province);
    await tester.pumpAndSettle();
    expect(find.text('Ho Chi Minh City'), findsOneWidget);
  });

  testWidgets('selected options expose selected semantics independently', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final harness = await _pumpOnboarding(tester);
    addTearDown(harness.dispose);

    await tester.tap(find.byKey(const ValueKey('identity-MAN')));
    await tester.tap(find.byKey(const ValueKey('interest-MAN')));
    await tester.ensureVisible(find.byKey(const ValueKey('intent-FRIENDSHIP')));
    await tester.tap(find.byKey(const ValueKey('intent-FRIENDSHIP')));
    await tester.pump();

    expect(
      tester
          .getSemantics(find.byKey(const ValueKey('identity-MAN')))
          .flagsCollection
          .isSelected,
      Tristate.isTrue,
    );
    expect(
      tester
          .getSemantics(find.byKey(const ValueKey('interest-MAN')))
          .flagsCollection
          .isSelected,
      Tristate.isTrue,
    );
    semantics.dispose();
    expect(
      tester
          .getSemantics(find.byKey(const ValueKey('intent-FRIENDSHIP')))
          .flagsCollection
          .isSelected,
      Tristate.isTrue,
    );
  });

  testWidgets('submit stays disabled until every required field is complete', (
    tester,
  ) async {
    final harness = await _pumpOnboarding(tester);
    addTearDown(harness.dispose);

    FilledButton button() => tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Complete profile'),
    );

    expect(button().onPressed, isNull);

    final controller = harness.container.read(
      profileControllerProvider.notifier,
    );
    controller.setDisplayName('Minh');
    controller.setBirthDate('1990-02-03');
    controller.setGenderIdentity('MAN');
    controller.toggleInterestedGender('MAN');
    controller.toggleConnectionIntent('FRIENDSHIP');
    controller.setHomeLocation('W-BEN-NGHE');
    await tester.pump();

    expect(button().onPressed, isNotNull);
  });

  testWidgets('successful submit routes exactly to home without token text', (
    tester,
  ) async {
    final harness = await _pumpOnboarding(tester);
    addTearDown(harness.dispose);
    final controller = harness.container.read(
      profileControllerProvider.notifier,
    );
    controller.setDisplayName('Minh');
    controller.setBirthDate('1990-02-03');
    controller.setGenderIdentity('MAN');
    controller.toggleInterestedGender('MAN');
    controller.toggleConnectionIntent('FRIENDSHIP');
    controller.setHomeLocation('W-BEN-NGHE');
    await tester.pump();

    final submit = find.widgetWithText(FilledButton, 'Complete profile');
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pumpAndSettle();

    expect(harness.router.routeInformationProvider.value.uri.path, '/home');
    expect(find.byKey(const ValueKey('home-screen')), findsOneWidget);
    expect(find.text('memory-access-token'), findsNothing);
    expect(harness.api.puts, hasLength(1));
  });

  testWidgets('invalid contract fields expose errors and disable submit', (
    tester,
  ) async {
    final harness = await _pumpOnboarding(tester);
    addTearDown(harness.dispose);
    final controller = harness.container.read(
      profileControllerProvider.notifier,
    );
    controller.setDisplayName('Minh');
    controller.setBirthDate('not-a-date');
    controller.setGenderIdentity('MAN');
    controller.toggleInterestedGender('MAN');
    controller.toggleConnectionIntent('FRIENDSHIP');
    controller.setHomeLocation('W-BEN-NGHE');
    controller.setHeightCm('very tall');
    controller.setFavoriteSongTitle('Only a title');
    await tester.pump();

    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Complete profile'),
    );
    expect(button.onPressed, isNull);
    expect(
      find.text('Use YYYY-MM-DD for a valid calendar date.'),
      findsOneWidget,
    );
    expect(find.text('Enter a whole number from 100 to 250.'), findsOneWidget);
    expect(
      find.text('Add both song title and artist, or leave both blank.'),
      findsOneWidget,
    );
  });

  testWidgets('programmatic over-limit text keeps submit disabled', (
    tester,
  ) async {
    final harness = await _pumpOnboarding(tester);
    addTearDown(harness.dispose);
    final controller = harness.container.read(
      profileControllerProvider.notifier,
    );
    controller.setDisplayName('${List.filled(25, '😀').join()}x');
    controller.setBirthDate('1990-02-03');
    controller.setGenderIdentity('MAN');
    controller.toggleInterestedGender('MAN');
    controller.toggleConnectionIntent('FRIENDSHIP');
    controller.setHomeLocation('W-BEN-NGHE');
    controller.setBio('${List.filled(250, '😀').join()}x');
    controller.setPromptAnswer(
      'SLOW_DATE',
      '${List.filled(140, '😀').join()}x',
    );
    await tester.pump();

    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Complete profile'),
    );
    expect(button.onPressed, isNull);
    expect(
      find.text('Display name must be 2 to 50 characters.'),
      findsOneWidget,
    );
    expect(find.text('Bio must be 500 characters or fewer.'), findsOneWidget);
    expect(
      find.text('Answer must be nonblank and 280 characters or fewer.'),
      findsOneWidget,
    );
  });

  testWidgets(
    'changing province clears stale district and ward UI and serialization',
    (tester) async {
      final harness = await _pumpOnboarding(tester);
      addTearDown(harness.dispose);
      final controller = harness.container.read(
        profileControllerProvider.notifier,
      );

      await _selectDropdown(
        tester,
        const ValueKey('home-location-province'),
        'Ho Chi Minh City',
      );
      await _selectDropdown(
        tester,
        const ValueKey('home-location-district'),
        'District 1',
      );
      await _selectDropdown(
        tester,
        const ValueKey('home-location-ward'),
        'Ben Nghe Ward',
      );
      expect(controller.state.draft.homeLocationCode, 'W-BEN-NGHE');

      await _selectDropdown(
        tester,
        const ValueKey('home-location-province'),
        'Ha Noi',
      );

      expect(tester.takeException(), isNull);
      expect(controller.state.draft.homeLocationCode, 'P-HN');
      expect(
        controller.state.draft.toInput().toJson()['homeLocationCode'],
        'P-HN',
      );
      expect(find.text('District 1'), findsNothing);
      expect(find.text('Ben Nghe Ward'), findsNothing);

      final district = tester.widget<DropdownButtonFormField<String>>(
        find.descendant(
          of: find.byKey(const ValueKey('home-location-district')),
          matching: find.byType(DropdownButtonFormField<String>),
        ),
      );
      final ward = tester.widget<DropdownButtonFormField<String>>(
        find.descendant(
          of: find.byKey(const ValueKey('home-location-ward')),
          matching: find.byType(DropdownButtonFormField<String>),
        ),
      );
      expect(district.initialValue, isNull);
      expect(district.onChanged, isNull);
      expect(ward.initialValue, isNull);
      expect(ward.onChanged, isNull);
    },
  );

  testWidgets('catalog error renders safe retry affordance', (tester) async {
    final api = FakeProfileApi()
      ..catalogFailure = const ProfileApiException(
        ProfileApiFailure.network,
        'Unable to load profile options. Check your connection and try again.',
      );
    final harness = await _pumpOnboarding(tester, api: api);
    addTearDown(harness.dispose);

    expect(
      find.text(
        'Unable to load profile options. Check your connection and try again.',
      ),
      findsOneWidget,
    );
    expect(find.widgetWithText(OutlinedButton, 'Retry'), findsOneWidget);
  });
}

Future<void> _selectDropdown(
  WidgetTester tester,
  Key key,
  String option,
) async {
  final field = find.byKey(key);
  await tester.ensureVisible(field);
  await tester.tap(field);
  await tester.pumpAndSettle();
  await tester.tap(find.text(option).last);
  await tester.pumpAndSettle();
}

Future<_Harness> _pumpOnboarding(
  WidgetTester tester, {
  FakeProfileApi? api,
}) async {
  final fakeApi = api ?? FakeProfileApi();
  final session = AuthSessionController(
    AuthSession.authenticated(
      accessToken: 'memory-access-token',
      isProfileComplete: false,
    ),
  );
  final router = createAppRouter(session);
  final container = ProviderContainer(
    overrides: [
      profileApiProvider.overrideWithValue(fakeApi),
      authSessionControllerProvider.overrideWith((ref) => session),
    ],
  );

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
  return _Harness(
    api: fakeApi,
    session: session,
    router: router,
    container: container,
  );
}

final class _Harness {
  const _Harness({
    required this.api,
    required this.session,
    required this.router,
    required this.container,
  });

  final FakeProfileApi api;
  final AuthSessionController session;
  final GoRouter router;
  final ProviderContainer container;

  void dispose() {
    router.dispose();
    container.dispose();
  }
}
