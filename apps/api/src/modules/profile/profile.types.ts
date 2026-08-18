export const GENDER_CODES = [
  'MAN',
  'WOMAN',
  'NON_BINARY',
  'SELF_DESCRIBED',
] as const;

export type GenderCode = (typeof GENDER_CODES)[number];

export const CONNECTION_INTENTS = [
  'CASUAL_CONVERSATION',
  'FRIENDSHIP',
  'LONG_TERM_DATING',
  'SHORT_TERM_DATING',
  'OPEN_TO_EXPLORE',
] as const;

export type ConnectionIntent = (typeof CONNECTION_INTENTS)[number];

export const LOCATION_LEVELS = ['PROVINCE', 'DISTRICT', 'WARD'] as const;

export type LocationLevel = (typeof LOCATION_LEVELS)[number];

export interface ProfileInput {
  displayName: string;
  birthDate: string;
  genderIdentity: GenderCode;
  genderLabel: string | null;
  interestedInGenders: GenderCode[];
  connectionIntents: ConnectionIntent[];
  heightCm: number | null;
  hometownLocationCode: string | null;
  homeLocationCode: string;
  bio: string;
  favoriteSongTitle: string | null;
  favoriteSongArtist: string | null;
  promptAnswers: Array<{ promptCode: string; answer: string }>;
}

export interface CatalogOption<Code extends string> {
  code: Code;
  label: string;
  isActive: boolean;
}

export interface LocationOption {
  code: string;
  name: string;
  level: LocationLevel;
  parentCode: string | null;
  isActive: boolean;
}

export interface ProfilePrompt {
  code: string;
  text: string;
  isActive: boolean;
}

export interface ProfileCatalog {
  genders: Array<CatalogOption<GenderCode>>;
  connectionIntents: Array<CatalogOption<ConnectionIntent>>;
  locations: LocationOption[];
  prompts: ProfilePrompt[];
}

export interface ProfileClock {
  now(): Date;
}

export const systemProfileClock: ProfileClock = {
  now: () => new Date(),
};

export type ProfileErrorCode =
  'PROFILE_INVALID' | 'PROFILE_UNDERAGE' | 'PROFILE_CATALOG_SELECTION_INVALID';

export class ProfileError extends Error {
  constructor(
    public readonly code: ProfileErrorCode,
    public readonly field: keyof ProfileInput,
  ) {
    super(`${code}:${field}`);
    this.name = 'ProfileError';
  }
}
