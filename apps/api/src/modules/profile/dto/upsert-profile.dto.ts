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
  @ApiProperty()
  promptCode!: string;

  @ApiProperty()
  answer!: string;
}

export class ProfileInput implements ProfileInputContract {
  @ApiProperty()
  displayName!: string;

  @ApiProperty({ format: 'date' })
  birthDate!: string;

  @ApiProperty({ enum: GENDER_CODES })
  genderIdentity!: GenderCode;

  @ApiProperty({ type: String, nullable: true })
  genderLabel!: string | null;

  @ApiProperty({ enum: GENDER_CODES, isArray: true })
  interestedInGenders!: GenderCode[];

  @ApiProperty({ enum: CONNECTION_INTENTS, isArray: true })
  connectionIntents!: ConnectionIntent[];

  @ApiProperty({ type: Number, nullable: true })
  heightCm!: number | null;

  @ApiProperty({ type: String, nullable: true })
  hometownLocationCode!: string | null;

  @ApiProperty()
  homeLocationCode!: string;

  @ApiProperty()
  bio!: string;

  @ApiProperty({ type: String, nullable: true })
  favoriteSongTitle!: string | null;

  @ApiProperty({ type: String, nullable: true })
  favoriteSongArtist!: string | null;

  @ApiProperty({ type: () => [ProfilePromptAnswer] })
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
