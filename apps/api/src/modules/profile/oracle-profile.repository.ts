import { Injectable } from '@nestjs/common';
import oracledb from 'oracledb';
import type { Connection } from 'oracledb';

import { OracleService } from '../../common/database/oracle.service';
import type { ProfileRepository } from './profile.repository';
import type {
  ConnectionIntent,
  GenderCode,
  LocationLevel,
  ProfileCatalog,
  ProfileInput,
} from './profile.types';

interface CatalogRow {
  CODE: string;
  LABEL: string;
  IS_ACTIVE: number;
}

interface LocationRow {
  CODE: string;
  NAME: string;
  LOCATION_LEVEL: LocationLevel;
  PARENT_CODE: string | null;
  IS_ACTIVE: number;
}

interface PromptRow {
  CODE: string;
  PROMPT_TEXT: string;
  IS_ACTIVE: number;
}

interface ProfileRow {
  DISPLAY_NAME: string;
  BIRTH_DATE: string;
  GENDER_IDENTITY_CODE: GenderCode;
  GENDER_LABEL: string | null;
  HEIGHT_CM: number | null;
  HOMETOWN_LOCATION_CODE: string | null;
  HOME_LOCATION_CODE: string;
  BIO: string | null;
  FAVORITE_SONG_TITLE: string | null;
  FAVORITE_SONG_ARTIST: string | null;
}

interface CodeRow {
  CODE: string;
}

interface PromptAnswerRow {
  PROMPT_CODE: string;
  ANSWER: string;
}

@Injectable()
export class OracleProfileRepository implements ProfileRepository {
  constructor(private readonly oracleService: OracleService) {}

  getCatalog(): Promise<ProfileCatalog> {
    return this.oracleService.withConnection(async (connection) => {
      const genders = await connection.execute<CatalogRow>(
        `SELECT code, display_name AS label, is_active
         FROM gender_catalog
         ORDER BY sort_order`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const intents = await connection.execute<CatalogRow>(
        `SELECT code, display_name AS label, is_active
         FROM connection_intent_catalog
         ORDER BY sort_order`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const locations = await connection.execute<LocationRow>(
        `SELECT code, display_name AS name, location_level, parent_code,
                is_active
         FROM location_nodes
         ORDER BY code`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const prompts = await connection.execute<PromptRow>(
        `SELECT code, prompt_text, is_active
         FROM profile_prompts
         ORDER BY sort_order`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      return {
        genders: (genders.rows ?? []).map((row) => ({
          code: row.CODE as GenderCode,
          label: row.LABEL,
          isActive: row.IS_ACTIVE === 1,
        })),
        connectionIntents: (intents.rows ?? []).map((row) => ({
          code: row.CODE as ConnectionIntent,
          label: row.LABEL,
          isActive: row.IS_ACTIVE === 1,
        })),
        locations: (locations.rows ?? []).map((row) => ({
          code: row.CODE,
          name: row.NAME,
          level: row.LOCATION_LEVEL,
          parentCode: row.PARENT_CODE,
          isActive: row.IS_ACTIVE === 1,
        })),
        prompts: (prompts.rows ?? []).map((row) => ({
          code: row.CODE,
          text: row.PROMPT_TEXT,
          isActive: row.IS_ACTIVE === 1,
        })),
      };
    });
  }

  findByUserId(userId: string): Promise<ProfileInput | null> {
    return this.oracleService.withTransaction(async (connection) => {
      await connection.execute('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      return this.readByUserId(connection, userId);
    });
  }

  async upsert(userId: string, input: ProfileInput): Promise<ProfileInput> {
    return this.oracleService.withTransaction(async (connection) => {
      await this.upsertScalar(connection, userId, input);
      await connection.execute(
        'DELETE FROM profile_interested_genders WHERE user_id = :userId',
        { userId },
      );
      await connection.execute(
        'DELETE FROM profile_connection_intents WHERE user_id = :userId',
        { userId },
      );
      await connection.execute(
        'DELETE FROM profile_prompt_answers WHERE user_id = :userId',
        { userId },
      );

      for (const genderCode of input.interestedInGenders) {
        await connection.execute(
          `INSERT INTO profile_interested_genders (user_id, gender_code)
           VALUES (:userId, :genderCode)`,
          { userId, genderCode },
        );
      }
      for (const intentCode of input.connectionIntents) {
        await connection.execute(
          `INSERT INTO profile_connection_intents (user_id, intent_code)
           VALUES (:userId, :intentCode)`,
          { userId, intentCode },
        );
      }
      for (const answer of input.promptAnswers) {
        await connection.execute(
          `INSERT INTO profile_prompt_answers (user_id, prompt_code, answer)
           VALUES (:userId, :promptCode, :answer)`,
          { userId, promptCode: answer.promptCode, answer: answer.answer },
        );
      }

      const stored = await this.readByUserId(connection, userId);
      if (!stored) {
        throw new Error('Profile missing after upsert');
      }
      return stored;
    });
  }

  private async readByUserId(
    connection: Connection,
    userId: string,
  ): Promise<ProfileInput | null> {
    const scalarResult = await connection.execute<ProfileRow>(
      `SELECT display_name,
                TO_CHAR(birth_date, 'YYYY-MM-DD') AS birth_date,
                gender_identity_code, gender_label, height_cm,
                hometown_location_code, home_location_code, bio,
                favorite_song_title, favorite_song_artist
         FROM profiles
         WHERE user_id = :userId`,
      { userId },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: {
          BIO: { type: oracledb.STRING },
          FAVORITE_SONG_TITLE: { type: oracledb.STRING },
          FAVORITE_SONG_ARTIST: { type: oracledb.STRING },
        },
      },
    );
    const scalar = scalarResult.rows?.[0];
    if (!scalar) {
      return null;
    }

    const interestedGenders = await connection.execute<CodeRow>(
      `SELECT interests.gender_code AS code
         FROM profile_interested_genders interests
         JOIN gender_catalog catalog ON catalog.code = interests.gender_code
         WHERE interests.user_id = :userId
         ORDER BY catalog.sort_order`,
      { userId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const connectionIntents = await connection.execute<CodeRow>(
      `SELECT selections.intent_code AS code
         FROM profile_connection_intents selections
         JOIN connection_intent_catalog catalog
           ON catalog.code = selections.intent_code
         WHERE selections.user_id = :userId
         ORDER BY catalog.sort_order`,
      { userId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const promptAnswers = await connection.execute<PromptAnswerRow>(
      `SELECT answers.prompt_code, answers.answer
         FROM profile_prompt_answers answers
         JOIN profile_prompts prompts ON prompts.code = answers.prompt_code
         WHERE answers.user_id = :userId
         ORDER BY prompts.sort_order`,
      { userId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    return {
      displayName: scalar.DISPLAY_NAME,
      birthDate: scalar.BIRTH_DATE,
      genderIdentity: scalar.GENDER_IDENTITY_CODE,
      genderLabel: scalar.GENDER_LABEL,
      interestedInGenders: (interestedGenders.rows ?? []).map(
        ({ CODE }) => CODE as GenderCode,
      ),
      connectionIntents: (connectionIntents.rows ?? []).map(
        ({ CODE }) => CODE as ConnectionIntent,
      ),
      heightCm: scalar.HEIGHT_CM,
      hometownLocationCode: scalar.HOMETOWN_LOCATION_CODE,
      homeLocationCode: scalar.HOME_LOCATION_CODE,
      bio: scalar.BIO ?? '',
      favoriteSongTitle: scalar.FAVORITE_SONG_TITLE,
      favoriteSongArtist: scalar.FAVORITE_SONG_ARTIST,
      promptAnswers: (promptAnswers.rows ?? []).map((row) => ({
        promptCode: row.PROMPT_CODE,
        answer: row.ANSWER,
      })),
    };
  }

  private async upsertScalar(
    connection: Connection,
    userId: string,
    input: ProfileInput,
  ): Promise<void> {
    await connection.execute(
      `MERGE INTO profiles target
       USING (SELECT :userId AS user_id FROM dual) source
       ON (target.user_id = source.user_id)
       WHEN MATCHED THEN UPDATE SET
         target.display_name = :displayName,
         target.birth_date = TO_DATE(:birthDate, 'YYYY-MM-DD'),
         target.gender_identity_code = :genderIdentity,
         target.gender_label = :genderLabel,
         target.height_cm = :heightCm,
         target.hometown_location_code = :hometownLocationCode,
         target.home_location_code = :homeLocationCode,
         target.bio = :bio,
         target.favorite_song_title = :favoriteSongTitle,
         target.favorite_song_artist = :favoriteSongArtist,
         target.updated_at = (SYSTIMESTAMP AT TIME ZONE 'UTC')
       WHEN NOT MATCHED THEN INSERT (
         user_id, display_name, birth_date, gender_identity_code, gender_label,
         height_cm, hometown_location_code, home_location_code, bio,
         favorite_song_title, favorite_song_artist
       ) VALUES (
         :userId, :displayName, TO_DATE(:birthDate, 'YYYY-MM-DD'),
         :genderIdentity, :genderLabel, :heightCm, :hometownLocationCode,
         :homeLocationCode, :bio, :favoriteSongTitle, :favoriteSongArtist
       )`,
      {
        userId,
        displayName: input.displayName,
        birthDate: input.birthDate,
        genderIdentity: input.genderIdentity,
        genderLabel: input.genderLabel,
        heightCm: input.heightCm,
        hometownLocationCode: input.hometownLocationCode,
        homeLocationCode: input.homeLocationCode,
        bio: input.bio,
        favoriteSongTitle: {
          val: input.favoriteSongTitle,
          type: oracledb.CLOB,
        },
        favoriteSongArtist: {
          val: input.favoriteSongArtist,
          type: oracledb.CLOB,
        },
      },
    );
  }
}
