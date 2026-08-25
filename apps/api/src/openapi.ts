import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const OPENAPI_OUTPUT_PATH = resolve(
  __dirname,
  '../../../docs/openapi/slow-dating-v1.json',
);

const DOCUMENT_ENVIRONMENT = {
  NODE_ENV: 'test',
  PORT: '3000',
  ORACLE_USER: 'openapi',
  ORACLE_PASSWORD: 'openapi',
  ORACLE_CONNECT_STRING: 'openapi.invalid:1521/XEPDB1',
  JWT_ACCESS_SECRET: 'openapi-access-secret-at-least-32-characters',
  OTP_PEPPER: 'openapi-otp-pepper-at-least-32-characters',
  REFRESH_TOKEN_PEPPER: 'openapi-refresh-pepper-at-least-32-characters',
} as const;

export async function createOpenApiDocument(): Promise<OpenAPIObject> {
  const restoreEnvironment = supplyDocumentEnvironment();
  let app: INestApplication | undefined;

  try {
    const { AppModule } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./app.module') as typeof import('./app.module');
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('v1');

    const config = new DocumentBuilder()
      .setTitle('Slow Dating API')
      .setDescription('Authentication and profile API contract')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'bearer',
      )
      .build();
    const document = SwaggerModule.createDocument(app, config, {
      operationIdFactory: (controllerKey, methodKey) =>
        `${controllerKey}_${methodKey}`,
    });

    for (const name of [
      'AuthTokens',
      'ConnectionIntentCatalogOption',
      'GenderCatalogOption',
      'LocationOption',
      'LogoutDto',
      'OtpRequestResult',
      'ProfileCatalog',
      'ProfileInput',
      'ProfilePrompt',
      'ProfilePromptAnswer',
      'RefreshTokenDto',
      'RequestOtpDto',
      'VerifyOtpDto',
    ]) {
      const schema = document.components?.schemas?.[name];
      if (schema && !('$ref' in schema) && schema.type === 'object') {
        schema.additionalProperties = false;
      }
    }

    return document;
  } finally {
    if (app) {
      await app.close();
    }
    restoreEnvironment();
  }
}

export function serializeOpenApiDocument(document: OpenAPIObject): string {
  return `${JSON.stringify(sortKeys(document), null, 2)}\n`;
}

export function formatOpenApiCliError(error: unknown): string {
  if (error instanceof Error) {
    return `OpenAPI generation failed: ${error.name}: ${error.message}\n${error.stack ?? error.message}`;
  }

  return `OpenAPI generation failed: ${String(error)}`;
}

export async function runOpenApiCli(
  generateDocument: () => Promise<void> = writeOpenApiDocument,
): Promise<number> {
  try {
    await generateDocument();
    return 0;
  } catch (error: unknown) {
    process.stderr.write(`${formatOpenApiCliError(error)}\n`);
    return 1;
  }
}

export async function writeOpenApiDocument(): Promise<void> {
  const document = await createOpenApiDocument();
  await mkdir(dirname(OPENAPI_OUTPUT_PATH), { recursive: true });
  await writeFile(
    OPENAPI_OUTPUT_PATH,
    serializeOpenApiDocument(document),
    'utf8',
  );
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortKeys(child)]),
    );
  }
  return value;
}

function supplyDocumentEnvironment(): () => void {
  const previous = new Map<string, string | undefined>();

  for (const [name, value] of Object.entries(DOCUMENT_ENVIRONMENT)) {
    previous.set(name, process.env[name]);
    if (process.env[name] === undefined) {
      process.env[name] = value;
    }
  }

  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  };
}

if (require.main === module) {
  void runOpenApiCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
