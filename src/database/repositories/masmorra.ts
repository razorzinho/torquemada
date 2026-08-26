import { getDbPool } from '../client';
import { MasmorraSession } from '../../types/database';

export const masmorraRepo = {
  async saveSession(guildId: string, userId: string, savedRoles: string[]): Promise<void> {
    const pool = getDbPool();
    const query = `
      INSERT INTO torquemada.masmorra_sessions (guild_id, user_id, saved_roles)
      VALUES ($1, $2, $3)
      ON CONFLICT (guild_id, user_id) 
      DO UPDATE SET saved_roles = $3, created_at = now()
    `;
    await pool.query(query, [guildId, userId, savedRoles]);
  },

  async getSession(guildId: string, userId: string): Promise<MasmorraSession | null> {
    const pool = getDbPool();
    const query = `SELECT * FROM torquemada.masmorra_sessions WHERE guild_id = $1 AND user_id = $2`;
    const { rows } = await pool.query(query, [guildId, userId]);
    return rows[0] || null;
  },

  async deleteSession(guildId: string, userId: string): Promise<void> {
    const pool = getDbPool();
    const query = `DELETE FROM torquemada.masmorra_sessions WHERE guild_id = $1 AND user_id = $2`;
    await pool.query(query, [guildId, userId]);
  }
};
