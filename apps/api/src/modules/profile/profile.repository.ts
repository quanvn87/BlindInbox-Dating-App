import type { ProfileCatalog, ProfileInput } from './profile.types';

export const PROFILE_REPOSITORY = 'PROFILE_REPOSITORY';

export interface ProfileRepository {
  getCatalog(): Promise<ProfileCatalog>;
  findByUserId(userId: string): Promise<ProfileInput | null>;
  upsert(userId: string, input: ProfileInput): Promise<ProfileInput>;
}
