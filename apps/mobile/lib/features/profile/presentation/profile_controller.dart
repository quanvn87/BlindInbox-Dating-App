import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:slow_dating/core/auth/auth_session.dart';
import 'package:slow_dating/features/profile/data/profile_api.dart';
import 'package:slow_dating/features/profile/domain/profile_models.dart';

typedef ProfileIdGenerator = String Function();

@immutable
final class ProfileState {
  const ProfileState({
    this.catalog,
    this.draft = const ProfileDraft(),
    this.isCatalogLoading = false,
    this.isSubmitting = false,
    this.catalogError,
    this.submitError,
  });

  final ProfileCatalog? catalog;
  final ProfileDraft draft;
  final bool isCatalogLoading;
  final bool isSubmitting;
  final String? catalogError;
  final String? submitError;

  bool get canSubmit => draft.canSubmit && !isSubmitting;

  ProfileState copyWith({
    Object? catalog = _notSet,
    ProfileDraft? draft,
    bool? isCatalogLoading,
    bool? isSubmitting,
    Object? catalogError = _notSet,
    Object? submitError = _notSet,
  }) => ProfileState(
    catalog: identical(catalog, _notSet)
        ? this.catalog
        : catalog as ProfileCatalog?,
    draft: draft ?? this.draft,
    isCatalogLoading: isCatalogLoading ?? this.isCatalogLoading,
    isSubmitting: isSubmitting ?? this.isSubmitting,
    catalogError: identical(catalogError, _notSet)
        ? this.catalogError
        : catalogError as String?,
    submitError: identical(submitError, _notSet)
        ? this.submitError
        : submitError as String?,
  );
}

const _notSet = Object();

final class ProfileController extends StateNotifier<ProfileState> {
  factory ProfileController({
    required ProfileApi api,
    required AuthSessionController sessionController,
    ProfileIdGenerator? generateId,
  }) => ProfileController._(
    api: api,
    sessionController: sessionController,
    generateId: generateId ?? generateProfileCommandId,
  );

  ProfileController._({
    required this._api,
    required this._sessionController,
    required this._generateId,
  }) : super(const ProfileState());

  final ProfileApi _api;
  final AuthSessionController _sessionController;
  final ProfileIdGenerator _generateId;

  bool _disposed = false;

  Future<void> loadCatalog() async {
    if (_disposed || state.isCatalogLoading) {
      return;
    }
    state = state.copyWith(isCatalogLoading: true, catalogError: null);
    try {
      final catalog = await _api.getCatalog();
      if (_disposed) {
        return;
      }
      state = state.copyWith(
        catalog: catalog,
        isCatalogLoading: false,
        catalogError: null,
      );
    } on ProfileApiException catch (error) {
      if (!_disposed) {
        state = state.copyWith(
          catalog: null,
          isCatalogLoading: false,
          catalogError: error.userMessage,
        );
      }
    } on Object {
      if (!_disposed) {
        state = state.copyWith(
          catalog: null,
          isCatalogLoading: false,
          catalogError: _unexpectedError,
        );
      }
    }
  }

  void setDisplayName(String value) =>
      _updateDraft(state.draft.copyWith(displayName: value));

  void setBirthDate(String value) =>
      _updateDraft(state.draft.copyWith(birthDate: value));

  void setGenderIdentity(String value) {
    _updateDraft(
      state.draft.copyWith(
        genderIdentity: value,
        genderLabel: value == 'SELF_DESCRIBED' ? null : '',
      ),
    );
  }

  void setGenderLabel(String value) =>
      _updateDraft(state.draft.copyWith(genderLabel: value));

  void toggleInterestedGender(String code) {
    _updateDraft(
      state.draft.copyWith(
        interestedInGenders: _toggle(state.draft.interestedInGenders, code),
      ),
    );
  }

  void toggleConnectionIntent(String code) {
    _updateDraft(
      state.draft.copyWith(
        connectionIntents: _toggle(state.draft.connectionIntents, code),
      ),
    );
  }

  void setHeightCm(String value) =>
      _updateDraft(state.draft.copyWith(heightCm: value));

  void setHomeLocation(String? code) =>
      _updateDraft(state.draft.copyWith(homeLocationCode: code));

  void setHometownLocation(String? code) =>
      _updateDraft(state.draft.copyWith(hometownLocationCode: code));

  void setBio(String value) => _updateDraft(state.draft.copyWith(bio: value));

  void setFavoriteSongTitle(String value) =>
      _updateDraft(state.draft.copyWith(favoriteSongTitle: value));

  void setFavoriteSongArtist(String value) =>
      _updateDraft(state.draft.copyWith(favoriteSongArtist: value));

  void setPromptAnswer(String promptCode, String value) {
    final answers = Map<String, String>.of(state.draft.promptAnswers);
    if (value.isEmpty) {
      answers.remove(promptCode);
    } else {
      answers[promptCode] = value;
    }
    _updateDraft(state.draft.copyWith(promptAnswers: answers));
  }

  Future<bool> submit() async {
    if (_disposed || !state.canSubmit) {
      return false;
    }
    final accessToken = _sessionController.value.accessToken;
    if (accessToken == null) {
      state = state.copyWith(submitError: _sessionExpiredError);
      return false;
    }

    final input = state.draft.toInput();
    final idempotencyKey = _generateId();
    state = state.copyWith(isSubmitting: true, submitError: null);
    try {
      await _api.putProfile(
        accessToken: accessToken,
        idempotencyKey: idempotencyKey,
        input: input,
      );
      if (_disposed) {
        return false;
      }
      state = state.copyWith(isSubmitting: false, submitError: null);
      _sessionController.markProfileComplete();
      return true;
    } on ProfileApiException catch (error) {
      if (!_disposed) {
        if (error.kind == ProfileApiFailure.unauthorized) {
          _sessionController.signOut();
        }
        state = state.copyWith(
          isSubmitting: false,
          submitError: error.userMessage,
        );
      }
      return false;
    } on Object {
      if (!_disposed) {
        state = state.copyWith(
          isSubmitting: false,
          submitError: _unexpectedError,
        );
      }
      return false;
    }
  }

  void _updateDraft(ProfileDraft draft) {
    if (_disposed || state.isSubmitting) {
      return;
    }
    state = state.copyWith(draft: draft, submitError: null);
  }

  List<String> _toggle(List<String> values, String code) {
    final updated = values.toSet();
    if (!updated.add(code)) {
      updated.remove(code);
    }
    return updated.toList(growable: false);
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

String generateProfileCommandId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes
      .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
      .join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-'
      '${hex.substring(20)}';
}

const _unexpectedError = 'Something went wrong. Please try again.';
const _sessionExpiredError = 'Your session has expired. Please sign in again.';

final profileControllerProvider =
    StateNotifierProvider.autoDispose<ProfileController, ProfileState>((ref) {
      return ProfileController(
        api: ref.watch(profileApiProvider),
        sessionController: ref.read(authSessionControllerProvider),
      );
    });
