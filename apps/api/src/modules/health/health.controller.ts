import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiInternalServerErrorResponse,
  ApiTags,
} from '@nestjs/swagger';
import { OracleService } from '../../common/database/oracle.service';

@Controller('health')
@ApiTags('health')
export class HealthController {
  constructor(private readonly oracleService: OracleService) {}

  @Get('live')
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'timestamp'],
      properties: {
        status: { type: 'string', enum: ['ok'] },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  getLiveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'oracle'],
      properties: {
        status: { type: 'string', enum: ['ready'] },
        oracle: { type: 'string', enum: ['up'] },
      },
    },
  })
  @ApiInternalServerErrorResponse({ description: 'Oracle is unavailable' })
  async getReadiness() {
    await this.oracleService.ping();

    return { status: 'ready', oracle: 'up' };
  }
}
