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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AccessTokenRequest } from '../auth/access-token.guard';
import { IdempotencyKeyPipe } from '../../common/http/idempotency-key.pipe';
import {
  PROFILE_REPOSITORY,
  type ProfileRepository,
} from './profile.repository';
import { ProfileService } from './profile.service';
import { ProfileError } from './profile.types';
import type {
  ProfileCatalog as ProfileCatalogContract,
  ProfileInput,
} from './profile.types';
import { ProfileCatalog } from './dto/profile-catalog.dto';
import {
  ProfileInput as ProfileInputDto,
  UpsertProfileDto,
} from './dto/upsert-profile.dto';

@Controller()
@ApiTags('profile')
export class ProfileController {
  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly repository: ProfileRepository,
    private readonly profileService: ProfileService,
    private readonly idempotencyKeyPipe: IdempotencyKeyPipe,
  ) {}

  @Get('catalog/profile-options')
  @ApiOkResponse({ type: ProfileCatalog })
  getCatalog(): Promise<ProfileCatalogContract> {
    return this.repository.getCatalog();
  }

  @Get('me/profile')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ type: ProfileInputDto })
  @ApiUnauthorizedResponse({ description: 'Bearer access token is invalid' })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  async getProfile(@Req() request: AccessTokenRequest): Promise<ProfileInput> {
    const profile = await this.repository.findByUserId(request.accessToken.sub);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  @Put('me/profile')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('bearer')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ type: ProfileInputDto })
  @ApiOkResponse({ type: ProfileInputDto })
  @ApiBadRequestResponse({
    description: 'Profile or idempotency key is invalid',
  })
  @ApiUnauthorizedResponse({ description: 'Bearer access token is invalid' })
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
