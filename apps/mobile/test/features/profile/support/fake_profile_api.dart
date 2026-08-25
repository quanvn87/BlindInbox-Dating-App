import 'dart:async';

import 'package:slow_dating/features/profile/data/profile_api.dart';
import 'package:slow_dating/features/profile/domain/profile_models.dart';

final class FakeProfileApi implements ProfileApi {
  ProfileCatalog catalog = testProfileCatalog;
  ProfileInput? currentProfile;
  ProfileApiException? catalogFailure;
  ProfileApiException? getFailure;
  ProfileApiException? putFailure;
  Completer<void>? getStarted;
  Completer<ProfileInput?>? getCompleter;
  Completer<ProfileInput>? putCompleter;

  final List<String> profileReads = [];
  final List<({String accessToken, String idempotencyKey, ProfileInput input})>
  puts = [];

  @override
  Future<ProfileCatalog> getCatalog() async {
    final failure = catalogFailure;
    if (failure != null) {
      throw failure;
    }
    return catalog;
  }

  @override
  Future<ProfileInput?> getProfile({required String accessToken}) async {
    profileReads.add(accessToken);
    final started = getStarted;
    if (started != null && !started.isCompleted) {
      started.complete();
    }
    final completer = getCompleter;
    if (completer != null) {
      return completer.future;
    }
    final failure = getFailure;
    if (failure != null) {
      throw failure;
    }
    return currentProfile;
  }

  @override
  Future<ProfileInput> putProfile({
    required String accessToken,
    required String idempotencyKey,
    required ProfileInput input,
  }) async {
    puts.add((
      accessToken: accessToken,
      idempotencyKey: idempotencyKey,
      input: input,
    ));
    final failure = putFailure;
    if (failure != null) {
      throw failure;
    }
    final completer = putCompleter;
    if (completer != null) {
      return completer.future;
    }
    return input;
  }
}

const testProfileCatalog = ProfileCatalog(
  genders: [
    CatalogOption(code: 'MAN', label: 'A man', isActive: true),
    CatalogOption(code: 'WOMAN', label: 'A woman', isActive: true),
    CatalogOption(
      code: 'SELF_DESCRIBED',
      label: 'In my own words',
      isActive: true,
    ),
    CatalogOption(code: 'INACTIVE', label: 'Unavailable', isActive: false),
  ],
  connectionIntents: [
    CatalogOption(code: 'FRIENDSHIP', label: 'Friendship only', isActive: true),
    CatalogOption(
      code: 'LONG_TERM_DATING',
      label: 'A long-term relationship',
      isActive: true,
    ),
  ],
  locations: [
    LocationOption(
      code: 'P-HCM',
      name: 'Ho Chi Minh City',
      level: LocationLevel.province,
      parentCode: null,
      isActive: true,
    ),
    LocationOption(
      code: 'D-1',
      name: 'District 1',
      level: LocationLevel.district,
      parentCode: 'P-HCM',
      isActive: true,
    ),
    LocationOption(
      code: 'W-BEN-NGHE',
      name: 'Ben Nghe Ward',
      level: LocationLevel.ward,
      parentCode: 'D-1',
      isActive: true,
    ),
    LocationOption(
      code: 'P-HN',
      name: 'Ha Noi',
      level: LocationLevel.province,
      parentCode: null,
      isActive: true,
    ),
  ],
  prompts: [
    ProfilePrompt(
      code: 'SLOW_DATE',
      text: 'My ideal slow date is...',
      isActive: true,
    ),
  ],
);

const completeProfileInput = ProfileInput(
  displayName: 'Minh',
  birthDate: '1990-02-03',
  genderIdentity: 'MAN',
  genderLabel: null,
  interestedInGenders: ['MAN'],
  connectionIntents: ['FRIENDSHIP'],
  heightCm: null,
  hometownLocationCode: null,
  homeLocationCode: 'W-BEN-NGHE',
  bio: '',
  favoriteSongTitle: null,
  favoriteSongArtist: null,
  promptAnswers: [],
);
