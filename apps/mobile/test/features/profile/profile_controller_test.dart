import 'dart:async';

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
}

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
