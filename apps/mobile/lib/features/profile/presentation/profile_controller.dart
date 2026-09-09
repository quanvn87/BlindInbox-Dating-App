import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:blind_inbox/core/auth/auth_session.dart';
import 'package:blind_inbox/features/profile/data/profile_api.dart';
import 'package:blind_inbox/features/profile/domain/profile_models.dart';

typedef ProfileIdGenerator = String Function();

/// Keeps an unfinished profile in memory across onboarding route lifecycles.
///
/// The store deliberately contains only [ProfileDraft], never authentication
/// credentials. Its provider is not auto-disposed so a 401 redirect can sign
/// the user out without losing their work before they authenticate again.
final class ProfileDraftStore {
  ProfileDraft _draft = const ProfileDraft();
  String? _ownerUserId;

  ProfileDraft draftFor(String? userId) {
    if (userId == null) {
      return const ProfileDraft();
    }
    if (_ownerUserId != userId) {
      _ownerUserId = userId;
      _draft = const ProfileDraft();
    }
    return _draft;
  }

  void save(String userId, ProfileDraft draft) {
    if (_ownerUserId != userId) {
      _ownerUserId = userId;
      _draft = const ProfileDraft();
    }
    _draft = draft;
  }

  void clear(String? userId) {
    if (userId != null && _ownerUserId != userId) {
      return;
    }
    _draft = const ProfileDraft();
  }
}

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
    ProfileDraftStore? draftStore,
  }) => ProfileController._(
    api: api,
    sessionController: sessionController,
    generateId: generateId ?? generateProfileCommandId,
    draftStore: draftStore ?? ProfileDraftStore(),
  );

  ProfileController._({
    required this._api,
    required this._sessionController,
    required this._generateId,
    required ProfileDraftStore draftStore,
  }) : _draftStore = draftStore,
       _boundUserId = _sessionController.value.userId,
       _boundSessionLineage = _sessionController.sessionLineage,
       super(
         ProfileState(
           draft: draftStore.draftFor(_sessionController.value.userId),
         ),
       ) {
    _sessionController.addListener(_handleIdentityChange);
  }

  final ProfileApi _api;
  final AuthSessionController _sessionController;
  final ProfileIdGenerator _generateId;
  final ProfileDraftStore _draftStore;
  String? _boundUserId;
  int _boundSessionLineage;
  Object? _activeSubmit;

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
    final submittingSession = _sessionController.value;
    final accessToken = submittingSession.accessToken;
    final submittingUserId = submittingSession.userId;
    if (accessToken == null || submittingUserId == null) {
      state = state.copyWith(submitError: _sessionExpiredError);
      return false;
    }

    final input = state.draft.toInput();
    final idempotencyKey = _generateId();
    final submittingSessionLineage = _sessionController.sessionLineage;
    final submitOperation = Object();
    _activeSubmit = submitOperation;
    state = state.copyWith(isSubmitting: true, submitError: null);
    try {
      await _api.putProfile(
        accessToken: accessToken,
        idempotencyKey: idempotencyKey,
        input: input,
      );
      if (!_ownsSubmit(
        operation: submitOperation,
        userId: submittingUserId,
        sessionLineage: submittingSessionLineage,
      )) {
        return false;
      }
      _activeSubmit = null;
      _draftStore.clear(submittingUserId);
      state = state.copyWith(
        draft: const ProfileDraft(),
        isSubmitting: false,
        submitError: null,
      );
      _sessionController.markProfileComplete();
      return true;
    } on ProfileApiException catch (error) {
      if (_ownsSubmit(
        operation: submitOperation,
        userId: submittingUserId,
        sessionLineage: submittingSessionLineage,
      )) {
        _activeSubmit = null;
        state = state.copyWith(
          isSubmitting: false,
          submitError: error.userMessage,
        );
      }
      return false;
    } on Object {
      if (_ownsSubmit(
        operation: submitOperation,
        userId: submittingUserId,
        sessionLineage: submittingSessionLineage,
      )) {
        _activeSubmit = null;
        state = state.copyWith(
          isSubmitting: false,
          submitError: _unexpectedError,
        );
      }
      return false;
    }
  }

  bool _ownsSubmit({
    required Object operation,
    required String userId,
    required int sessionLineage,
  }) =>
      !_disposed &&
      identical(_activeSubmit, operation) &&
      _sessionController.sessionLineage == sessionLineage &&
      _sessionController.value.userId == userId &&
      _boundUserId == userId;

  void _updateDraft(ProfileDraft draft) {
    if (_disposed || state.isSubmitting) {
      return;
    }
    final userId = _boundUserId;
    if (userId == null) {
      return;
    }
    _draftStore.save(userId, draft);
    state = state.copyWith(draft: draft, submitError: null);
  }

  void discardDraft() {
    if (_disposed || state.isSubmitting) {
      return;
    }
    _draftStore.clear(_boundUserId);
    state = state.copyWith(draft: const ProfileDraft(), submitError: null);
  }

  List<String> _toggle(List<String> values, String code) {
    final updated = values.toSet();
    if (!updated.add(code)) {
      updated.remove(code);
    }
    return updated.toList(growable: false);
  }

  void _handleIdentityChange() {
    if (_disposed) {
      return;
    }
    final userId = _sessionController.value.userId;
    final sessionLineage = _sessionController.sessionLineage;
    final lineageChanged = sessionLineage != _boundSessionLineage;
    final userChanged = userId != null && userId != _boundUserId;
    if (!lineageChanged && !userChanged) {
      return;
    }
    _boundSessionLineage = sessionLineage;
    _activeSubmit = null;
    if (userChanged) {
      _boundUserId = userId;
    }
    state = state.copyWith(
      draft: userChanged ? _draftStore.draftFor(userId) : state.draft,
      isSubmitting: false,
      submitError: null,
    );
  }

  @override
  void dispose() {
    _disposed = true;
    _sessionController.removeListener(_handleIdentityChange);
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

final profileDraftStoreProvider = Provider<ProfileDraftStore>(
  (ref) => ProfileDraftStore(),
);

final profileControllerProvider =
    StateNotifierProvider.autoDispose<ProfileController, ProfileState>((ref) {
      return ProfileController(
        api: ref.watch(profileApiProvider),
        sessionController: ref.read(authSessionControllerProvider),
        draftStore: ref.read(profileDraftStoreProvider),
      );
    });
