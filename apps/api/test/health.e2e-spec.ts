import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });

  it('returns a UTC liveness timestamp', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/health/live')
      .expect(200);
    const body = response.body as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(body.timestamp).toMatch(/Z$/);
  });

  afterEach(async () => {
    await app?.close();
  });
});
