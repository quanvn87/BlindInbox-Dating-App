import type { ProfileRepository } from './profile.repository';
import {
  CONNECTION_INTENTS,
  GENDER_CODES,
  ProfileError,
  systemProfileClock,
} from './profile.types';
import type {
  ConnectionIntent,
  GenderCode,
  ProfileCatalog,
  ProfileClock,
  ProfileInput,
} from './profile.types';

const MINIMUM_AGE = 18;

export class ProfileService {
  constructor(
    private readonly repository: ProfileRepository,
    private readonly clock: ProfileClock = systemProfileClock,
  ) {}

  async upsert(userId: string, input: ProfileInput): Promise<ProfileInput> {
    this.validateInput(input);
    this.validateAge(input.birthDate);

    const catalog = await this.repository.getCatalog();
    this.validateCatalogSelections(input, catalog);

    return this.repository.upsert(userId, input);
  }

  private validateInput(input: ProfileInput): void {
    const displayNameLength = input.displayName.trim().length;
    if (displayNameLength < 2 || input.displayName.length > 50) {
      this.invalid('displayName');
    }
    if (input.bio.length > 500) {
      this.invalid('bio');
    }
    if (
      input.heightCm !== null &&
      (!Number.isInteger(input.heightCm) ||
        input.heightCm < 100 ||
        input.heightCm > 250)
    ) {
      this.invalid('heightCm');
    }
    if (input.homeLocationCode.trim().length === 0) {
      this.invalid('homeLocationCode');
    }
    if (
      input.hometownLocationCode !== null &&
      input.hometownLocationCode.trim().length === 0
    ) {
      this.invalid('hometownLocationCode');
    }

    this.validateGenderLabel(input);
    this.validateSet(input.interestedInGenders, 'interestedInGenders');
    this.validateSet(input.connectionIntents, 'connectionIntents');
    this.validateSongs(input);
    this.validatePromptAnswers(input);

    if (!GENDER_CODES.includes(input.genderIdentity)) {
      this.invalid('genderIdentity');
    }
    if (
      input.interestedInGenders.some((gender) => !GENDER_CODES.includes(gender))
    ) {
      this.invalid('interestedInGenders');
    }
    if (
      input.connectionIntents.some(
        (intent) => !CONNECTION_INTENTS.includes(intent),
      )
    ) {
      this.invalid('connectionIntents');
    }
  }

  private validateAge(birthDateInput: string): void {
    const birthDate = this.parseDate(birthDateInput);
    if (!birthDate) {
      this.invalid('birthDate');
    }

    const now = this.clock.now();
    let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
    const birthdayHasOccurred =
      now.getUTCMonth() > birthDate.getUTCMonth() ||
      (now.getUTCMonth() === birthDate.getUTCMonth() &&
        now.getUTCDate() >= birthDate.getUTCDate());
    if (!birthdayHasOccurred) {
      age -= 1;
    }
    if (age < MINIMUM_AGE) {
      throw new ProfileError('PROFILE_UNDERAGE', 'birthDate');
    }
  }

  private parseDate(input: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year <= 0) {
      return null;
    }
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return date;
  }

  private validateGenderLabel(input: ProfileInput): void {
    if (input.genderIdentity !== 'SELF_DESCRIBED') {
      if (input.genderLabel !== null) {
        this.invalid('genderLabel');
      }
      return;
    }

    const trimmedLength = input.genderLabel?.trim().length ?? 0;
    if (trimmedLength < 2 || (input.genderLabel?.length ?? 0) > 50) {
      this.invalid('genderLabel');
    }
  }

  private validateSet<T>(
    values: T[],
    field: 'interestedInGenders' | 'connectionIntents',
  ): void {
    if (values.length === 0 || new Set(values).size !== values.length) {
      this.invalid(field);
    }
  }

  private validateSongs(input: ProfileInput): void {
    const titlePresent =
      input.favoriteSongTitle !== null &&
      input.favoriteSongTitle.trim().length > 0;
    const artistPresent =
      input.favoriteSongArtist !== null &&
      input.favoriteSongArtist.trim().length > 0;
    const bothNull =
      input.favoriteSongTitle === null && input.favoriteSongArtist === null;
    if (!bothNull && (!titlePresent || !artistPresent)) {
      this.invalid(titlePresent ? 'favoriteSongArtist' : 'favoriteSongTitle');
    }
  }

  private validatePromptAnswers(input: ProfileInput): void {
    const promptCodes = input.promptAnswers.map(({ promptCode }) => promptCode);
    if (new Set(promptCodes).size !== promptCodes.length) {
      this.invalid('promptAnswers');
    }
    if (
      input.promptAnswers.some(
        ({ promptCode, answer }) =>
          promptCode.trim().length === 0 ||
          answer.trim().length === 0 ||
          answer.length > 280,
      )
    ) {
      this.invalid('promptAnswers');
    }
  }

  private validateCatalogSelections(
    input: ProfileInput,
    catalog: ProfileCatalog,
  ): void {
    const activeGenders = this.activeCodes<GenderCode>(catalog.genders);
    const activeIntents = this.activeCodes<ConnectionIntent>(
      catalog.connectionIntents,
    );
    const activeLocations = this.activeCodes(catalog.locations);
    const activeProvinceLocations = this.activeCodes(
      catalog.locations.filter(({ level }) => level === 'PROVINCE'),
    );
    const activePrompts = this.activeCodes(catalog.prompts);

    if (!activeGenders.has(input.genderIdentity)) {
      this.catalogInvalid('genderIdentity');
    }
    if (input.interestedInGenders.some((code) => !activeGenders.has(code))) {
      this.catalogInvalid('interestedInGenders');
    }
    if (input.connectionIntents.some((code) => !activeIntents.has(code))) {
      this.catalogInvalid('connectionIntents');
    }
    if (!activeLocations.has(input.homeLocationCode)) {
      this.catalogInvalid('homeLocationCode');
    }
    if (
      input.hometownLocationCode !== null &&
      !activeProvinceLocations.has(input.hometownLocationCode)
    ) {
      this.catalogInvalid('hometownLocationCode');
    }
    if (
      input.promptAnswers.some(
        ({ promptCode }) => !activePrompts.has(promptCode),
      )
    ) {
      this.catalogInvalid('promptAnswers');
    }
  }

  private activeCodes<Code extends string>(
    options: Array<{ code: Code; isActive: boolean }>,
  ): Set<Code> {
    return new Set(
      options.filter(({ isActive }) => isActive).map(({ code }) => code),
    );
  }

  private invalid(field: keyof ProfileInput): never {
    throw new ProfileError('PROFILE_INVALID', field);
  }

  private catalogInvalid(field: keyof ProfileInput): never {
    throw new ProfileError('PROFILE_CATALOG_SELECTION_INVALID', field);
  }
}
