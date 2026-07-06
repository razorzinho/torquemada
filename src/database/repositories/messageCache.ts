import { getDbPool } from '../client';
import { MessageCache } from '../../types/database';
import { logger } from '../../utils/logger';

export const messageCacheRepo = {
  /**
   * Salva uma mensagem no cache de forma silenciosa e assíncrona.
   */
  async saveMessage(data: Omit<MessageCache, 'created_at'>): Promise<void> {
    try {
      const pool = getDbPool();
      await pool.query(
        `
        INSERT INTO torquemada.message_cache 
          (id, guild_id, channel_id, author_id, author_tag, author_avatar, role_color, content, attachments)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING
        `,
        [
          data.id,
          data.guild_id,
          data.channel_id,
          data.author_id,
          data.author_tag,
          data.author_avatar,
          data.role_color,
          data.content,
          data.attachments ? JSON.stringify(data.attachments) : null,
        ]
      );
    } catch (error) {
      // Falhas no cache não devem derrubar o bot ou poluir os logs críticos
      logger.error('Erro ao salvar mensagem no cache:', error);
    }
  },

  /**
   * Busca uma mensagem pelo ID. Retorna null se não encontrar.
   */
  async getMessage(id: string): Promise<MessageCache | null> {
    try {
      const pool = getDbPool();
      const result = await pool.query<MessageCache>(
        `SELECT * FROM torquemada.message_cache WHERE id = $1`,
        [id]
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error('Erro ao buscar mensagem do cache:', error);
      return null;
    }
  },

  /**
   * Limpa as mensagens de uma Guild que são mais antigas que a retenção configurada.
   */
  async cleanupOldMessages(guildId: string, retentionDays: number = 30): Promise<void> {
    try {
      const pool = getDbPool();
      await pool.query(
        `
        DELETE FROM torquemada.message_cache 
        WHERE guild_id = $1 AND created_at < NOW() - INTERVAL '1 day' * $2
        `,
        [guildId, retentionDays]
      );
    } catch (error) {
      logger.error('Erro ao limpar mensagens antigas:', error);
    }
  }
};
