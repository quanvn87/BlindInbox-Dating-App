import type { ProfileRepository } from './profile.repository';
import { ProfileService } from './profile.service';
import { UpsertProfileDto } from './dto/upsert-profile.dto';
import type {
  ProfileCatalog,
  ProfileClock,
  ProfileInput,
} from './profile.types';

const NOW = new Date('2026-08-18T00:00:00.000Z');

const ACTIVE_CATALOG: ProfileCatalog = {
  genders: [
    { code: 'MAN', label: 'Man', isActive: true },
    { code: 'WOMAN', label: 'Woman', isActive: true },
    { code: 'NON_BINARY', label: 'Non-binary', isActive: true },
    { code: 'SELF_DESCRIBED', label: 'Self-described', isActive: true },
  ],
  connectionIntents: [
    { code: 'CASUAL_CONVERSATION', label: 'Conversation', isActive: true },
    { code: 'FRIENDSHIP', label: 'Friendship', isActive: true },
    { code: 'LONG_TERM_DATING', label: 'Long-term dating', isActive: true },
    { code: 'SHORT_TERM_DATING', label: 'Short-term dating', isActive: true },
    { code: 'OPEN_TO_EXPLORE', label: 'Open to explore', isActive: true },
  ],
  locations: [
    {
      code: 'VN-HCM',
      name: 'Thành phố Hồ Chí Minh',
      level: 'PROVINCE',
      parentCode: null,
      isActive: true,
    },
    {
      code: 'VN-HCM-Q1',
      name: 'Quận 1',
      level: 'DISTRICT',
      parentCode: 'VN-HCM',
      isActive: true,
    },
  ],
  prompts: [
    {
      code: 'IDEAL_SUNDAY',
      text: 'My ideal Sunday is…',
      isActive: true,
    },
  ],
};

class FakeProfileRepository implements ProfileRepository {
  saved: { userId: string; input: ProfileInput } | null = null;

  constructor(public catalog: ProfileCatalog = ACTIVE_CATALOG) {}

  getCatalog(): Promise<ProfileCatalog> {
    return Promise.resolve(this.catalog);
  }

  findByUserId(): Promise<ProfileInput | null> {
    return Promise.resolve(this.saved?.input ?? null);
  }

  upsert(userId: string, input: ProfileInput): Promise<ProfileInput> {
    this.saved = { userId, input };
    return Promise.resolve(input);
  }
}

const fixedClock: ProfileClock = { now: () => new Date(NOW) };

function validInput(overrides: Partial<ProfileInput> = {}): ProfileInput {
  return {
    displayName: 'Minh Anh',
    birthDate: '2008-08-18',
    genderIdentity: 'MAN',
    genderLabel: null,
    interestedInGenders: ['MAN'],
    connectionIntents: ['FRIENDSHIP'],
    heightCm: null,
    hometownLocationCode: null,
    homeLocationCode: 'VN-HCM-Q1',
    bio: '',
    favoriteSongTitle: null,
    favoriteSongArtist: null,
    promptAnswers: [
      { promptCode: 'IDEAL_SUNDAY', answer: 'Coffee and a walk' },
    ],
    ...overrides,
  };
}

function createHarness(catalog: ProfileCatalog = ACTIVE_CATALOG) {
  const repository = new FakeProfileRepository(catalog);
  const service = new ProfileService(repository, fixedClock);
  return { repository, service };
}

function replaceCatalogOptions<T extends { code: string }>(
  base: T[],
  replacements: T[] | undefined,
): T[] {
  if (!replacements) {
    return base;
  }
  return base.map(
    (option) => replacements.find(({ code }) => code === option.code) ?? option,
  );
}

describe('ProfileService', () => {
  it('accepts an exactly-18 MAN interested in MAN for friendship', async () => {
    const { repository, service } = createHarness();
    const input = validInput();

    await expect(service.upsert('user-1', input)).resolves.toEqual(input);
    expect(repository.saved).toEqual({ userId: 'user-1', input });
  });

  it('rejects someone one day short of 18 using UTC calendar dates', async () => {
    const { repository, service } = createHarness();

    await expect(
      service.upsert('user-1', validInput({ birthDate: '2008-08-19' })),
    ).rejects.toMatchObject({ code: 'PROFILE_UNDERAGE', field: 'birthDate' });
    expect(repository.saved).toBeNull();
  });

  it.each<['interestedInGenders' | 'connectionIntents', Partial<ProfileInput>]>(
    [
      ['interestedInGenders', { interestedInGenders: [] }],
      ['connectionIntents', { connectionIntents: [] }],
    ],
  )('requires a non-empty %s set', async (field, overrides) => {
    const { service } = createHarness();

    await expect(
      service.upsert('user-1', validInput(overrides)),
    ).rejects.toMatchObject({ code: 'PROFILE_INVALID', field });
  });

  it('requires a 2-50 character label only for SELF_DESCRIBED', async () => {
    const { service } = createHarness();

    await expect(
      service.upsert(
        'user-1',
        validInput({ genderIdentity: 'SELF_DESCRIBED', genderLabel: null }),
      ),
    ).rejects.toMatchObject({ code: 'PROFILE_INVALID', field: 'genderLabel' });
    await expect(
      service.upsert(
        'user-1',
        validInput({ genderIdentity: 'SELF_DESCRIBED', genderLabel: 'x' }),
      ),
    ).rejects.toMatchObject({ code: 'PROFILE_INVALID', field: 'genderLabel' });
    await expect(
      service.upsert(
        'user-1',
        validInput({ genderIdentity: 'MAN', genderLabel: 'Masculine' }),
      ),
    ).rejects.toMatchObject({ code: 'PROFILE_INVALID', field: 'genderLabel' });
    await expect(
      service.upsert(
        'user-1',
        validInput({
          genderIdentity: 'SELF_DESCRIBED',
          genderLabel: 'Genderqueer',
        }),
      ),
    ).resolves.toMatchObject({ genderLabel: 'Genderqueer' });
  });

  it.each<[keyof ProfileInput, Partial<ProfileInput>]>([
    ['interestedInGenders', { interestedInGenders: ['MAN', 'MAN'] }],
    ['connectionIntents', { connectionIntents: ['FRIENDSHIP', 'FRIENDSHIP'] }],
    [
      'promptAnswers',
      {
        promptAnswers: [
          { promptCode: 'IDEAL_SUNDAY', answer: 'Coffee' },
          { promptCode: 'IDEAL_SUNDAY', answer: 'A walk' },
        ],
      },
    ],
  ])('rejects duplicate %s values', async (field, overrides) => {
    const { service } = createHarness();

    await expect(
      service.upsert('user-1', validInput(overrides)),
    ).rejects.toMatchObject({ code: 'PROFILE_INVALID', field });
  });

  it.each<[keyof ProfileInput, Partial<ProfileInput>]>([
    ['displayName', { displayName: 'x' }],
    ['displayName', { displayName: 'x'.repeat(51) }],
    ['displayName', { displayName: `${'x'.repeat(50)} ` }],
    ['bio', { bio: 'x'.repeat(501) }],
    ['heightCm', { heightCm: 99 }],
    ['heightCm', { heightCm: 251 }],
    ['homeLocationCode', { homeLocationCode: '' }],
    [
      'favoriteSongArtist',
      { favoriteSongTitle: 'Tình thôi xót xa', favoriteSongArtist: null },
    ],
    [
      'favoriteSongTitle',
      { favoriteSongTitle: null, favoriteSongArtist: 'Lam Trường' },
    ],
    [
      'favoriteSongTitle',
      {
        favoriteSongTitle: 'x'.repeat(501),
        favoriteSongArtist: 'Lam Trường',
      },
    ],
    [
      'favoriteSongArtist',
      {
        favoriteSongTitle: 'Tình thôi xót xa',
        favoriteSongArtist: 'x'.repeat(501),
      },
    ],
    [
      'promptAnswers',
      { promptAnswers: [{ promptCode: 'IDEAL_SUNDAY', answer: '' }] },
    ],
    [
      'promptAnswers',
      {
        promptAnswers: [
          { promptCode: 'IDEAL_SUNDAY', answer: 'x'.repeat(281) },
        ],
      },
    ],
  ])('rejects invalid %s content', async (field, overrides) => {
    const { service } = createHarness();

    await expect(
      service.upsert('user-1', validInput(overrides)),
    ).rejects.toMatchObject({ code: 'PROFILE_INVALID', field });
  });

  it('rejects a SELF_DESCRIBED label whose stored value exceeds 50 characters', async () => {
    const { service } = createHarness();

    await expect(
      service.upsert(
        'user-1',
        validInput({
          genderIdentity: 'SELF_DESCRIBED',
          genderLabel: `${'x'.repeat(50)} `,
        }),
      ),
    ).rejects.toMatchObject({ code: 'PROFILE_INVALID', field: 'genderLabel' });
  });

  it.each<[keyof ProfileInput, Partial<ProfileInput>, Partial<ProfileCatalog>]>(
    [
      [
        'genderIdentity',
        { genderIdentity: 'WOMAN' },
        { genders: [{ code: 'WOMAN', label: 'Woman', isActive: false }] },
      ],
      [
        'interestedInGenders',
        { interestedInGenders: ['WOMAN'] },
        { genders: [{ code: 'WOMAN', label: 'Woman', isActive: false }] },
      ],
      [
        'connectionIntents',
        { connectionIntents: ['FRIENDSHIP'] },
        {
          connectionIntents: [
            { code: 'FRIENDSHIP', label: 'Friendship', isActive: false },
          ],
        },
      ],
      [
        'homeLocationCode',
        { homeLocationCode: 'VN-HCM-Q1' },
        {
          locations: [
            {
              code: 'VN-HCM-Q1',
              name: 'Quận 1',
              level: 'DISTRICT',
              parentCode: 'VN-HCM',
              isActive: false,
            },
          ],
        },
      ],
      [
        'hometownLocationCode',
        { hometownLocationCode: 'VN-HCM' },
        {
          locations: [
            {
              code: 'VN-HCM',
              name: 'Thành phố Hồ Chí Minh',
              level: 'PROVINCE',
              parentCode: null,
              isActive: false,
            },
          ],
        },
      ],
      [
        'promptAnswers',
        { promptAnswers: [{ promptCode: 'IDEAL_SUNDAY', answer: 'Coffee' }] },
        {
          prompts: [
            {
              code: 'IDEAL_SUNDAY',
              text: 'My ideal Sunday is…',
              isActive: false,
            },
          ],
        },
      ],
    ],
  )(
    'rejects inactive catalog selection for %s',
    async (field, overrides, catalogOverrides) => {
      const replacements = catalogOverrides;
      const catalog: ProfileCatalog = {
        genders: replaceCatalogOptions(
          ACTIVE_CATALOG.genders,
          replacements.genders,
        ),
        connectionIntents: replaceCatalogOptions(
          ACTIVE_CATALOG.connectionIntents,
          replacements.connectionIntents,
        ),
        locations: replaceCatalogOptions(
          ACTIVE_CATALOG.locations,
          replacements.locations,
        ),
        prompts: replaceCatalogOptions(
          ACTIVE_CATALOG.prompts,
          replacements.prompts,
        ),
      };
      const { service } = createHarness(catalog);

      await expect(
        service.upsert('user-1', validInput(overrides)),
      ).rejects.toMatchObject({
        code: 'PROFILE_CATALOG_SELECTION_INVALID',
        field,
      });
    },
  );
});

describe('UpsertProfileDto', () => {
  it('parses the stable ProfileInput contract', () => {
    expect(UpsertProfileDto.parse(validInput())).toEqual(validInput());
  });

  it.each([
    { genderIdentity: 'UNKNOWN' },
    { connectionIntents: ['UNKNOWN'] },
    { unexpected: true },
  ])('rejects non-canonical or unknown input: %o', (overrides) => {
    expect(() =>
      UpsertProfileDto.parse({ ...validInput(), ...overrides }),
    ).toThrow('Invalid profile');
  });
});
