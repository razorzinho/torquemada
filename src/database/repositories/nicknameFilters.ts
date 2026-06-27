import { getDbPool } from '../client';
import { logger } from '../../utils/logger';

export interface NicknameFilter {
  guild_id: string;
  keyword: string;
  added_by: string;
  added_at: string;
}

export const nicknameFiltersRepo = {
  async addKeyword(guildId: string, keyword: string, addedBy: string): Promise<NicknameFilter | null> {
    try {
      const result = await getDbPool().query<NicknameFilter>(
        `INSERT INTO torquemada.nickname_filters (guild_id, keyword, added_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, keyword) DO NOTHING
         RETURNING *`,
        [guildId, keyword.toLowerCase(), addedBy],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao adicionar keyword de nickname '${keyword}':`, error);
      return null;
    }
  },

  async removeKeyword(guildId: string, keyword: string): Promise<boolean> {
    try {
      const result = await getDbPool().query(
        `DELETE FROM torquemada.nickname_filters WHERE guild_id = $1 AND keyword = $2`,
        [guildId, keyword.toLowerCase()],
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      logger.error(`Erro ao remover keyword de nickname '${keyword}':`, error);
      return false;
    }
  },

  async getKeywords(guildId: string): Promise<string[]> {
    try {
      const result = await getDbPool().query<{ keyword: string }>(
        `SELECT keyword FROM torquemada.nickname_filters WHERE guild_id = $1 ORDER BY keyword`,
        [guildId],
      );
      return result.rows.map(r => r.keyword);
    } catch (error) {
      logger.error(`Erro ao buscar keywords de nickname:`, error);
      return [];
    }
  },
};
