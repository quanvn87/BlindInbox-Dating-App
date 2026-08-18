import { Controller, Get } from '@nestjs/common';
import { OracleService } from '../../common/database/oracle.service';

@Controller('health')
export class HealthController {
  constructor(private readonly oracleService: OracleService) {}

  @Get('live')
  getLiveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async getReadiness() {
    await this.oracleService.ping();

    return { status: 'ready', oracle: 'up' };
  }
}
