import { getDbPool } from '../client';
import { ModAction } from '../../types/database';
import { logger } from '../../utils/logger';

export const modActionsRepo = {
  /**
   * Registra uma ação de moderação.
   */
  async create(
    guildId: string,
    userId: string,
    moderatorId: string,
    actionType: string,
    reason: string | null,
    duration: string | null,
    details: Record<string, any> | null,
  ): Promise<ModAction | null> {
    try {
      const result = await getDbPool().query<ModAction>(
        `INSERT INTO torquemada.mod_actions
           (guild_id, user_id, moderator_id, action_type, reason, duration, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [guildId, userId, moderatorId, actionType, reason, duration, details ? JSON.stringify(details) : null],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error('Erro ao registrar mod_action:', error);
      return null;
    }
  },

  /**
   * Busca ações de moderação de um usuário em um servidor.
   */
  async getByUser(guildId: string, userId: string): Promise<ModAction[]> {
    try {
      const result = await getDbPool().query<ModAction>(
        `SELECT * FROM torquemada.mod_actions
         WHERE guild_id = $1 AND user_id = $2
         ORDER BY created_at DESC`,
        [guildId, userId],
      );
      return result.rows;
    } catch (error) {
      logger.error(`Erro ao buscar mod_actions do user ${userId}:`, error);
      return [];
    }
  },

  /**
   * Busca uma ação pelo ID (case number).
   */
  async getById(id: number, guildId: string): Promise<ModAction | null> {
    try {
      const result = await getDbPool().query<ModAction>(
        `SELECT * FROM torquemada.mod_actions WHERE id = $1 AND guild_id = $2`,
        [id, guildId],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao buscar mod_action #${id}:`, error);
      return null;
    }
  },

  /**
   * Busca as ações mais recentes de um servidor.
   */
  async getRecent(guildId: string, limit: number = 10, actionType?: string): Promise<ModAction[]> {
    try {
      let query = `SELECT * FROM torquemada.mod_actions WHERE guild_id = $1`;
      const params: any[] = [guildId];

      if (actionType) {
        query += ` AND action_type = $2`;
        params.push(actionType);
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await getDbPool().query<ModAction>(query, params);
      return result.rows;
    } catch (error) {
      logger.error(`Erro ao buscar mod_actions recentes:`, error);
      return [];
    }
  },
};
