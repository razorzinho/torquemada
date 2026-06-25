import { getDbPool } from '../client';
import { LockedChannel } from '../../types/database';
import { logger } from '../../utils/logger';

export const locksRepo = {
  async saveLockedChannel(
    channelId: string,
    guildId: string,
    originalOverwrites: any,
    lockedBy: string,
  ): Promise<LockedChannel | null> {
    try {
      const result = await getDbPool().query<LockedChannel>(
        `INSERT INTO torquemada.locked_channels (channel_id, guild_id, original_overwrites, locked_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (channel_id) DO UPDATE 
         SET original_overwrites = EXCLUDED.original_overwrites,
             locked_by = EXCLUDED.locked_by,
             locked_at = now()
         RETURNING *`,
        [channelId, guildId, JSON.stringify(originalOverwrites), lockedBy],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao salvar lock do canal ${channelId}:`, error);
      return null;
    }
  },

  async getLockedChannel(channelId: string): Promise<LockedChannel | null> {
    try {
      const result = await getDbPool().query<LockedChannel>(
        `SELECT * FROM torquemada.locked_channels WHERE channel_id = $1`,
        [channelId],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao buscar lock do canal ${channelId}:`, error);
      return null;
    }
  },

  async deleteLockedChannel(channelId: string): Promise<boolean> {
    try {
      const result = await getDbPool().query(
        `DELETE FROM torquemada.locked_channels WHERE channel_id = $1`,
        [channelId],
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      logger.error(`Erro ao deletar lock do canal ${channelId}:`, error);
      return false;
    }
  },
};
