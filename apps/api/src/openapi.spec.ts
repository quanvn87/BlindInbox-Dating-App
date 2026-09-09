import type {
  OpenAPIObject,
  OperationObject,
  ReferenceObject,
  SchemaObject,
} from '@nestjs/swagger';
import { readFile } from 'node:fs/promises';

import {
  createOpenApiDocument,
  formatOpenApiCliError,
  OPENAPI_OUTPUT_PATH,
  runOpenApiCli,
  serializeOpenApiDocument,
} from './openapi';

describe('OpenAPI contract', () => {
  let document: OpenAPIObject;

  beforeAll(async () => {
    document = await createOpenApiDocument();
  });

  it('publishes every v1 health, auth, catalog, and profile operation', () => {
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/v1/auth/logout',
        '/v1/auth/otp/request',
        '/v1/auth/otp/verify',
        '/v1/auth/refresh',
        '/v1/catalog/profile-options',
        '/v1/health/live',
        '/v1/health/ready',
        '/v1/me/profile',
      ]),
    );

    expect(document.paths['/v1/health/live']?.get?.responses).toHaveProperty(
      '200',
    );
    expect(document.paths['/v1/health/ready']?.get?.responses).toHaveProperty(
      '200',
    );
    expect(
      document.paths['/v1/auth/otp/request']?.post?.responses,
    ).toHaveProperty('202');
    expect(
      document.paths['/v1/auth/otp/verify']?.post?.responses,
    ).toHaveProperty('200');
    expect(document.paths['/v1/auth/refresh']?.post?.responses).toHaveProperty(
      '200',
    );
    expect(document.paths['/v1/auth/logout']?.post?.responses).toHaveProperty(
      '204',
    );
    expect(
      document.paths['/v1/catalog/profile-options']?.get?.responses,
    ).toHaveProperty('200');
    expect(document.paths['/v1/me/profile']?.get?.responses).toHaveProperty(
      '200',
    );
    expect(document.paths['/v1/me/profile']?.put?.responses).toHaveProperty(
      '200',
    );
  });

  it('requires bearer authentication only for protected profile operations', () => {
    expect(document.components?.securitySchemes?.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
    expect(document.paths['/v1/me/profile']?.get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/v1/me/profile']?.put?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/v1/auth/refresh']?.post?.security).toBeUndefined();
    expect(
      document.paths['/v1/catalog/profile-options']?.get?.security,
    ).toBeUndefined();
  });

  it('requires a UUID Idempotency-Key on every side-effecting command', () => {
    const commands = [
      document.paths['/v1/auth/otp/request']?.post,
      document.paths['/v1/auth/otp/verify']?.post,
      document.paths['/v1/auth/refresh']?.post,
      document.paths['/v1/auth/logout']?.post,
      document.paths['/v1/me/profile']?.put,
    ];

    for (const operation of commands) {
      expect(getHeader(operation, 'Idempotency-Key')).toMatchObject({
        in: 'header',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      });
    }
    expect(
      getHeader(document.paths['/v1/me/profile']?.get, 'Idempotency-Key'),
    ).toBeUndefined();
  });

  it('publishes strict request schemas', () => {
    const cases: Array<[OperationObject | undefined, string[]]> = [
      [document.paths['/v1/auth/otp/request']?.post, ['phone']],
      [
        document.paths['/v1/auth/otp/verify']?.post,
        ['challengeId', 'code', 'deviceName'],
      ],
      [document.paths['/v1/auth/refresh']?.post, ['refreshToken']],
      [document.paths['/v1/auth/logout']?.post, ['refreshToken']],
    ];

    for (const [operation, required] of cases) {
      const schema = requestSchema(document, operation);
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required?.sort()).toEqual([...required].sort());
    }

    const profile = requestSchema(
      document,
      document.paths['/v1/me/profile']?.put,
    );
    expect(profile).toBe(document.components?.schemas?.ProfileInput);
    expect(profile.additionalProperties).toBe(false);
    expect(profile.required).toHaveLength(13);
  });

  it('documents auth input normalization and opaque-token semantics', () => {
    const requestOtp = schema(document, 'RequestOtpDto');
    expect(requestOtp.properties?.phone).toMatchObject({
      type: 'string',
      minLength: 1,
      maxLength: 50,
    });
    expect(requestOtp.properties?.phone?.description).toMatch(
      /nonblank.*trimming.*Vietnamese.*E\.164.*normalized/i,
    );

    const verifyOtp = schema(document, 'VerifyOtpDto');
    expect(verifyOtp.properties?.challengeId).toMatchObject({
      type: 'string',
      format: 'uuid',
    });
    expect(verifyOtp.properties?.code).toMatchObject({
      type: 'string',
      pattern: '^\\d{6}$',
    });
    expect(verifyOtp.properties?.deviceName).toMatchObject({
      type: 'string',
      minLength: 1,
      maxLength: 120,
    });
    expect(verifyOtp.properties?.deviceName?.description).toMatch(
      /nonblank.*trimming/i,
    );

    for (const componentName of ['RefreshTokenDto', 'LogoutDto']) {
      const tokenRequest = schema(document, componentName);
      expect(tokenRequest.properties?.refreshToken).toMatchObject({
        type: 'string',
        minLength: 1,
        maxLength: 2048,
      });
      expect(tokenRequest.properties?.refreshToken?.description).toMatch(
        /non-empty.*opaque.*neither trimmed nor normalized/i,
      );
    }
  });

  it('keeps the stable AuthTokens and ProfileInput component schemas', () => {
    const authTokens = schema(document, 'AuthTokens');
    expect(authTokens).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'accessToken',
        'accessExpiresAt',
        'refreshToken',
        'refreshExpiresAt',
      ],
    });
    expect(authTokens.properties).toMatchObject({
      accessToken: { type: 'string' },
      accessExpiresAt: { type: 'string', format: 'date-time' },
      refreshToken: { type: 'string' },
      refreshExpiresAt: { type: 'string', format: 'date-time' },
    });

    const profile = schema(document, 'ProfileInput');
    expect(profile.required).toEqual([
      'displayName',
      'birthDate',
      'genderIdentity',
      'genderLabel',
      'interestedInGenders',
      'connectionIntents',
      'heightCm',
      'hometownLocationCode',
      'homeLocationCode',
      'bio',
      'favoriteSongTitle',
      'favoriteSongArtist',
      'promptAnswers',
    ]);
    expect(profile.properties).toMatchObject({
      birthDate: { type: 'string', format: 'date' },
      genderIdentity: {
        type: 'string',
        enum: ['MAN', 'WOMAN', 'NON_BINARY', 'SELF_DESCRIBED'],
      },
      interestedInGenders: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['MAN', 'WOMAN', 'NON_BINARY', 'SELF_DESCRIBED'],
        },
      },
      connectionIntents: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'CASUAL_CONVERSATION',
            'FRIENDSHIP',
            'LONG_TERM_DATING',
            'SHORT_TERM_DATING',
            'OPEN_TO_EXPLORE',
          ],
        },
      },
      heightCm: { type: 'integer', nullable: true },
      promptAnswers: { type: 'array' },
    });
  });

  it('publishes every representable ProfileInput runtime constraint', () => {
    const profile = schema(document, 'ProfileInput');
    const properties = profile.properties;

    expect(properties?.displayName).toMatchObject({
      type: 'string',
      minLength: 2,
      maxLength: 50,
    });
    expect(properties?.displayName?.description).toContain('nonblank');
    expect(properties?.birthDate).toMatchObject({
      type: 'string',
      format: 'date',
      pattern: '^(?!0000)\\d{4}-\\d{2}-\\d{2}$',
    });
    expect(properties?.birthDate?.description).toMatch(/18.*UTC/);
    expect(properties?.genderLabel).toMatchObject({
      type: 'string',
      nullable: true,
      minLength: 2,
      maxLength: 50,
    });
    expect(properties?.genderLabel?.description).toMatch(
      /SELF_DESCRIBED.*required.*null/i,
    );
    expect(properties?.interestedInGenders).toMatchObject({
      type: 'array',
      minItems: 1,
      uniqueItems: true,
    });
    expect(properties?.connectionIntents).toMatchObject({
      type: 'array',
      minItems: 1,
      uniqueItems: true,
    });
    expect(properties?.heightCm).toMatchObject({
      type: 'integer',
      nullable: true,
      minimum: 100,
      maximum: 250,
    });
    expect(properties?.bio).toMatchObject({
      type: 'string',
      maxLength: 500,
    });

    const promptAnswer = schema(document, 'ProfilePromptAnswer');
    expect(promptAnswer.additionalProperties).toBe(false);
    expect(promptAnswer.properties?.answer).toMatchObject({
      type: 'string',
      minLength: 1,
      maxLength: 280,
    });
    expect(promptAnswer.properties?.answer?.description).toContain('nonblank');
    expect(promptAnswer.properties?.promptCode).toMatchObject({
      type: 'string',
      minLength: 1,
    });
    expect(promptAnswer.properties?.promptCode?.description).toMatch(
      /nonblank.*unique/i,
    );

    expect(properties?.homeLocationCode).toMatchObject({
      type: 'string',
      minLength: 1,
    });
    expect(properties?.homeLocationCode?.description).toMatch(
      /nonblank.*active.*location/i,
    );
    expect(properties?.hometownLocationCode).toMatchObject({
      type: 'string',
      nullable: true,
      minLength: 1,
    });
    expect(properties?.hometownLocationCode?.description).toMatch(
      /nonblank.*currently active.*PROVINCE.*GET \/v1\/catalog\/profile-options.*not.*static enum/i,
    );
    expect(properties?.hometownLocationCode).not.toHaveProperty('enum');

    expect(properties?.favoriteSongTitle).toMatchObject({
      type: 'string',
      nullable: true,
    });
    expect(properties?.favoriteSongTitle?.description).toMatch(
      /both.*null.*both.*present/i,
    );
    expect(properties?.favoriteSongArtist).toMatchObject({
      type: 'string',
      nullable: true,
    });
    expect(properties?.favoriteSongArtist?.description).toMatch(
      /both.*null.*both.*present/i,
    );
    expect(properties?.favoriteSongTitle).not.toHaveProperty('minLength');
    expect(properties?.favoriteSongTitle).not.toHaveProperty('maxLength');
    expect(properties?.favoriteSongArtist).not.toHaveProperty('minLength');
    expect(properties?.favoriteSongArtist).not.toHaveProperty('maxLength');

    expect(properties?.promptAnswers).toMatchObject({
      type: 'array',
    });
    expect(properties?.promptAnswers?.description).toMatch(
      /promptCode.*unique/i,
    );
  });

  it('directs every catalog-backed profile code to the live catalog', () => {
    const profile = schema(document, 'ProfileInput');
    const promptAnswer = schema(document, 'ProfilePromptAnswer');
    const activeCatalogRequirement =
      /currently active.*GET \/v1\/catalog\/profile-options.*enum membership alone does not guarantee current activity/i;

    expect(propertySchema(profile, 'genderIdentity').description).toMatch(
      activeCatalogRequirement,
    );
    expect(
      arrayItemSchema(propertySchema(profile, 'interestedInGenders'))
        .description,
    ).toMatch(activeCatalogRequirement);
    expect(
      arrayItemSchema(propertySchema(profile, 'connectionIntents')).description,
    ).toMatch(activeCatalogRequirement);
    expect(propertySchema(promptAnswer, 'promptCode').description).toMatch(
      activeCatalogRequirement,
    );
  });

  it('serializes deterministically with sorted keys', () => {
    const first = serializeOpenApiDocument(document);
    const second = serializeOpenApiDocument(document);

    expect(second).toBe(first);
    expect(first.endsWith('\n')).toBe(true);
    expect(first.indexOf('"components"')).toBeLessThan(
      first.indexOf('"openapi"'),
    );
  });

  it('formats OpenAPI CLI errors with diagnostic stack context', () => {
    const error = new Error('configuration failed');

    expect(formatOpenApiCliError(error)).toContain(
      'OpenAPI generation failed: Error: configuration failed',
    );
    expect(formatOpenApiCliError(error)).toContain(
      'Error: configuration failed',
    );
  });

  it('reports an OpenAPI CLI failure to stderr and returns an error exit code', async () => {
    const error = new Error('module initialization failed');
    const write = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    await expect(runOpenApiCli(() => Promise.reject(error))).resolves.toBe(1);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(
        'OpenAPI generation failed: Error: module initialization failed',
      ),
    );
    write.mockRestore();
  });

  it('matches the checked-in generated OpenAPI artifact', async () => {
    const artifact = await readFile(OPENAPI_OUTPUT_PATH, 'utf8');

    expect(artifact.replace(/\r\n/g, '\n')).toBe(
      serializeOpenApiDocument(document),
    );
  });

  it('contains no dangling local component references', () => {
    const references = collectReferences(document);

    for (const reference of references) {
      const name = reference.replace('#/components/schemas/', '');
      expect(document.components?.schemas).toHaveProperty(name);
    }
  });

  it('models catalog option codes and readiness failure accurately', () => {
    expect(
      schema(document, 'GenderCatalogOption').properties?.code,
    ).toMatchObject({
      enum: ['MAN', 'WOMAN', 'NON_BINARY', 'SELF_DESCRIBED'],
    });
    expect(
      schema(document, 'ConnectionIntentCatalogOption').properties?.code,
    ).toMatchObject({
      enum: [
        'CASUAL_CONVERSATION',
        'FRIENDSHIP',
        'LONG_TERM_DATING',
        'SHORT_TERM_DATING',
        'OPEN_TO_EXPLORE',
      ],
    });
    expect(document.paths['/v1/health/ready']?.get?.responses).toHaveProperty(
      '500',
    );
    expect(
      document.paths['/v1/health/ready']?.get?.responses,
    ).not.toHaveProperty('503');
  });
});

function getHeader(
  operation: OperationObject | undefined,
  name: string,
): ReferenceObject | undefined {
  return operation?.parameters?.find(
    (parameter) => '$ref' in parameter || parameter.name === name,
  );
}

function requestSchema(
  document: OpenAPIObject,
  operation: OperationObject | undefined,
): SchemaObject {
  const content = operation?.requestBody;
  if (!content || '$ref' in content) {
    throw new Error('Expected inline request body');
  }
  const value = content.content['application/json']?.schema;
  if (!value) {
    throw new Error('Expected JSON request schema');
  }
  if ('$ref' in value) {
    return schema(document, value.$ref.split('/').at(-1) as string);
  }
  return value;
}

function schema(document: OpenAPIObject, name: string): SchemaObject {
  const value = document.components?.schemas?.[name];
  if (!value || '$ref' in value) {
    throw new Error(`Expected component schema ${name}`);
  }
  return value;
}

function propertySchema(component: SchemaObject, name: string): SchemaObject {
  const value = component.properties?.[name];
  if (!value || '$ref' in value) {
    throw new Error(`Expected inline property schema ${name}`);
  }
  return value;
}

function arrayItemSchema(array: SchemaObject): SchemaObject {
  const value = array.items;
  if (!value || '$ref' in value) {
    throw new Error('Expected inline array item schema');
  }
  return value;
}

function collectReferences(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectReferences);
  }
  if (!value || typeof value !== 'object') {
    return [];
  }

  const entries = Object.entries(value);
  return [
    ...entries.flatMap(([, child]) => collectReferences(child)),
    ...entries
      .filter(
        ([key, child]) =>
          key === '$ref' &&
          typeof child === 'string' &&
          child.startsWith('#/components/schemas/'),
      )
      .map(([, child]) => child as string),
  ];
}
