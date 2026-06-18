import { getDbPool } from '../client';
import { Warning } from '../../types/database';
import { logger } from '../../utils/logger';

/**
 * Adiciona um aviso para um usuário.
 */
export async function addWarning(
  guildId: string,
  userId: string,
  moderatorId: string,
  reason: string,
): Promise<Warning | null> {
  try {
    const result = await getDbPool().query<Warning>(
      `INSERT INTO torquemada.warnings (guild_id, user_id, moderator_id, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [guildId, userId, moderatorId, reason]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    logger.error('Erro ao adicionar warning:', error);
    return null;
  }
}

/**
 * Busca todos os avisos de um usuário em um servidor.
 */
export async function getWarnings(
  guildId: string,
  userId: string,
): Promise<Warning[]> {
  try {
    const result = await getDbPool().query<Warning>(
      `SELECT * FROM torquemada.warnings
       WHERE guild_id = $1 AND user_id = $2
       ORDER BY created_at DESC`,
      [guildId, userId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Erro ao buscar warnings:', error);
    return [];
  }
}

/**
 * Conta o total de avisos de um usuário em um servidor.
 */
export async function getWarningCount(
  guildId: string,
  userId: string,
): Promise<number> {
  try {
    const result = await getDbPool().query<{ count: string }>(
      `SELECT COUNT(*) FROM torquemada.warnings
       WHERE guild_id = $1 AND user_id = $2`,
      [guildId, userId]
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  } catch (error) {
    logger.error('Erro ao contar warnings:', error);
    return 0;
  }
}

/**
 * Remove todos os avisos de um usuário em um servidor.
 */
export async function clearWarnings(
  guildId: string,
  userId: string,
): Promise<number> {
  try {
    const result = await getDbPool().query(
      `DELETE FROM torquemada.warnings
       WHERE guild_id = $1 AND user_id = $2
       RETURNING id`,
      [guildId, userId]
    );
    return result.rowCount ?? 0;
  } catch (error) {
    logger.error('Erro ao limpar warnings:', error);
    return 0;
  }
}

/**
 * Remove um aviso específico por ID.
 */
export async function deleteWarning(id: number): Promise<boolean> {
  try {
    await getDbPool().query(
      `DELETE FROM torquemada.warnings WHERE id = $1`,
      [id]
    );
    return true;
  } catch (error) {
    logger.error('Erro ao deletar warning:', error);
    return false;
  }
}
