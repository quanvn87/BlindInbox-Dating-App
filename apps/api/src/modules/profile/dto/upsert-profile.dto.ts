import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import {
  CONNECTION_INTENTS,
  GENDER_CODES,
  type ConnectionIntent,
  type GenderCode,
  type ProfileInput,
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

export class UpsertProfileDto implements ProfileInput {
  displayName!: string;
  birthDate!: string;
  genderIdentity!: GenderCode;
  genderLabel!: string | null;
  interestedInGenders!: GenderCode[];
  connectionIntents!: ConnectionIntent[];
  heightCm!: number | null;
  hometownLocationCode!: string | null;
  homeLocationCode!: string;
  bio!: string;
  favoriteSongTitle!: string | null;
  favoriteSongArtist!: string | null;
  promptAnswers!: Array<{ promptCode: string; answer: string }>;

  static parse(input: unknown): UpsertProfileDto {
    const result = upsertProfileSchema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException('Invalid profile');
    }
    return Object.assign(new UpsertProfileDto(), result.data);
  }
}
