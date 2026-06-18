import { getDbPool } from '../client';
import { AutomodConfig } from '../../types/database';
import { logger } from '../../utils/logger';

/**
 * Repositório para a tabela automod_config.
 */
export const automodRepo = {
  /**
   * Obtém a configuração de automod de um servidor.
   */
  async getConfig(guildId: string): Promise<AutomodConfig | null> {
    try {
      const result = await getDbPool().query<AutomodConfig>(
        `SELECT * FROM torquemada.automod_config WHERE guild_id = $1`,
        [guildId]
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao buscar configuração de automod do servidor ${guildId}:`, error);
      return null;
    }
  },

  /**
   * Cria ou atualiza a configuração de automod.
   */
  async upsertConfig(guildId: string, data: Partial<AutomodConfig>): Promise<AutomodConfig | null> {
    const keys = Object.keys(data);
    if (keys.length === 0) return this.getConfig(guildId);

    const values: any[] = [guildId];
    const setClauses: string[] = [];
    const insertColumns: string[] = ['guild_id'];
    const insertPlaceholders: string[] = ['$1'];

    keys.forEach((key, index) => {
      values.push(data[key as keyof AutomodConfig]);
      const paramIndex = index + 2;
      insertColumns.push(key);
      insertPlaceholders.push(`$${paramIndex}`);
      setClauses.push(`${key} = EXCLUDED.${key}`);
    });

    const query = `
      INSERT INTO torquemada.automod_config (${insertColumns.join(', ')})
      VALUES (${insertPlaceholders.join(', ')})
      ON CONFLICT (guild_id) DO UPDATE
      SET ${setClauses.join(', ')}
      RETURNING *
    `;

    try {
      const result = await getDbPool().query<AutomodConfig>(query, values);
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao salvar configuração de automod do servidor ${guildId}:`, error);
      return null;
    }
  },

  /**
   * Ativa ou desativa o automod.
   */
  async toggle(guildId: string, enabled: boolean): Promise<AutomodConfig | null> {
    return this.upsertConfig(guildId, { enabled });
  },

  /**
   * Adiciona uma palavra à lista de palavras proibidas.
   */
  async addBadword(guildId: string, word: string): Promise<AutomodConfig | null> {
    const config = await this.getConfig(guildId);
    const currentWords = config?.badwords ?? [];

    const normalizedWord = word.toLowerCase().trim();
    if (currentWords.includes(normalizedWord)) {
      return config;
    }

    return this.upsertConfig(guildId, {
      badwords: [...currentWords, normalizedWord],
    });
  },

  /**
   * Remove uma palavra da lista de palavras proibidas.
   */
  async removeBadword(guildId: string, word: string): Promise<AutomodConfig | null> {
    const config = await this.getConfig(guildId);
    const currentWords = config?.badwords ?? [];

    const normalizedWord = word.toLowerCase().trim();
    const filtered = currentWords.filter(w => w !== normalizedWord);

    return this.upsertConfig(guildId, {
      badwords: filtered,
    });
  },

  /**
   * Obtém a lista de palavras proibidas.
   */
  async getBadwords(guildId: string): Promise<string[]> {
    try {
      const result = await getDbPool().query<{ badwords: string[] }>(
        `SELECT badwords FROM torquemada.automod_config WHERE guild_id = $1`,
        [guildId]
      );
      return result.rows[0]?.badwords ?? [];
    } catch (error) {
      logger.error(`Erro ao buscar badwords do servidor ${guildId}:`, error);
      return [];
    }
  },
};
