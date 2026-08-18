import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import oracledb from 'oracledb';
import type { Connection } from 'oracledb';

import { OracleService } from '../../common/database/oracle.service';
import type {
  AuthRepository,
  ConsumeOtpChallengeResult,
} from './auth.repository';
import type {
  AuthUser,
  OtpChallenge,
  RefreshSession,
  UserStatus,
} from './auth.types';

interface OtpChallengeRow {
  ID: string;
  PHONE_E164: string;
  CODE_DIGEST: string;
  ATTEMPTS: number;
  EXPIRES_AT: Date;
  CONSUMED_AT: Date | null;
  CREATED_AT: Date;
}

interface OtpStateRow {
  ATTEMPTS: number;
  EXPIRES_AT: Date;
  CONSUMED_AT: Date | null;
}

interface UserRow {
  ID: string;
  PHONE_E164: string;
  STATUS: UserStatus;
}

interface RefreshSessionRow {
  ID: string;
  USER_ID: string;
  TOKEN_DIGEST: string;
  DEVICE_NAME: string;
  EXPIRES_AT: Date;
  REVOKED_AT: Date | null;
  CREATED_AT: Date;
}

@Injectable()
export class OracleAuthRepository implements AuthRepository {
  constructor(private readonly oracleService: OracleService) {}

  async createOtpChallenge(challenge: OtpChallenge): Promise<void> {
    await this.oracleService.withTransaction((connection) =>
      connection.execute(
        `INSERT INTO otp_challenges (
           id, phone_e164, code_digest, attempts, expires_at, consumed_at,
           created_at
         ) VALUES (
           :id, :phoneE164, :codeDigest, :attempts, :expiresAt, :consumedAt,
           :createdAt
         )`,
        {
          id: challenge.id,
          phoneE164: challenge.phoneE164,
          codeDigest: challenge.codeDigest,
          attempts: challenge.attempts,
          expiresAt: challenge.expiresAt,
          consumedAt: challenge.consumedAt,
          createdAt: challenge.createdAt,
        },
      ),
    );
  }

  async findOtpChallengeById(id: string): Promise<OtpChallenge | null> {
    return this.oracleService.withConnection(async (connection) => {
      const result = await connection.execute<OtpChallengeRow>(
        `SELECT id, phone_e164, code_digest, attempts, expires_at,
                consumed_at, created_at
         FROM otp_challenges
         WHERE id = :id`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const row = result.rows?.[0];
      return row ? this.mapOtpChallenge(row) : null;
    });
  }

  async incrementOtpAttempts(
    id: string,
    maximumAttempts: number,
  ): Promise<number | null> {
    return this.oracleService.withTransaction(async (connection) => {
      const update = await connection.execute(
        `UPDATE otp_challenges
         SET attempts = attempts + 1
         WHERE id = :id
           AND consumed_at IS NULL
           AND attempts < :maximumAttempts`,
        { id, maximumAttempts },
      );
      if (update.rowsAffected !== 1) {
        return null;
      }

      const result = await connection.execute<{ ATTEMPTS: number }>(
        'SELECT attempts FROM otp_challenges WHERE id = :id',
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      return result.rows?.[0]?.ATTEMPTS ?? null;
    });
  }

  async consumeOtpChallenge(
    id: string,
    consumedAt: Date,
    maximumAttempts: number,
  ): Promise<ConsumeOtpChallengeResult> {
    return this.oracleService.withTransaction(async (connection) => {
      const update = await connection.execute(
        `UPDATE otp_challenges
         SET consumed_at = :consumedAt
         WHERE id = :id
           AND consumed_at IS NULL
           AND expires_at > :consumedAt
           AND attempts < :maximumAttempts`,
        { id, consumedAt, maximumAttempts },
      );
      if (update.rowsAffected === 1) {
        return 'CONSUMED';
      }

      const result = await connection.execute<OtpStateRow>(
        `SELECT attempts, expires_at, consumed_at
         FROM otp_challenges
         WHERE id = :id`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const row = result.rows?.[0];
      if (!row) {
        return 'NOT_FOUND';
      }
      if (row.CONSUMED_AT) {
        return 'ALREADY_CONSUMED';
      }
      if (row.EXPIRES_AT.getTime() <= consumedAt.getTime()) {
        return 'EXPIRED';
      }
      if (row.ATTEMPTS >= maximumAttempts) {
        return 'ATTEMPTS_EXCEEDED';
      }
      return 'NOT_FOUND';
    });
  }

  async findOrCreateUserByPhone(phoneE164: string): Promise<AuthUser> {
    return this.oracleService.withTransaction(async (connection) => {
      const existing = await this.findUserByPhone(connection, phoneE164);
      if (existing) {
        return existing;
      }

      const user: AuthUser = {
        id: randomUUID(),
        phoneE164,
        status: 'ACTIVE',
      };
      try {
        await connection.execute(
          `INSERT INTO app_users (id, phone_e164, status)
           VALUES (:id, :phoneE164, :status)`,
          {
            id: user.id,
            phoneE164: user.phoneE164,
            status: user.status,
          },
        );
        return user;
      } catch (error: unknown) {
        if (!this.isUniqueConstraintViolation(error)) {
          throw error;
        }
        const concurrent = await this.findUserByPhone(connection, phoneE164);
        if (!concurrent) {
          throw error;
        }
        return concurrent;
      }
    });
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    return this.oracleService.withConnection(async (connection) => {
      const result = await connection.execute<UserRow>(
        `SELECT id, phone_e164, status
         FROM app_users
         WHERE id = :id`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const row = result.rows?.[0];
      return row ? this.mapUser(row) : null;
    });
  }

  async createRefreshSession(session: RefreshSession): Promise<void> {
    await this.oracleService.withTransaction((connection) =>
      this.insertRefreshSession(connection, session),
    );
  }

  async findRefreshSessionByDigest(
    tokenDigest: string,
  ): Promise<RefreshSession | null> {
    return this.oracleService.withConnection(async (connection) => {
      const result = await connection.execute<RefreshSessionRow>(
        `SELECT id, user_id, token_digest, device_name, expires_at,
                revoked_at, created_at
         FROM refresh_sessions
         WHERE token_digest = :tokenDigest`,
        { tokenDigest },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const row = result.rows?.[0];
      return row ? this.mapRefreshSession(row) : null;
    });
  }

  async rotateRefreshSession(
    currentTokenDigest: string,
    replacement: RefreshSession,
    rotatedAt: Date,
  ): Promise<boolean> {
    return this.oracleService.withTransaction(async (connection) => {
      const update = await connection.execute(
        `UPDATE refresh_sessions
         SET revoked_at = :rotatedAt
         WHERE token_digest = :currentTokenDigest
           AND revoked_at IS NULL
           AND expires_at > :rotatedAt`,
        { currentTokenDigest, rotatedAt },
      );
      if (update.rowsAffected !== 1) {
        return false;
      }

      await this.insertRefreshSession(connection, replacement);
      return true;
    });
  }

  async revokeRefreshSessionByDigest(
    tokenDigest: string,
    revokedAt: Date,
  ): Promise<void> {
    await this.oracleService.withTransaction((connection) =>
      connection.execute(
        `UPDATE refresh_sessions
         SET revoked_at = :revokedAt
         WHERE token_digest = :tokenDigest
           AND revoked_at IS NULL`,
        { tokenDigest, revokedAt },
      ),
    );
  }

  private async findUserByPhone(
    connection: Connection,
    phoneE164: string,
  ): Promise<AuthUser | null> {
    const result = await connection.execute<UserRow>(
      `SELECT id, phone_e164, status
       FROM app_users
       WHERE phone_e164 = :phoneE164`,
      { phoneE164 },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const row = result.rows?.[0];
    return row ? this.mapUser(row) : null;
  }

  private insertRefreshSession(
    connection: Connection,
    session: RefreshSession,
  ) {
    return connection.execute(
      `INSERT INTO refresh_sessions (
         id, user_id, token_digest, device_name, expires_at, revoked_at,
         created_at
       ) VALUES (
         :id, :userId, :tokenDigest, :deviceName, :expiresAt, :revokedAt,
         :createdAt
       )`,
      {
        id: session.id,
        userId: session.userId,
        tokenDigest: session.tokenDigest,
        deviceName: session.deviceName,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        createdAt: session.createdAt,
      },
    );
  }

  private mapOtpChallenge(row: OtpChallengeRow): OtpChallenge {
    return {
      id: row.ID,
      phoneE164: row.PHONE_E164,
      codeDigest: row.CODE_DIGEST,
      attempts: row.ATTEMPTS,
      expiresAt: row.EXPIRES_AT,
      consumedAt: row.CONSUMED_AT,
      createdAt: row.CREATED_AT,
    };
  }

  private mapUser(row: UserRow): AuthUser {
    return {
      id: row.ID,
      phoneE164: row.PHONE_E164,
      status: row.STATUS,
    };
  }

  private mapRefreshSession(row: RefreshSessionRow): RefreshSession {
    return {
      id: row.ID,
      userId: row.USER_ID,
      tokenDigest: row.TOKEN_DIGEST,
      deviceName: row.DEVICE_NAME,
      expiresAt: row.EXPIRES_AT,
      revokedAt: row.REVOKED_AT,
      createdAt: row.CREATED_AT,
    };
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'errorNum' in error &&
      error.errorNum === 1
    );
  }
}
