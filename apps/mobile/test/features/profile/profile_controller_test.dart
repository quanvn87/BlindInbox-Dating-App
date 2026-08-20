import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:slow_dating/core/auth/auth_session.dart';
import 'package:slow_dating/features/profile/data/profile_api.dart';
import 'package:slow_dating/features/profile/domain/profile_models.dart';
import 'package:slow_dating/features/profile/presentation/profile_controller.dart';

import 'support/fake_profile_api.dart';

void main() {
  group('ProfileInput serialization', () {
    test('keeps MAN identity and MAN interest independent', () {
      final json = completeProfileInput.toJson();

      expect(json['genderIdentity'], 'MAN');
      expect(json['interestedInGenders'], ['MAN']);
    });

    test('serializes friendship without adding a dating intent', () {
      final json = completeProfileInput.toJson();

      expect(json['connectionIntents'], ['FRIENDSHIP']);
      expect(json['connectionIntents'], isNot(contains('LONG_TERM_DATING')));
    });

    test('removes duplicate multi-select values and prompt codes', () {
      final input = completeProfileInput.copyWith(
        interestedInGenders: const ['MAN', 'MAN', 'WOMAN'],
        connectionIntents: const ['FRIENDSHIP', 'FRIENDSHIP'],
        promptAnswers: const [
          PromptAnswer(promptCode: 'SLOW_DATE', answer: 'Coffee'),
          PromptAnswer(promptCode: 'SLOW_DATE', answer: 'A walk'),
        ],
      );

      final json = input.toJson();

      expect(json['interestedInGenders'], ['MAN', 'WOMAN']);
      expect(json['connectionIntents'], ['FRIENDSHIP']);
      expect(json['promptAnswers'], [
        {'promptCode': 'SLOW_DATE', 'answer': 'A walk'},
      ]);
    });

    test('requires and serializes a SELF_DESCRIBED label', () {
      const draft = ProfileDraft(
        displayName: 'River',
        birthDate: '1990-02-03',
        genderIdentity: 'SELF_DESCRIBED',
        genderLabel: '  genderfluid  ',
        interestedInGenders: ['MAN'],
        connectionIntents: ['FRIENDSHIP'],
        homeLocationCode: 'P-HCM',
      );

      expect(draft.hasRequiredFields, isTrue);
      expect(draft.toInput().toJson()['genderLabel'], 'genderfluid');
      expect(draft.copyWith(genderLabel: ' ').hasRequiredFields, isFalse);
    });

    test('accepts exact UTF-16 length boundaries from the server contract', () {
      const base = ProfileDraft(
        displayName: 'OK',
        birthDate: '1990-02-03',
        genderIdentity: 'MAN',
        interestedInGenders: ['MAN'],
        connectionIntents: ['FRIENDSHIP'],
        homeLocationCode: 'P-HCM',
      );
      final fiftyUnits = _repeat('😀', 25);
      final fiveHundredUnits = _repeat('😀', 250);
      final twoHundredEightyUnits = _repeat('😀', 140);
      expect(fiftyUnits.length, 50);
      expect(fiveHundredUnits.length, 500);
      expect(twoHundredEightyUnits.length, 280);

      expect(base.copyWith(displayName: '  AB').canSubmit, isTrue);
      expect(base.copyWith(displayName: fiftyUnits).canSubmit, isTrue);
      expect(
        base
            .copyWith(genderIdentity: 'SELF_DESCRIBED', genderLabel: fiftyUnits)
            .canSubmit,
        isTrue,
      );
      expect(base.copyWith(bio: fiveHundredUnits).canSubmit, isTrue);
      expect(
        base
            .copyWith(promptAnswers: {'SLOW_DATE': twoHundredEightyUnits})
            .canSubmit,
        isTrue,
      );
    });

    test('rejects over-boundary and blank contract strings', () {
      const base = ProfileDraft(
        displayName: 'OK',
        birthDate: '1990-02-03',
        genderIdentity: 'MAN',
        interestedInGenders: ['MAN'],
        connectionIntents: ['FRIENDSHIP'],
        homeLocationCode: 'P-HCM',
      );
      final fiftyOneUnits = '${_repeat('😀', 25)}x';
      final fiveHundredOneUnits = '${_repeat('😀', 250)}x';
      final twoHundredEightyOneUnits = '${_repeat('😀', 140)}x';
      expect(fiftyOneUnits.length, 51);
      expect(fiveHundredOneUnits.length, 501);
      expect(twoHundredEightyOneUnits.length, 281);

      expect(base.copyWith(displayName: ' a ').canSubmit, isFalse);
      expect(base.copyWith(displayName: fiftyOneUnits).canSubmit, isFalse);
      expect(
        base
            .copyWith(genderIdentity: 'SELF_DESCRIBED', genderLabel: ' x ')
            .canSubmit,
        isFalse,
      );
      expect(
        base
            .copyWith(
              genderIdentity: 'SELF_DESCRIBED',
              genderLabel: fiftyOneUnits,
            )
            .canSubmit,
        isFalse,
      );
      expect(base.copyWith(bio: fiveHundredOneUnits).canSubmit, isFalse);
      expect(
        base.copyWith(promptAnswers: const {'SLOW_DATE': '   '}).canSubmit,
        isFalse,
      );
      expect(
        base
            .copyWith(promptAnswers: {'SLOW_DATE': twoHundredEightyOneUnits})
            .canSubmit,
        isFalse,
      );
    });
  });

  group('ProfileController', () {
    late FakeProfileApi api;
    late AuthSessionController session;
    late SequenceProfileIds ids;
    late ProfileController controller;

    setUp(() {
      api = FakeProfileApi();
      session = AuthSessionController(
        AuthSession.authenticated(
          accessToken: 'memory-access-token',
          userId: 'profile-user',
          isProfileComplete: false,
        ),
      );
      ids = SequenceProfileIds();
      controller = ProfileController(
        api: api,
        sessionController: session,
        generateId: ids.call,
      );
    });

    test('gates malformed required and optional contract values', () {
      const valid = ProfileDraft(
        displayName: 'River',
        birthDate: '1990-02-03',
        genderIdentity: 'MAN',
        interestedInGenders: ['MAN'],
        connectionIntents: ['FRIENDSHIP'],
        homeLocationCode: 'P-HCM',
      );

      expect(valid.hasRequiredFields, isTrue);
      expect(valid.copyWith(birthDate: '02/03/1990').canSubmit, isFalse);
      expect(valid.copyWith(birthDate: '1990-02-31').canSubmit, isFalse);
      expect(valid.copyWith(heightCm: 'tall').canSubmit, isFalse);
      expect(valid.copyWith(heightCm: '99').canSubmit, isFalse);
      expect(valid.copyWith(heightCm: '251').canSubmit, isFalse);
      expect(valid.copyWith(heightCm: '172').canSubmit, isTrue);
      expect(valid.copyWith(favoriteSongTitle: 'Song').canSubmit, isFalse);
      expect(valid.copyWith(favoriteSongArtist: 'Artist').canSubmit, isFalse);
      expect(
        valid
            .copyWith(favoriteSongTitle: 'Song', favoriteSongArtist: 'Artist')
            .canSubmit,
        isTrue,
      );
      expect(valid.copyWith(birthDate: '2010-01-01').canSubmit, isTrue);
    });

    tearDown(() {
      controller.dispose();
      session.dispose();
    });

    test('loads the active server catalog', () async {
      await controller.loadCatalog();

      expect(controller.state.catalog, testProfileCatalog);
      expect(controller.state.catalogError, isNull);
      expect(controller.state.isCatalogLoading, isFalse);
      expect(
        controller.state.catalog!.activeGenders.map((option) => option.label),
        isNot(contains('Unavailable')),
      );
    });

    test('catalog failure is safe and retryable', () async {
      api.catalogFailure = const ProfileApiException(
        ProfileApiFailure.network,
        'Unable to load profile options. Check your connection and try again.',
      );

      await controller.loadCatalog();

      expect(controller.state.catalog, isNull);
      expect(
        controller.state.catalogError,
        'Unable to load profile options. Check your connection and try again.',
      );

      api.catalogFailure = null;
      await controller.loadCatalog();
      expect(controller.state.catalog, testProfileCatalog);
    });

    test('surfaces the safe under-18 server error and retains draft', () async {
      api.putFailure = const ProfileApiException(
        ProfileApiFailure.underage,
        'You must be at least 18 years old to use Slow Dating.',
      );
      _completeDraft(controller, birthDate: '2010-01-01');
      final before = controller.state.draft;

      final submitted = await controller.submit();

      expect(submitted, isFalse);
      expect(
        controller.state.submitError,
        'You must be at least 18 years old to use Slow Dating.',
      );
      expect(controller.state.draft, before);
      expect(session.value.isProfileComplete, isFalse);
    });

    test('retains all draft values after a recoverable failed PUT', () async {
      api.putFailure = const ProfileApiException(
        ProfileApiFailure.network,
        'Unable to save your profile. Check your connection and try again.',
      );
      _completeDraft(controller);
      controller.setBio('A draft bio');
      controller.setFavoriteSongTitle('Song title');
      controller.setFavoriteSongArtist('Song artist');
      controller.setPromptAnswer('SLOW_DATE', 'A quiet coffee');
      final before = controller.state.draft;

      expect(await controller.submit(), isFalse);

      expect(controller.state.draft, before);
      expect(api.puts.single.input.bio, 'A draft bio');
    });

    test(
      'one in-flight submit creates one UUID and cannot duplicate',
      () async {
        _completeDraft(controller);
        api.putCompleter = Completer<ProfileInput>();

        final first = controller.submit();
        final second = controller.submit();
        await Future<void>.delayed(Duration.zero);

        expect(await second, isFalse);
        expect(api.puts, hasLength(1));
        expect(ids.generated, hasLength(1));
        expect(
          api.puts.single.idempotencyKey,
          matches(RegExp(r'^[0-9a-f-]{36}$')),
        );

        api.putCompleter!.complete(completeProfileInput);
        expect(await first, isTrue);
      },
    );

    test('late account A PUT success cannot mutate account B', () async {
      final draftStore = ProfileDraftStore();
      controller.dispose();
      controller = ProfileController(
        api: api,
        sessionController: session,
        generateId: ids.call,
        draftStore: draftStore,
      );
      _completeDraft(controller);
      api.putCompleter = Completer<ProfileInput>();

      final accountASubmit = controller.submit();
      session.authenticate(
        accessToken: 'account-b-access-token',
        userId: 'account-b',
        isProfileComplete: false,
      );
      controller.setDisplayName('Account B draft');
      expect(controller.state.draft.displayName, 'Account B draft');
      final accountBDraft = controller.state.draft;
      api.putCompleter!.complete(completeProfileInput);

      expect(await accountASubmit, isFalse);
      expect(session.value.userId, 'account-b');
      expect(session.value.isProfileComplete, isFalse);
      expect(controller.state.draft, accountBDraft);
      expect(controller.state.isSubmitting, isFalse);
      expect(controller.state.submitError, isNull);
      expect(draftStore.draftFor('account-b'), accountBDraft);
    });

    test('late account A PUT failure cannot mutate account B', () async {
      final draftStore = ProfileDraftStore();
      controller.dispose();
      controller = ProfileController(
        api: api,
        sessionController: session,
        generateId: ids.call,
        draftStore: draftStore,
      );
      _completeDraft(controller);
      api.putCompleter = Completer<ProfileInput>();

      final accountASubmit = controller.submit();
      session.authenticate(
        accessToken: 'account-b-access-token',
        userId: 'account-b',
        isProfileComplete: false,
      );
      controller.setDisplayName('Account B draft');
      expect(controller.state.draft.displayName, 'Account B draft');
      final accountBDraft = controller.state.draft;
      api.putCompleter!.completeError(
        const ProfileApiException(
          ProfileApiFailure.network,
          'Unable to save your profile. Check your connection and try again.',
        ),
      );

      expect(await accountASubmit, isFalse);
      expect(session.value.userId, 'account-b');
      expect(session.value.isProfileComplete, isFalse);
      expect(controller.state.draft, accountBDraft);
      expect(controller.state.isSubmitting, isFalse);
      expect(controller.state.submitError, isNull);
      expect(draftStore.draftFor('account-b'), accountBDraft);
    });

    test('same-user reauthentication releases a stale submit', () async {
      _completeDraft(controller);
      api.putCompleter = Completer<ProfileInput>();

      final staleSubmit = controller.submit();
      session.signOut();
      session.authenticate(
        accessToken: 'reauthenticated-access-token',
        userId: 'profile-user',
        isProfileComplete: false,
      );
      controller.setBio('Draft after reauthentication');

      expect(controller.state.isSubmitting, isFalse);
      expect(controller.state.draft.bio, 'Draft after reauthentication');
      api.putCompleter!.complete(completeProfileInput);
      expect(await staleSubmit, isFalse);
      expect(controller.state.draft.bio, 'Draft after reauthentication');
      expect(session.value.isProfileComplete, isFalse);
    });

    test('same-user reauthentication ignores a stale submit failure', () async {
      _completeDraft(controller);
      api.putCompleter = Completer<ProfileInput>();

      final staleSubmit = controller.submit();
      session.signOut();
      session.authenticate(
        accessToken: 'reauthenticated-access-token',
        userId: 'profile-user',
        isProfileComplete: false,
      );
      controller.setBio('Draft after reauthentication');
      api.putCompleter!.completeError(
        const ProfileApiException(
          ProfileApiFailure.network,
          'Unable to save your profile. Check your connection and try again.',
        ),
      );

      expect(await staleSubmit, isFalse);
      expect(controller.state.isSubmitting, isFalse);
      expect(controller.state.draft.bio, 'Draft after reauthentication');
      expect(controller.state.submitError, isNull);
      expect(session.value.isProfileComplete, isFalse);
    });

    test('same-session token rotation preserves an in-flight submit', () async {
      _completeDraft(controller);
      api.putCompleter = Completer<ProfileInput>();

      final submit = controller.submit();
      session.replaceAccessToken('rotated-access-token');
      api.putCompleter!.complete(completeProfileInput);

      expect(await submit, isTrue);
      expect(session.value.accessToken, 'rotated-access-token');
      expect(session.value.isProfileComplete, isTrue);
      expect(api.puts.single.idempotencyKey, ids.generated.single);
    });

    test(
      'successful PUT marks profile complete for exact router redirect',
      () async {
        _completeDraft(controller);

        expect(await controller.submit(), isTrue);

        expect(session.value.isProfileComplete, isTrue);
        expect(api.puts.single.accessToken, 'memory-access-token');
        expect(api.puts.single.input.genderIdentity, 'MAN');
        expect(api.puts.single.input.interestedInGenders, ['MAN']);
        expect(api.puts.single.input.connectionIntents, ['FRIENDSHIP']);
      },
    );

    test('production command ids are RFC 4122 version 4 UUIDs', () {
      expect(
        generateProfileCommandId(),
        matches(
          RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          ),
        ),
      );
    });
  });

  test(
    'unauthorized submit retains draft through disposal and reauthentication',
    () async {
      final api = FakeProfileApi()
        ..putFailure = const ProfileApiException(
          ProfileApiFailure.unauthorized,
          'Your session has expired. Please sign in again.',
        );
      final session = AuthSessionController(
        AuthSession.authenticated(
          accessToken: 'first-memory-token',
          userId: 'user-one',
          isProfileComplete: false,
        ),
      );
      final container = ProviderContainer(
        overrides: [
          profileApiProvider.overrideWithValue(api),
          authSessionControllerProvider.overrideWith((ref) => session),
        ],
      );
      addTearDown(container.dispose);

      final firstSubscription = container.listen(
        profileControllerProvider,
        (_, _) {},
        fireImmediately: true,
      );
      final firstController = container.read(
        profileControllerProvider.notifier,
      );
      firstController.setDisplayName('Retained Minh');
      firstController.setBirthDate('1990-02-03');
      firstController.setGenderIdentity('SELF_DESCRIBED');
      firstController.setGenderLabel('Genderfluid');
      firstController.toggleInterestedGender('MAN');
      firstController.toggleInterestedGender('WOMAN');
      firstController.toggleConnectionIntent('FRIENDSHIP');
      firstController.setHomeLocation('W-BEN-NGHE');
      firstController.setHometownLocation('P-HN');
      firstController.setHeightCm('172');
      firstController.setBio('A retained bio');
      firstController.setFavoriteSongTitle('Retained song');
      firstController.setFavoriteSongArtist('Retained artist');
      firstController.setPromptAnswer('SLOW_DATE', 'A quiet retained coffee');
      final before = firstController.state.draft;

      expect(await firstController.submit(), isFalse);
      expect(session.value.isAuthenticated, isTrue);
      session.signOut();
      firstSubscription.close();
      await container.pump();

      session.authenticate(
        accessToken: 'second-memory-token',
        userId: 'user-one',
        isProfileComplete: false,
      );
      final secondSubscription = container.listen(
        profileControllerProvider,
        (_, _) {},
        fireImmediately: true,
      );
      final secondController = container.read(
        profileControllerProvider.notifier,
      );
      final retained = secondController.state.draft;

      expect(secondController, isNot(same(firstController)));
      expect(retained.displayName, before.displayName);
      expect(retained.genderIdentity, before.genderIdentity);
      expect(retained.genderLabel, before.genderLabel);
      expect(retained.interestedInGenders, before.interestedInGenders);
      expect(retained.connectionIntents, before.connectionIntents);
      expect(retained.homeLocationCode, before.homeLocationCode);
      expect(retained.hometownLocationCode, before.hometownLocationCode);
      expect(retained.heightCm, before.heightCm);
      expect(retained.bio, before.bio);
      expect(retained.favoriteSongTitle, before.favoriteSongTitle);
      expect(retained.favoriteSongArtist, before.favoriteSongArtist);
      expect(retained.promptAnswers, before.promptAnswers);
      final serializedDraft = retained.toInput().toJson().toString();
      expect(serializedDraft, isNot(contains('first-memory-token')));
      expect(serializedDraft, isNot(contains('second-memory-token')));

      api.putFailure = null;
      expect(await secondController.submit(), isTrue);
      secondSubscription.close();
      await container.pump();

      final thirdSubscription = container.listen(
        profileControllerProvider,
        (_, _) {},
        fireImmediately: true,
      );
      addTearDown(thirdSubscription.close);
      expect(
        container.read(profileControllerProvider).draft,
        const ProfileDraft(),
      );
    },
  );

  test(
    'a different authenticated user never receives the retained draft',
    () async {
      final session = AuthSessionController(
        AuthSession.authenticated(
          accessToken: 'first-memory-token',
          userId: 'user-one',
          isProfileComplete: false,
        ),
      );
      final container = ProviderContainer(
        overrides: [
          profileApiProvider.overrideWithValue(FakeProfileApi()),
          authSessionControllerProvider.overrideWith((ref) => session),
        ],
      );
      addTearDown(container.dispose);
      final firstSubscription = container.listen(
        profileControllerProvider,
        (_, _) {},
        fireImmediately: true,
      );
      container
          .read(profileControllerProvider.notifier)
          .setDisplayName('Private draft');
      firstSubscription.close();
      await container.pump();

      session.signOut();
      session.authenticate(
        accessToken: 'different-memory-token',
        userId: 'user-two',
        isProfileComplete: false,
      );
      final secondSubscription = container.listen(
        profileControllerProvider,
        (_, _) {},
        fireImmediately: true,
      );
      addTearDown(secondSubscription.close);

      expect(
        container.read(profileControllerProvider).draft,
        const ProfileDraft(),
      );
      expect(
        container.read(profileControllerProvider).draft.toInput().toString(),
        isNot(contains('different-memory-token')),
      );
    },
  );

  test('explicit discard clears the retained draft', () async {
    final session = AuthSessionController(
      AuthSession.authenticated(
        accessToken: 'memory-token',
        userId: 'discard-user',
        isProfileComplete: false,
      ),
    );
    final container = ProviderContainer(
      overrides: [
        profileApiProvider.overrideWithValue(FakeProfileApi()),
        authSessionControllerProvider.overrideWith((ref) => session),
      ],
    );
    addTearDown(container.dispose);
    final firstSubscription = container.listen(
      profileControllerProvider,
      (_, _) {},
      fireImmediately: true,
    );
    final firstController = container.read(profileControllerProvider.notifier);
    firstController.setDisplayName('Discard me');

    firstController.discardDraft();
    expect(firstController.state.draft, const ProfileDraft());
    firstSubscription.close();
    await container.pump();

    final secondSubscription = container.listen(
      profileControllerProvider,
      (_, _) {},
      fireImmediately: true,
    );
    addTearDown(secondSubscription.close);
    expect(
      container.read(profileControllerProvider).draft,
      const ProfileDraft(),
    );
  });
}

String _repeat(String value, int count) => List.filled(count, value).join();

void _completeDraft(
  ProfileController controller, {
  String birthDate = '1990-02-03',
}) {
  controller.setDisplayName('Minh');
  controller.setBirthDate(birthDate);
  controller.setGenderIdentity('MAN');
  controller.toggleInterestedGender('MAN');
  controller.toggleConnectionIntent('FRIENDSHIP');
  controller.setHomeLocation('W-BEN-NGHE');
}

final class SequenceProfileIds {
  final List<String> generated = [];

  String call() {
    final value =
        '00000000-0000-4000-8000-${(generated.length + 1).toString().padLeft(12, '0')}';
    generated.add(value);
    return value;
  }
}
