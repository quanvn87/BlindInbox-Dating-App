import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:slow_dating/features/profile/domain/profile_models.dart';
import 'package:slow_dating/features/profile/presentation/profile_controller.dart';
import 'package:slow_dating/features/profile/presentation/widgets/catalog_multi_select.dart';
import 'package:slow_dating/features/profile/presentation/widgets/location_selector.dart';

final class ProfileOnboardingScreen extends ConsumerStatefulWidget {
  const ProfileOnboardingScreen({super.key});

  @override
  ConsumerState<ProfileOnboardingScreen> createState() =>
      _ProfileOnboardingScreenState();
}

final class _ProfileOnboardingScreenState
    extends ConsumerState<ProfileOnboardingScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(
      () => ref.read(profileControllerProvider.notifier).loadCatalog(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(profileControllerProvider);
    return Scaffold(
      key: const ValueKey('onboarding-screen'),
      appBar: AppBar(title: const Text('Complete your profile')),
      body: SafeArea(
        child: switch (state) {
          ProfileState(isCatalogLoading: true, catalog: null) => const Center(
            child: CircularProgressIndicator(
              semanticsLabel: 'Loading profile options',
            ),
          ),
          ProfileState(catalogError: final String error, catalog: null) =>
            _CatalogError(error: error),
          ProfileState(catalog: final ProfileCatalog catalog) => _ProfileForm(
            state: state,
            catalog: catalog,
          ),
          _ => const SizedBox.shrink(),
        },
      ),
    );
  }
}

final class _CatalogError extends ConsumerWidget {
  const _CatalogError({required this.error});

  final String error;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(error, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: () =>
                  ref.read(profileControllerProvider.notifier).loadCatalog(),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

final class _ProfileForm extends ConsumerWidget {
  const _ProfileForm({required this.state, required this.catalog});

  final ProfileState state;
  final ProfileCatalog catalog;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(profileControllerProvider.notifier);
    final draft = state.draft;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(
              'Tell us about you',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Slow Dating is for adults aged 18 and over. Your birth date confirms eligibility.',
          ),
          const SizedBox(height: 20),
          TextFormField(
            key: const ValueKey('display-name-input'),
            initialValue: draft.displayName,
            decoration: const InputDecoration(
              labelText: 'Display name *',
              border: OutlineInputBorder(),
            ),
            maxLength: 50,
            textInputAction: TextInputAction.next,
            onChanged: controller.setDisplayName,
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const ValueKey('birth-date-input'),
            initialValue: draft.birthDate,
            decoration: const InputDecoration(
              labelText: 'Birth date *',
              hintText: 'YYYY-MM-DD',
              border: OutlineInputBorder(),
            ).copyWith(errorText: draft.birthDateError),
            keyboardType: TextInputType.datetime,
            onChanged: controller.setBirthDate,
          ),
          const SizedBox(height: 20),
          Text(
            'Gender identity *',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          RadioGroup<String>(
            groupValue: draft.genderIdentity,
            onChanged: (value) {
              if (value != null) {
                controller.setGenderIdentity(value);
              }
            },
            child: Column(
              children: [
                for (final option in catalog.activeGenders)
                  Builder(
                    builder: (context) {
                      final selected = draft.genderIdentity == option.code;
                      return Semantics(
                        key: ValueKey('identity-${option.code}'),
                        selected: selected,
                        child: RadioListTile<String>(
                          contentPadding: EdgeInsets.zero,
                          title: Text(option.label),
                          value: option.code,
                        ),
                      );
                    },
                  ),
              ],
            ),
          ),
          if (draft.genderIdentity == 'SELF_DESCRIBED') ...[
            TextFormField(
              key: const ValueKey('gender-label-input'),
              initialValue: draft.genderLabel,
              decoration: const InputDecoration(
                labelText: 'Describe your gender *',
                border: OutlineInputBorder(),
              ),
              maxLength: 50,
              onChanged: controller.setGenderLabel,
            ),
            const SizedBox(height: 12),
          ],
          CatalogMultiSelect(
            title: 'Interested in *',
            options: catalog.activeGenders,
            selectedCodes: draft.interestedInGenders,
            keyPrefix: 'interest',
            onToggle: controller.toggleInterestedGender,
          ),
          const SizedBox(height: 12),
          CatalogMultiSelect(
            title: 'What are you here for? *',
            options: catalog.activeConnectionIntents,
            selectedCodes: draft.connectionIntents,
            keyPrefix: 'intent',
            onToggle: controller.toggleConnectionIntent,
          ),
          const SizedBox(height: 20),
          LocationSelector(
            title: 'Home location',
            locations: catalog.activeLocations,
            selectedCode: draft.homeLocationCode,
            keyPrefix: 'home-location',
            isRequired: true,
            onChanged: controller.setHomeLocation,
          ),
          const SizedBox(height: 8),
          const Text('Your precise location is not shown to other members.'),
          const SizedBox(height: 20),
          LocationSelector(
            title: 'Hometown (optional)',
            locations: catalog.activeLocations,
            selectedCode: draft.hometownLocationCode,
            keyPrefix: 'hometown-location',
            onChanged: controller.setHometownLocation,
          ),
          const SizedBox(height: 20),
          Text(
            'A little more about you (optional)',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          TextFormField(
            key: const ValueKey('height-input'),
            initialValue: draft.heightCm,
            decoration: const InputDecoration(
              labelText: 'Height (cm)',
              border: OutlineInputBorder(),
            ).copyWith(errorText: draft.heightError),
            keyboardType: TextInputType.number,
            onChanged: controller.setHeightCm,
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const ValueKey('bio-input'),
            initialValue: draft.bio,
            decoration: const InputDecoration(
              labelText: 'Bio',
              border: OutlineInputBorder(),
            ),
            maxLength: 500,
            maxLines: 4,
            onChanged: controller.setBio,
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const ValueKey('favorite-song-title-input'),
            initialValue: draft.favoriteSongTitle,
            decoration: const InputDecoration(
              labelText: 'Favorite song title',
              helperText: 'Both song fields are optional.',
              border: OutlineInputBorder(),
            ),
            onChanged: controller.setFavoriteSongTitle,
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const ValueKey('favorite-song-artist-input'),
            initialValue: draft.favoriteSongArtist,
            decoration: const InputDecoration(
              labelText: 'Favorite song artist',
              border: OutlineInputBorder(),
            ).copyWith(errorText: draft.favoriteSongError),
            onChanged: controller.setFavoriteSongArtist,
          ),
          for (final prompt in catalog.activePrompts) ...[
            const SizedBox(height: 12),
            TextFormField(
              key: ValueKey('prompt-${prompt.code}'),
              initialValue: draft.promptAnswers[prompt.code] ?? '',
              decoration: InputDecoration(
                labelText: prompt.text,
                border: const OutlineInputBorder(),
              ),
              maxLength: 280,
              maxLines: 3,
              onChanged: (value) =>
                  controller.setPromptAnswer(prompt.code, value),
            ),
          ],
          if (state.submitError case final String error) ...[
            const SizedBox(height: 12),
            Semantics(liveRegion: true, child: Text(error)),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: state.canSubmit ? controller.submit : null,
            child: state.isSubmitting
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      semanticsLabel: 'Saving profile',
                    ),
                  )
                : const Text('Complete profile'),
          ),
        ],
      ),
    );
  }
}
