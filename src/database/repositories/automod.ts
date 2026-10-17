import { getDbPool } from '../client';
import { AutomodConfig, BadwordPunishment } from '../../types/database';
import { DEFAULT_BADWORDS_PRESET } from '../../utils/textNormalizer';
import { logger } from '../../utils/logger';

export const BADWORD_PUNISHMENT_DESCRIPTIONS: Record<BadwordPunishment, string> = {
  delete: 'Deleta a mensagem silenciosamente (sem aviso ou punição extra)',
  warn: 'Deleta a mensagem + Aviso rápido no chat (sem Timeout)',
  timeout: 'Deleta a mensagem + Timeout automático (1 min) + Aviso',
  kick: 'Deleta a mensagem + Expulsão do servidor (Kick) + Aviso',
  ban: 'Deleta a mensagem + Banimento do servidor (Ban) + Aviso',
};

export const BADWORD_PUNISHMENT_SHORT_LABELS: Record<BadwordPunishment, string> = {
  delete: '🗑️ Apenas Deletar Mensagem',
  warn: '⚠️ Deletar + Avisar no Chat',
  timeout: '🔇 Deletar + Timeout (1 min)',
  kick: '👢 Deletar + Expulsar (Kick)',
  ban: '🔨 Deletar + Banir (Ban)',
};

// Controle em memória para garantir que novas palavras adicionadas ao preset no código
// e a coluna badwords_severe_action sejam sincronizadas automaticamente no banco ao iniciar o bot
const syncedGuildsOnStartup = new Set<string>();
let schemaChecked = false;

async function ensureAutomodSchema(): Promise<void> {
  if (schemaChecked) return;
  try {
    await getDbPool().query(`
      ALTER TABLE torquemada.automod_config
        ADD COLUMN IF NOT EXISTS badwords_severe_action TEXT DEFAULT 'timeout',
        ADD COLUMN IF NOT EXISTS log_channel_id TEXT
    `);
    schemaChecked = true;
  } catch (error) {
    logger.warn('Aviso ao verificar colunas adicionais em automod_config:', error);
  }
}

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
      await ensureAutomodSchema();
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
          badwords_severe_action: 'timeout',
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
        const needsSevereDefault = !existing.badwords_severe_action;
        if (addedAny || !existing.badwords || existing.badwords.length === 0 || needsSevereDefault) {
          return await this.upsertConfig(guildId, {
            enabled: true,
            badwords: Array.from(currentSet),
            ...(needsSevereDefault ? { badwords_severe_action: 'timeout' } : {}),
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
    await ensureAutomodSchema();
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
   * Define ou remove o canal de logs exclusivo do AutoMod.
   */
  async setLogChannel(guildId: string, channelId: string | null): Promise<AutomodConfig | null> {
    return this.upsertConfig(guildId, { log_channel_id: channelId });
  },

  /**
   * Define a severidade de punição para um nível específico (Nível 1 = 'severe', Nível 2 = 'moderate').
   */
  async setTierPunishment(
    guildId: string,
    tier: 'severe' | 'moderate',
    punishment: BadwordPunishment,
  ): Promise<AutomodConfig | null> {
    const updateData: Partial<AutomodConfig> =
      tier === 'severe'
        ? { badwords_severe_action: punishment }
        : { badwords_action: punishment };
    return this.upsertConfig(guildId, updateData);
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
  async addBadwords(
    guildId: string,
    words: string[],
    action?: BadwordPunishment,
    tier?: 'severe' | 'moderate',
  ): Promise<AutomodConfig | null> {
    const config = await this.getConfig(guildId);
    const currentSet = new Set(config?.badwords ?? DEFAULT_BADWORDS_PRESET);

    for (const w of words) {
      const normalized = w.toLowerCase().trim();
      if (normalized.length > 0) {
        // Se antes estava no outro nível (com ou sem '!'), substitui para não duplicar
        const clean = normalized.replace(/^!+/, '');
        currentSet.delete(clean);
        currentSet.delete(`!${clean}`);
        currentSet.add(normalized);
      }
    }

    const updateData: Partial<AutomodConfig> = {
      enabled: true,
      badwords: Array.from(currentSet),
    };
    if (action) {
      if (tier === 'severe') {
        updateData.badwords_severe_action = action;
      } else {
        updateData.badwords_action = action;
      }
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
