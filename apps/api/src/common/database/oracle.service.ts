import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import oracledb, { Connection, Pool } from 'oracledb';

@Injectable()
export class OracleService implements OnModuleDestroy {
  private pool?: Pool;
  private poolCreation?: Promise<Pool>;

  constructor(private readonly configService: ConfigService) {}

  async withConnection<T>(
    callback: (connection: Connection) => Promise<T>,
  ): Promise<T> {
    const connection = await (await this.getPool()).getConnection();

    try {
      return await callback(connection);
    } finally {
      await connection.close();
    }
  }

  async withTransaction<T>(
    callback: (connection: Connection) => Promise<T>,
  ): Promise<T> {
    const connection = await (await this.getPool()).getConnection();

    try {
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error: unknown) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.close();
    }
  }

  async ping(): Promise<void> {
    await this.withConnection(async (connection) => {
      await connection.execute('SELECT 1 FROM dual');
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
    }
  }

  private async getPool(): Promise<Pool> {
    if (this.pool) {
      return this.pool;
    }

    if (!this.poolCreation) {
      this.poolCreation = oracledb
        .createPool({
          user: this.configService.getOrThrow<string>('ORACLE_USER'),
          password: this.configService.getOrThrow<string>('ORACLE_PASSWORD'),
          connectString: this.configService.getOrThrow<string>(
            'ORACLE_CONNECT_STRING',
          ),
          poolMin: 1,
          poolMax: 5,
        })
        .then((pool) => {
          this.pool = pool;
          return pool;
        })
        .catch((error: unknown) => {
          this.poolCreation = undefined;
          throw error;
        });
    }

    return this.poolCreation;
  }
}
