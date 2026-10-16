import { getDbPool } from '../client';
import { AutomodConfig } from '../../types/database';
import { DEFAULT_BADWORDS_PRESET } from '../../utils/textNormalizer';
import { logger } from '../../utils/logger';

// Controle em memória para garantir que novas palavras adicionadas ao preset no código
// sejam sincronizadas automaticamente no banco ao iniciar o bot
const syncedGuildsOnStartup = new Set<string>();

/**
 * Repositório para a tabela automod_config.
 */
export const automodRepo = {
  /**
   * Obtém a configuração de automod de um servidor.
   * Se ainda não existir registro ou se houver novas palavras no preset do código, sincroniza automaticamente.
   */
  async getConfig(guildId: string): Promise<AutomodConfig | null> {
    try {
      const result = await getDbPool().query<AutomodConfig>(
        `SELECT * FROM torquemada.automod_config WHERE guild_id = $1`,
        [guildId]
      );
      const existing = result.rows[0] ?? null;

      if (!existing) {
        syncedGuildsOnStartup.add(guildId);
        return await this.upsertConfig(guildId, {
          enabled: true,
          badwords: DEFAULT_BADWORDS_PRESET,
          badwords_action: 'warn',
        });
      }

      if (!syncedGuildsOnStartup.has(guildId)) {
        syncedGuildsOnStartup.add(guildId);
        const currentSet = new Set(existing.badwords ?? []);
        let addedAny = false;
        for (const presetWord of DEFAULT_BADWORDS_PRESET) {
          if (!currentSet.has(presetWord)) {
            currentSet.add(presetWord);
            addedAny = true;
          }
        }
        if (addedAny || !existing.badwords || existing.badwords.length === 0) {
          return await this.upsertConfig(guildId, {
            enabled: true,
            badwords: Array.from(currentSet),
          });
        }
      }

      return existing;
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
    return this.addBadwords(guildId, [word]);
  },

  /**
   * Adiciona múltiplas palavras à lista de palavras proibidas de uma só vez.
   */
  async addBadwords(guildId: string, words: string[], action?: 'delete' | 'warn' | 'timeout'): Promise<AutomodConfig | null> {
    const config = await this.getConfig(guildId);
    const currentSet = new Set(config?.badwords ?? DEFAULT_BADWORDS_PRESET);

    for (const w of words) {
      const normalized = w.toLowerCase().trim();
      if (normalized.length > 0) {
        currentSet.add(normalized);
      }
    }

    const updateData: Partial<AutomodConfig> = {
      enabled: true,
      badwords: Array.from(currentSet),
    };
    if (action) {
      updateData.badwords_action = action;
    }

    return this.upsertConfig(guildId, updateData);
  },

  /**
   * Remove uma palavra da lista de palavras proibidas.
   */
  async removeBadword(guildId: string, word: string): Promise<AutomodConfig | null> {
    return this.removeBadwords(guildId, [word]);
  },

  /**
   * Remove múltiplas palavras da lista de palavras proibidas.
   */
  async removeBadwords(guildId: string, words: string[]): Promise<AutomodConfig | null> {
    const config = await this.getConfig(guildId);
    const currentWords = config?.badwords ?? [];
    const toRemove = new Set<string>();
    for (const w of words) {
      const clean = w.toLowerCase().trim().replace(/^!+/, '');
      toRemove.add(clean);
      toRemove.add(`!${clean}`);
    }
    const filtered = currentWords.filter(w => !toRemove.has(w.toLowerCase().trim()));

    return this.upsertConfig(guildId, {
      badwords: filtered,
    });
  },

  /**
   * Obtém a lista de palavras proibidas.
   */
  async getBadwords(guildId: string): Promise<string[]> {
    const config = await this.getConfig(guildId);
    return config?.badwords ?? DEFAULT_BADWORDS_PRESET;
  },
};
