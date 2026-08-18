import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AccessTokenRequest } from '../auth/access-token.guard';
import { IdempotencyKeyPipe } from '../../common/http/idempotency-key.pipe';
import {
  PROFILE_REPOSITORY,
  type ProfileRepository,
} from './profile.repository';
import { ProfileService } from './profile.service';
import { ProfileError } from './profile.types';
import type { ProfileCatalog, ProfileInput } from './profile.types';
import { UpsertProfileDto } from './dto/upsert-profile.dto';

@Controller()
export class ProfileController {
  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly repository: ProfileRepository,
    private readonly profileService: ProfileService,
    private readonly idempotencyKeyPipe: IdempotencyKeyPipe,
  ) {}

  @Get('catalog/profile-options')
  getCatalog(): Promise<ProfileCatalog> {
    return this.repository.getCatalog();
  }

  @Get('me/profile')
  @UseGuards(AccessTokenGuard)
  async getProfile(@Req() request: AccessTokenRequest): Promise<ProfileInput> {
    const profile = await this.repository.findByUserId(request.accessToken.sub);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  @Put('me/profile')
  @UseGuards(AccessTokenGuard)
  upsertProfile(
    @Req() request: AccessTokenRequest,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body() body: unknown,
  ): Promise<ProfileInput> {
    this.idempotencyKeyPipe.transform(idempotencyKey);
    const input = UpsertProfileDto.parse(body);
    return this.mapProfileErrors(() =>
      this.profileService.upsert(request.accessToken.sub, input),
    );
  }

  private async mapProfileErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (error instanceof ProfileError) {
        throw new BadRequestException({
          code: error.code,
          field: error.field,
        });
      }
      throw error;
    }
  }
}
