import 'package:flutter/foundation.dart';

@immutable
final class CatalogOption {
  const CatalogOption({
    required this.code,
    required this.label,
    required this.isActive,
  });

  factory CatalogOption.fromJson(Object? value) {
    final json = _jsonObject(value);
    return CatalogOption(
      code: _jsonString(json, 'code'),
      label: _jsonString(json, 'label'),
      isActive: _jsonBool(json, 'isActive'),
    );
  }

  final String code;
  final String label;
  final bool isActive;

  @override
  bool operator ==(Object other) =>
      other is CatalogOption &&
      other.code == code &&
      other.label == label &&
      other.isActive == isActive;

  @override
  int get hashCode => Object.hash(code, label, isActive);
}

enum LocationLevel {
  province('PROVINCE'),
  district('DISTRICT'),
  ward('WARD');

  const LocationLevel(this.code);

  final String code;

  static LocationLevel parse(String value) => switch (value) {
    'PROVINCE' => province,
    'DISTRICT' => district,
    'WARD' => ward,
    _ => throw const FormatException('Invalid location level'),
  };
}

@immutable
final class LocationOption {
  const LocationOption({
    required this.code,
    required this.name,
    required this.level,
    required this.parentCode,
    required this.isActive,
  });

  factory LocationOption.fromJson(Object? value) {
    final json = _jsonObject(value);
    return LocationOption(
      code: _jsonString(json, 'code'),
      name: _jsonString(json, 'name'),
      level: LocationLevel.parse(_jsonString(json, 'level')),
      parentCode: _jsonNullableString(json, 'parentCode'),
      isActive: _jsonBool(json, 'isActive'),
    );
  }

  final String code;
  final String name;
  final LocationLevel level;
  final String? parentCode;
  final bool isActive;

  @override
  bool operator ==(Object other) =>
      other is LocationOption &&
      other.code == code &&
      other.name == name &&
      other.level == level &&
      other.parentCode == parentCode &&
      other.isActive == isActive;

  @override
  int get hashCode => Object.hash(code, name, level, parentCode, isActive);
}

@immutable
final class ProfilePrompt {
  const ProfilePrompt({
    required this.code,
    required this.text,
    required this.isActive,
  });

  factory ProfilePrompt.fromJson(Object? value) {
    final json = _jsonObject(value);
    return ProfilePrompt(
      code: _jsonString(json, 'code'),
      text: _jsonString(json, 'text'),
      isActive: _jsonBool(json, 'isActive'),
    );
  }

  final String code;
  final String text;
  final bool isActive;
}

@immutable
final class ProfileCatalog {
  const ProfileCatalog({
    required this.genders,
    required this.connectionIntents,
    required this.locations,
    required this.prompts,
  });

  factory ProfileCatalog.fromJson(Object? value) {
    final json = _jsonObject(value);
    return ProfileCatalog(
      genders: _jsonList(json, 'genders').map(CatalogOption.fromJson).toList(),
      connectionIntents: _jsonList(
        json,
        'connectionIntents',
      ).map(CatalogOption.fromJson).toList(),
      locations: _jsonList(
        json,
        'locations',
      ).map(LocationOption.fromJson).toList(),
      prompts: _jsonList(json, 'prompts').map(ProfilePrompt.fromJson).toList(),
    );
  }

  final List<CatalogOption> genders;
  final List<CatalogOption> connectionIntents;
  final List<LocationOption> locations;
  final List<ProfilePrompt> prompts;

  List<CatalogOption> get activeGenders =>
      genders.where((option) => option.isActive).toList(growable: false);

  List<CatalogOption> get activeConnectionIntents => connectionIntents
      .where((option) => option.isActive)
      .toList(growable: false);

  List<LocationOption> get activeLocations =>
      locations.where((option) => option.isActive).toList(growable: false);

  List<ProfilePrompt> get activePrompts =>
      prompts.where((prompt) => prompt.isActive).toList(growable: false);
}

@immutable
final class PromptAnswer {
  const PromptAnswer({required this.promptCode, required this.answer});

  factory PromptAnswer.fromJson(Object? value) {
    final json = _jsonObject(value);
    return PromptAnswer(
      promptCode: _jsonString(json, 'promptCode'),
      answer: _jsonString(json, 'answer'),
    );
  }

  final String promptCode;
  final String answer;

  Map<String, Object?> toJson() => {
    'promptCode': promptCode.trim(),
    'answer': answer.trim(),
  };
}

@immutable
final class ProfileInput {
  const ProfileInput({
    required this.displayName,
    required this.birthDate,
    required this.genderIdentity,
    required this.genderLabel,
    required this.interestedInGenders,
    required this.connectionIntents,
    required this.heightCm,
    required this.hometownLocationCode,
    required this.homeLocationCode,
    required this.bio,
    required this.favoriteSongTitle,
    required this.favoriteSongArtist,
    required this.promptAnswers,
  });

  factory ProfileInput.fromJson(Object? value) {
    final json = _jsonObject(value);
    return ProfileInput(
      displayName: _jsonString(json, 'displayName'),
      birthDate: _jsonString(json, 'birthDate'),
      genderIdentity: _jsonString(json, 'genderIdentity'),
      genderLabel: _jsonNullableString(json, 'genderLabel'),
      interestedInGenders: _jsonList(
        json,
        'interestedInGenders',
      ).map(_jsonListString).toList(),
      connectionIntents: _jsonList(
        json,
        'connectionIntents',
      ).map(_jsonListString).toList(),
      heightCm: _jsonNullableInt(json, 'heightCm'),
      hometownLocationCode: _jsonNullableString(json, 'hometownLocationCode'),
      homeLocationCode: _jsonString(json, 'homeLocationCode'),
      bio: _jsonString(json, 'bio'),
      favoriteSongTitle: _jsonNullableString(json, 'favoriteSongTitle'),
      favoriteSongArtist: _jsonNullableString(json, 'favoriteSongArtist'),
      promptAnswers: _jsonList(
        json,
        'promptAnswers',
      ).map(PromptAnswer.fromJson).toList(),
    );
  }

  final String displayName;
  final String birthDate;
  final String genderIdentity;
  final String? genderLabel;
  final List<String> interestedInGenders;
  final List<String> connectionIntents;
  final int? heightCm;
  final String? hometownLocationCode;
  final String homeLocationCode;
  final String bio;
  final String? favoriteSongTitle;
  final String? favoriteSongArtist;
  final List<PromptAnswer> promptAnswers;

  ProfileInput copyWith({
    List<String>? interestedInGenders,
    List<String>? connectionIntents,
    List<PromptAnswer>? promptAnswers,
  }) => ProfileInput(
    displayName: displayName,
    birthDate: birthDate,
    genderIdentity: genderIdentity,
    genderLabel: genderLabel,
    interestedInGenders: interestedInGenders ?? this.interestedInGenders,
    connectionIntents: connectionIntents ?? this.connectionIntents,
    heightCm: heightCm,
    hometownLocationCode: hometownLocationCode,
    homeLocationCode: homeLocationCode,
    bio: bio,
    favoriteSongTitle: favoriteSongTitle,
    favoriteSongArtist: favoriteSongArtist,
    promptAnswers: promptAnswers ?? this.promptAnswers,
  );

  Map<String, Object?> toJson() {
    final answersByCode = <String, PromptAnswer>{};
    for (final answer in promptAnswers) {
      answersByCode[answer.promptCode] = answer;
    }
    return {
      'displayName': displayName.trim(),
      'birthDate': birthDate.trim(),
      'genderIdentity': genderIdentity,
      'genderLabel': genderIdentity == 'SELF_DESCRIBED'
          ? _trimmedOrNull(genderLabel)
          : null,
      'interestedInGenders': interestedInGenders.toSet().toList(),
      'connectionIntents': connectionIntents.toSet().toList(),
      'heightCm': heightCm,
      'hometownLocationCode': _trimmedOrNull(hometownLocationCode),
      'homeLocationCode': homeLocationCode.trim(),
      'bio': bio.trim(),
      'favoriteSongTitle': _trimmedOrNull(favoriteSongTitle),
      'favoriteSongArtist': _trimmedOrNull(favoriteSongArtist),
      'promptAnswers': answersByCode.values
          .where((answer) => answer.answer.trim().isNotEmpty)
          .map((answer) => answer.toJson())
          .toList(),
    };
  }
}

const _notSet = Object();

@immutable
final class ProfileDraft {
  const ProfileDraft({
    this.displayName = '',
    this.birthDate = '',
    this.genderIdentity,
    this.genderLabel = '',
    this.interestedInGenders = const [],
    this.connectionIntents = const [],
    this.heightCm = '',
    this.hometownLocationCode,
    this.homeLocationCode,
    this.bio = '',
    this.favoriteSongTitle = '',
    this.favoriteSongArtist = '',
    this.promptAnswers = const {},
  });

  final String displayName;
  final String birthDate;
  final String? genderIdentity;
  final String genderLabel;
  final List<String> interestedInGenders;
  final List<String> connectionIntents;
  final String heightCm;
  final String? hometownLocationCode;
  final String? homeLocationCode;
  final String bio;
  final String favoriteSongTitle;
  final String favoriteSongArtist;
  final Map<String, String> promptAnswers;

  bool get hasRequiredFields =>
      displayName.trim().length >= 2 &&
      birthDate.trim().isNotEmpty &&
      genderIdentity != null &&
      (genderIdentity != 'SELF_DESCRIBED' || genderLabel.trim().length >= 2) &&
      interestedInGenders.isNotEmpty &&
      connectionIntents.isNotEmpty &&
      homeLocationCode?.trim().isNotEmpty == true;

  bool get canSubmit =>
      hasRequiredFields &&
      displayNameError == null &&
      genderLabelError == null &&
      birthDateError == null &&
      heightError == null &&
      favoriteSongError == null &&
      bioError == null &&
      promptAnswersError == null;

  String? get displayNameError {
    if (displayName.isEmpty) {
      return null;
    }
    if (displayName.trim().length < 2 || displayName.length > 50) {
      return 'Display name must be 2 to 50 characters.';
    }
    return null;
  }

  String? get genderLabelError {
    if (genderIdentity != 'SELF_DESCRIBED' || genderLabel.isEmpty) {
      return null;
    }
    if (genderLabel.trim().length < 2 || genderLabel.length > 50) {
      return 'Describe your gender in 2 to 50 characters.';
    }
    return null;
  }

  String? get birthDateError {
    final value = birthDate.trim();
    if (value.isEmpty) {
      return null;
    }
    final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(value);
    if (match == null) {
      return 'Use YYYY-MM-DD for a valid calendar date.';
    }
    final year = int.parse(match.group(1)!);
    final month = int.parse(match.group(2)!);
    final day = int.parse(match.group(3)!);
    final parsed = DateTime.utc(year, month, day);
    if (parsed.year != year || parsed.month != month || parsed.day != day) {
      return 'Use YYYY-MM-DD for a valid calendar date.';
    }
    return null;
  }

  String? get heightError {
    final value = heightCm.trim();
    if (value.isEmpty) {
      return null;
    }
    final height = int.tryParse(value);
    if (height == null || height < 100 || height > 250) {
      return 'Enter a whole number from 100 to 250.';
    }
    return null;
  }

  String? get favoriteSongError {
    final hasTitle = favoriteSongTitle.trim().isNotEmpty;
    final hasArtist = favoriteSongArtist.trim().isNotEmpty;
    if (hasTitle != hasArtist) {
      return 'Add both song title and artist, or leave both blank.';
    }
    return null;
  }

  String? get bioError =>
      bio.length > 500 ? 'Bio must be 500 characters or fewer.' : null;

  String? get promptAnswersError {
    for (final entry in promptAnswers.entries) {
      if (entry.key.trim().isEmpty ||
          entry.value.trim().isEmpty ||
          entry.value.length > 280) {
        return 'Answer must be nonblank and 280 characters or fewer.';
      }
    }
    return null;
  }

  String? promptAnswerError(String promptCode) {
    final answer = promptAnswers[promptCode];
    if (answer == null) {
      return null;
    }
    if (promptCode.trim().isEmpty ||
        answer.trim().isEmpty ||
        answer.length > 280) {
      return 'Answer must be nonblank and 280 characters or fewer.';
    }
    return null;
  }

  ProfileInput toInput() => ProfileInput(
    displayName: displayName,
    birthDate: birthDate,
    genderIdentity: genderIdentity ?? '',
    genderLabel: genderIdentity == 'SELF_DESCRIBED'
        ? _trimmedOrNull(genderLabel)
        : null,
    interestedInGenders: interestedInGenders.toSet().toList(),
    connectionIntents: connectionIntents.toSet().toList(),
    heightCm: int.tryParse(heightCm.trim()),
    hometownLocationCode: _trimmedOrNull(hometownLocationCode),
    homeLocationCode: homeLocationCode ?? '',
    bio: bio,
    favoriteSongTitle: _trimmedOrNull(favoriteSongTitle),
    favoriteSongArtist: _trimmedOrNull(favoriteSongArtist),
    promptAnswers: promptAnswers.entries
        .where((entry) => entry.value.trim().isNotEmpty)
        .map(
          (entry) => PromptAnswer(promptCode: entry.key, answer: entry.value),
        )
        .toList(),
  );

  ProfileDraft copyWith({
    String? displayName,
    String? birthDate,
    Object? genderIdentity = _notSet,
    String? genderLabel,
    List<String>? interestedInGenders,
    List<String>? connectionIntents,
    String? heightCm,
    Object? hometownLocationCode = _notSet,
    Object? homeLocationCode = _notSet,
    String? bio,
    String? favoriteSongTitle,
    String? favoriteSongArtist,
    Map<String, String>? promptAnswers,
  }) => ProfileDraft(
    displayName: displayName ?? this.displayName,
    birthDate: birthDate ?? this.birthDate,
    genderIdentity: identical(genderIdentity, _notSet)
        ? this.genderIdentity
        : genderIdentity as String?,
    genderLabel: genderLabel ?? this.genderLabel,
    interestedInGenders: interestedInGenders ?? this.interestedInGenders,
    connectionIntents: connectionIntents ?? this.connectionIntents,
    heightCm: heightCm ?? this.heightCm,
    hometownLocationCode: identical(hometownLocationCode, _notSet)
        ? this.hometownLocationCode
        : hometownLocationCode as String?,
    homeLocationCode: identical(homeLocationCode, _notSet)
        ? this.homeLocationCode
        : homeLocationCode as String?,
    bio: bio ?? this.bio,
    favoriteSongTitle: favoriteSongTitle ?? this.favoriteSongTitle,
    favoriteSongArtist: favoriteSongArtist ?? this.favoriteSongArtist,
    promptAnswers: promptAnswers ?? this.promptAnswers,
  );
}

Map<String, Object?> _jsonObject(Object? value) {
  if (value is! Map) {
    throw const FormatException('Expected JSON object');
  }
  return value.map((key, value) => MapEntry(key.toString(), value));
}

List<Object?> _jsonList(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is! List) {
    throw const FormatException('Expected JSON list');
  }
  return value;
}

String _jsonString(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is! String) {
    throw const FormatException('Expected JSON string');
  }
  return value;
}

String _jsonListString(Object? value) {
  if (value is! String) {
    throw const FormatException('Expected JSON string');
  }
  return value;
}

String? _jsonNullableString(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value == null) {
    return null;
  }
  if (value is! String) {
    throw const FormatException('Expected nullable JSON string');
  }
  return value;
}

int? _jsonNullableInt(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value == null) {
    return null;
  }
  if (value is! int) {
    throw const FormatException('Expected nullable JSON integer');
  }
  return value;
}

bool _jsonBool(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is! bool) {
    throw const FormatException('Expected JSON boolean');
  }
  return value;
}

String? _trimmedOrNull(String? value) {
  final trimmed = value?.trim();
  return trimmed == null || trimmed.isEmpty ? null : trimmed;
}
