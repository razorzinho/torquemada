import { getDbPool } from '../client';
import { RolePanel, RolePanelButton } from '../../types/database';
import { logger } from '../../utils/logger';

/**
 * Repositório para as tabelas role_panels e role_panel_buttons.
 */
export const rolePanelsRepo = {
  // ===================== PANELS =====================

  /**
   * Cria um painel de roles.
   */
  async createPanel(
    guildId: string,
    channelId: string,
    messageId: string,
    title: string,
    description: string | null,
  ): Promise<RolePanel | null> {
    try {
      const result = await getDbPool().query<RolePanel>(
        `INSERT INTO torquemada.role_panels (guild_id, channel_id, message_id, title, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [guildId, channelId, messageId, title, description]
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao criar painel de roles:`, error);
      return null;
    }
  },

  /**
   * Obtém um painel pelo ID.
   */
  async getPanel(panelId: number): Promise<RolePanel | null> {
    try {
      const result = await getDbPool().query<RolePanel>(
        `SELECT * FROM torquemada.role_panels WHERE id = $1`,
        [panelId]
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao buscar painel ${panelId}:`, error);
      return null;
    }
  },

  /**
   * Obtém todos os painéis de um servidor.
   */
  async getPanelsByGuild(guildId: string): Promise<RolePanel[]> {
    try {
      const result = await getDbPool().query<RolePanel>(
        `SELECT * FROM torquemada.role_panels WHERE guild_id = $1 ORDER BY id ASC`,
        [guildId]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Erro ao buscar painéis do servidor ${guildId}:`, error);
      return [];
    }
  },

  /**
   * Atualiza informações do painel.
   */
  async updatePanel(
    panelId: number,
    updates: { title?: string; description?: string },
  ): Promise<RolePanel | null> {
    const keys = Object.keys(updates);
    if (keys.length === 0) return this.getPanel(panelId);

    const values: any[] = [panelId];
    const setClauses: string[] = [];

    keys.forEach((key, index) => {
      values.push(updates[key as keyof typeof updates]);
      setClauses.push(`${key} = $${index + 2}`);
    });

    const query = `
      UPDATE torquemada.role_panels
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await getDbPool().query<RolePanel>(query, values);
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao atualizar painel ${panelId}:`, error);
      return null;
    }
  },

  /**
   * Deleta um painel (botões em cascata).
   */
  async deletePanel(panelId: number): Promise<boolean> {
    try {
      await getDbPool().query(
        `DELETE FROM torquemada.role_panels WHERE id = $1`,
        [panelId]
      );
      return true;
    } catch (error) {
      logger.error(`Erro ao deletar painel ${panelId}:`, error);
      return false;
    }
  },

  // ===================== BUTTONS =====================

  /**
   * Adiciona um botão a um painel.
   */
  async addButton(
    panelId: number,
    roleId: string,
    label: string,
    emoji: string | null,
    style: string,
    position: number,
  ): Promise<RolePanelButton | null> {
    try {
      const result = await getDbPool().query<RolePanelButton>(
        `INSERT INTO torquemada.role_panel_buttons (panel_id, role_id, label, emoji, style, position)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [panelId, roleId, label, emoji, style, position]
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao adicionar botão ao painel ${panelId}:`, error);
      return null;
    }
  },

  /**
   * Remove um botão por painel e role.
   */
  async removeButton(panelId: number, roleId: string): Promise<boolean> {
    try {
      await getDbPool().query(
        `DELETE FROM torquemada.role_panel_buttons WHERE panel_id = $1 AND role_id = $2`,
        [panelId, roleId]
      );
      return true;
    } catch (error) {
      logger.error(`Erro ao remover botão do painel ${panelId}, role ${roleId}:`, error);
      return false;
    }
  },

  /**
   * Obtém todos os botões de um painel, ordenados por posição.
   */
  async getButtons(panelId: number): Promise<RolePanelButton[]> {
    try {
      const result = await getDbPool().query<RolePanelButton>(
        `SELECT * FROM torquemada.role_panel_buttons WHERE panel_id = $1 ORDER BY position ASC`,
        [panelId]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Erro ao buscar botões do painel ${panelId}:`, error);
      return [];
    }
  },

  /**
   * Retorna a quantidade de botões de um painel.
   */
  async getButtonCount(panelId: number): Promise<number> {
    try {
      const result = await getDbPool().query<{ count: string }>(
        `SELECT COUNT(*) FROM torquemada.role_panel_buttons WHERE panel_id = $1`,
        [panelId]
      );
      return parseInt(result.rows[0]?.count ?? '0', 10);
    } catch (error) {
      logger.error(`Erro ao contar botões do painel ${panelId}:`, error);
      return 0;
    }
  },
};
