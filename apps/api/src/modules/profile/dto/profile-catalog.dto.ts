import { ApiProperty } from '@nestjs/swagger';

import {
  CONNECTION_INTENTS,
  GENDER_CODES,
  LOCATION_LEVELS,
} from '../profile.types';

export class GenderCatalogOption {
  @ApiProperty({ enum: GENDER_CODES })
  code!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  isActive!: boolean;
}

export class ConnectionIntentCatalogOption {
  @ApiProperty({ enum: CONNECTION_INTENTS })
  code!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  isActive!: boolean;
}

export class LocationOption {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: LOCATION_LEVELS })
  level!: string;

  @ApiProperty({ type: String, nullable: true })
  parentCode!: string | null;

  @ApiProperty()
  isActive!: boolean;
}

export class ProfilePrompt {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  text!: string;

  @ApiProperty()
  isActive!: boolean;
}

export class ProfileCatalog {
  @ApiProperty({ type: () => [GenderCatalogOption] })
  genders!: GenderCatalogOption[];

  @ApiProperty({ type: () => [ConnectionIntentCatalogOption] })
  connectionIntents!: ConnectionIntentCatalogOption[];

  @ApiProperty({ type: () => [LocationOption] })
  locations!: LocationOption[];

  @ApiProperty({ type: () => [ProfilePrompt] })
  prompts!: ProfilePrompt[];
}
