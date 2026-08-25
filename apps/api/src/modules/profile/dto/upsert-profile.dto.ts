import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

import {
  CONNECTION_INTENTS,
  GENDER_CODES,
  type ConnectionIntent,
  type GenderCode,
  type ProfileInput as ProfileInputContract,
} from '../profile.types';

const upsertProfileSchema = z
  .object({
    displayName: z.string(),
    birthDate: z.string(),
    genderIdentity: z.enum(GENDER_CODES),
    genderLabel: z.string().nullable(),
    interestedInGenders: z.array(z.enum(GENDER_CODES)),
    connectionIntents: z.array(z.enum(CONNECTION_INTENTS)),
    heightCm: z.number().nullable(),
    hometownLocationCode: z.string().nullable(),
    homeLocationCode: z.string(),
    bio: z.string(),
    favoriteSongTitle: z.string().nullable(),
    favoriteSongArtist: z.string().nullable(),
    promptAnswers: z.array(
      z
        .object({
          promptCode: z.string(),
          answer: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

class ProfilePromptAnswer {
  @ApiProperty({
    minLength: 1,
    description:
      'Must be nonblank and unique within promptAnswers. It must be a currently active prompt code returned by GET /v1/catalog/profile-options; enum membership alone does not guarantee current activity.',
  })
  promptCode!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 280,
    description: 'Must be nonblank after trimming.',
  })
  answer!: string;
}

export class ProfileInput implements ProfileInputContract {
  @ApiProperty({
    minLength: 2,
    maxLength: 50,
    description:
      'Must contain at least 2 nonblank characters after trimming; maximum 50 characters.',
  })
  displayName!: string;

  @ApiProperty({
    format: 'date',
    pattern: '^(?!0000)\\d{4}-\\d{2}-\\d{2}$',
    description:
      'UTC calendar date (YYYY-MM-DD) with a positive year; the server requires age >=18 using the UTC calendar date.',
  })
  birthDate!: string;

  @ApiProperty({
    enum: GENDER_CODES,
    description:
      'Must be a currently active gender code returned by GET /v1/catalog/profile-options; enum membership alone does not guarantee current activity.',
  })
  genderIdentity!: GenderCode;

  @ApiProperty({
    type: String,
    nullable: true,
    minLength: 2,
    maxLength: 50,
    description:
      'When genderIdentity is SELF_DESCRIBED, this is required and must be nonblank; otherwise it must be null.',
  })
  genderLabel!: string | null;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'string',
      enum: [...GENDER_CODES],
      description:
        'Must be a currently active gender code returned by GET /v1/catalog/profile-options; enum membership alone does not guarantee current activity.',
    },
    minItems: 1,
    uniqueItems: true,
  })
  interestedInGenders!: GenderCode[];

  @ApiProperty({
    type: 'array',
    items: {
      type: 'string',
      enum: [...CONNECTION_INTENTS],
      description:
        'Must be a currently active connection intent code returned by GET /v1/catalog/profile-options; enum membership alone does not guarantee current activity.',
    },
    minItems: 1,
    uniqueItems: true,
  })
  connectionIntents!: ConnectionIntent[];

  @ApiProperty({
    type: 'integer',
    nullable: true,
    minimum: 100,
    maximum: 250,
  })
  heightCm!: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    minLength: 1,
    description:
      'When present, must be nonblank and match a currently active PROVINCE-level location code returned by GET /v1/catalog/profile-options. The live catalog is checked; this is not a static enum.',
  })
  hometownLocationCode!: string | null;

  @ApiProperty({
    minLength: 1,
    description: 'Must be a nonblank active catalog location code.',
  })
  homeLocationCode!: string;

  @ApiProperty({ maxLength: 500 })
  bio!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Both favoriteSongTitle and favoriteSongArtist must be null, or both must be present and nonblank.',
  })
  favoriteSongTitle!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Both favoriteSongTitle and favoriteSongArtist must be null, or both must be present and nonblank.',
  })
  favoriteSongArtist!: string | null;

  @ApiProperty({
    type: () => [ProfilePromptAnswer],
    description:
      'promptCode values must be unique; prompt codes and answers must be nonblank.',
  })
  promptAnswers!: Array<{ promptCode: string; answer: string }>;

  static parse(input: unknown): ProfileInput {
    const result = upsertProfileSchema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException('Invalid profile');
    }
    return Object.assign(new ProfileInput(), result.data);
  }
}

export { ProfileInput as UpsertProfileDto };
