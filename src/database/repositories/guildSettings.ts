import { getDbPool } from '../client';
import { GuildSettings } from '../../types/database';
import { logger } from '../../utils/logger';

/**
 * Repositório para a tabela guild_settings.
 */
export const guildSettingsRepo = {
  /**
   * Obtém as configurações de um servidor.
   */
  async getSettings(guildId: string): Promise<GuildSettings | null> {
    try {
      const result = await getDbPool().query<GuildSettings>(
        `SELECT * FROM torquemada.guild_settings WHERE guild_id = $1`,
        [guildId]
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao buscar configurações do servidor ${guildId}:`, error);
      return null;
    }
  },

  /**
   * Cria ou atualiza as configurações de um servidor.
   */
  async upsertSettings(guildId: string, data: Partial<GuildSettings>): Promise<GuildSettings | null> {
    const keys = Object.keys(data);
    if (keys.length === 0) return this.getSettings(guildId);

    const values: any[] = [guildId];
    const setClauses: string[] = [];
    const insertColumns: string[] = ['guild_id'];
    const insertPlaceholders: string[] = ['$1'];

    keys.forEach((key, index) => {
      values.push(data[key as keyof GuildSettings]);
      const paramIndex = index + 2;
      insertColumns.push(key);
      insertPlaceholders.push(`$${paramIndex}`);
      setClauses.push(`${key} = EXCLUDED.${key}`);
    });

    const query = `
      INSERT INTO torquemada.guild_settings (${insertColumns.join(', ')})
      VALUES (${insertPlaceholders.join(', ')})
      ON CONFLICT (guild_id) DO UPDATE
      SET ${setClauses.join(', ')}
      RETURNING *
    `;

    try {
      const result = await getDbPool().query<GuildSettings>(query, values);
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao salvar configurações do servidor ${guildId}:`, error);
      return null;
    }
  },

  /**
   * Define o canal de logs e os eventos habilitados.
   */
  async setLogChannel(
    guildId: string,
    channelId: string,
    events: string[],
  ): Promise<GuildSettings | null> {
    return this.upsertSettings(guildId, {
      log_channel: channelId,
      log_events: events,
    });
  },

  /**
   * Obtém o canal de logs e os eventos habilitados.
   */
  async getLogChannel(guildId: string): Promise<{ log_channel: string | null; log_events: string[] } | null> {
    try {
      const result = await getDbPool().query<{ log_channel: string | null; log_events: string[] }>(
        `SELECT log_channel, log_events FROM torquemada.guild_settings WHERE guild_id = $1`,
        [guildId]
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao buscar canal de logs do servidor ${guildId}:`, error);
      return null;
    }
  },

  /**
   * Define a configuração de boas-vindas.
   */
  async setWelcome(
    guildId: string,
    channelId: string,
    message: string,
    enabled: boolean,
  ): Promise<GuildSettings | null> {
    return this.upsertSettings(guildId, {
      welcome_channel: channelId,
      welcome_message: message,
      welcome_enabled: enabled,
    });
  },

  /**
   * Define a configuração de despedida.
   */
  async setFarewell(
    guildId: string,
    channelId: string,
    message: string,
    enabled: boolean,
  ): Promise<GuildSettings | null> {
    return this.upsertSettings(guildId, {
      farewell_channel: channelId,
      farewell_message: message,
      farewell_enabled: enabled,
    });
  },

  /**
   * Define o cargo automático para novos membros.
   */
  async setAutorole(guildId: string, roleId: string | null): Promise<GuildSettings | null> {
    return this.upsertSettings(guildId, {
      autorole_id: roleId,
    });
  },
};
