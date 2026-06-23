import { getDbPool } from '../client';
import { TicketPanel, Ticket, TicketFormField } from '../../types/database';
import { logger } from '../../utils/logger';

/**
 * Repositório para as tabelas ticket_panels, ticket_form_fields e tickets.
 */
export const ticketsRepo = {
  // ===================== PANELS =====================

  /**
   * Cria um painel de tickets.
   */
  async createPanel(
    guildId: string,
    panelChannelId: string,
    panelMessageId: string,
    targetChannelId: string,
    title: string,
    description: string | null,
    buttonLabel: string,
    buttonStyle: string,
    buttonEmoji: string | null,
    mode: string,
    threadPrefix: string | null,
    collisionGroup: string | null,
    welcomeTitle: string | null,
  ): Promise<TicketPanel | null> {
    try {
      const result = await getDbPool().query<TicketPanel>(
        `INSERT INTO torquemada.ticket_panels
           (guild_id, panel_channel_id, panel_message_id, target_channel_id, title, description, button_label, button_style, button_emoji, mode, thread_prefix, collision_group, welcome_title)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [guildId, panelChannelId, panelMessageId, targetChannelId, title, description, buttonLabel, buttonStyle, buttonEmoji, mode, threadPrefix, collisionGroup, welcomeTitle],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error('Erro ao criar painel de tickets:', error);
      return null;
    }
  },

  /**
   * Obtém um painel pelo ID.
   */
  async getPanel(panelId: number): Promise<TicketPanel | null> {
    try {
      const result = await getDbPool().query<TicketPanel>(
        `SELECT * FROM torquemada.ticket_panels WHERE id = $1`,
        [panelId],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao buscar painel de tickets ${panelId}:`, error);
      return null;
    }
  },

  /**
   * Obtém um painel pelo message_id do botão clicado.
   */
  async getPanelByMessage(messageId: string): Promise<TicketPanel | null> {
    try {
      const result = await getDbPool().query<TicketPanel>(
        `SELECT * FROM torquemada.ticket_panels WHERE panel_message_id = $1`,
        [messageId],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao buscar painel pelo message_id ${messageId}:`, error);
      return null;
    }
  },

  /**
   * Obtém todos os painéis de tickets de um servidor.
   */
  async getPanelsByGuild(guildId: string): Promise<TicketPanel[]> {
    try {
      const result = await getDbPool().query<TicketPanel>(
        `SELECT * FROM torquemada.ticket_panels WHERE guild_id = $1 ORDER BY id ASC`,
        [guildId],
      );
      return result.rows;
    } catch (error) {
      logger.error(`Erro ao buscar painéis de tickets do servidor ${guildId}:`, error);
      return [];
    }
  },

  /**
   * Deleta um painel de tickets.
   */
  async deletePanel(panelId: number): Promise<boolean> {
    try {
      await getDbPool().query(
        `DELETE FROM torquemada.ticket_panels WHERE id = $1`,
        [panelId],
      );
      return true;
    } catch (error) {
      logger.error(`Erro ao deletar painel de tickets ${panelId}:`, error);
      return false;
    }
  },

  // ===================== FORM FIELDS =====================

  /**
   * Adiciona um campo ao formulário de um painel.
   */
  async addFormField(
    panelId: number,
    label: string,
    placeholder: string | null,
    style: string,
    required: boolean,
    position: number,
  ): Promise<TicketFormField | null> {
    try {
      const result = await getDbPool().query<TicketFormField>(
        `INSERT INTO torquemada.ticket_form_fields (panel_id, label, placeholder, style, required, position)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [panelId, label, placeholder, style, required, position],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao adicionar campo ao painel ${panelId}:`, error);
      return null;
    }
  },

  /**
   * Remove um campo do formulário pelo ID.
   */
  async removeFormField(fieldId: number): Promise<boolean> {
    try {
      const result = await getDbPool().query(
        `DELETE FROM torquemada.ticket_form_fields WHERE id = $1`,
        [fieldId],
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      logger.error(`Erro ao remover campo ${fieldId}:`, error);
      return false;
    }
  },

  /**
   * Lista todos os campos de um painel, ordenados por posição.
   */
  async getFormFields(panelId: number): Promise<TicketFormField[]> {
    try {
      const result = await getDbPool().query<TicketFormField>(
        `SELECT * FROM torquemada.ticket_form_fields WHERE panel_id = $1 ORDER BY position ASC`,
        [panelId],
      );
      return result.rows;
    } catch (error) {
      logger.error(`Erro ao buscar campos do painel ${panelId}:`, error);
      return [];
    }
  },

  /**
   * Conta os campos de um painel.
   */
  async getFormFieldCount(panelId: number): Promise<number> {
    try {
      const result = await getDbPool().query<{ count: string }>(
        `SELECT COUNT(*) FROM torquemada.ticket_form_fields WHERE panel_id = $1`,
        [panelId],
      );
      return parseInt(result.rows[0]?.count ?? '0', 10);
    } catch (error) {
      logger.error(`Erro ao contar campos do painel ${panelId}:`, error);
      return 0;
    }
  },

  // ===================== TICKETS =====================

  /**
   * Verifica se o usuário já possui um ticket aberto neste painel específico.
   */
  async getActiveTicketForPanel(guildId: string, userId: string, panelId: number): Promise<Ticket | null> {
    try {
      const result = await getDbPool().query<Ticket>(
        `SELECT * FROM torquemada.tickets
         WHERE guild_id = $1 AND user_id = $2 AND panel_id = $3 AND status = 'open'
         LIMIT 1`,
        [guildId, userId, panelId],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao buscar ticket ativo de ${userId} no painel ${panelId}:`, error);
      return null;
    }
  },

  /**
   * Verifica se o usuário já possui um ticket aberto em qualquer painel do mesmo grupo de colisão.
   * Retorna o ticket ativo e o título do painel que está colidindo.
   */
  async getActiveTicketInGroup(
    guildId: string,
    userId: string,
    collisionGroup: string,
  ): Promise<{ ticket: Ticket; panelTitle: string } | null> {
    try {
      const result = await getDbPool().query<Ticket & { panel_title: string }>(
        `SELECT t.*, tp.title AS panel_title
         FROM torquemada.tickets t
         JOIN torquemada.ticket_panels tp ON t.panel_id = tp.id
         WHERE t.guild_id = $1
           AND t.user_id = $2
           AND t.status = 'open'
           AND tp.collision_group = $3
         LIMIT 1`,
        [guildId, userId, collisionGroup],
      );
      const row = result.rows[0];
      if (!row) return null;
      return { ticket: row, panelTitle: row.panel_title };
    } catch (error) {
      logger.error(`Erro ao buscar ticket ativo no grupo '${collisionGroup}' para ${userId}:`, error);
      return null;
    }
  },

  /**
   * Registra a abertura de um novo ticket.
   */
  async openTicket(
    guildId: string,
    userId: string,
    threadId: string,
    panelId: number,
  ): Promise<Ticket | null> {
    try {
      const result = await getDbPool().query<Ticket>(
        `INSERT INTO torquemada.tickets (guild_id, user_id, thread_id, panel_id, status)
         VALUES ($1, $2, $3, $4, 'open')
         RETURNING *`,
        [guildId, userId, threadId, panelId],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao abrir ticket para ${userId}:`, error);
      return null;
    }
  },

  /**
   * Fecha um ticket pelo thread_id.
   */
  async closeTicket(threadId: string, closedBy: string): Promise<Ticket | null> {
    try {
      const result = await getDbPool().query<Ticket>(
        `UPDATE torquemada.tickets
         SET status = 'closed', closed_at = NOW(), closed_by = $2
         WHERE thread_id = $1 AND status = 'open'
         RETURNING *`,
        [threadId, closedBy],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao fechar ticket ${threadId}:`, error);
      return null;
    }
  },

  /**
   * Busca um ticket pelo thread_id.
   */
  async getTicketByThread(threadId: string): Promise<Ticket | null> {
    try {
      const result = await getDbPool().query<Ticket>(
        `SELECT * FROM torquemada.tickets WHERE thread_id = $1`,
        [threadId],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao buscar ticket pela thread ${threadId}:`, error);
      return null;
    }
  },

  /**
   * Lista todos os tickets de um servidor (com filtro de status opcional).
   */
  async getTicketsByGuild(guildId: string, status?: 'open' | 'closed'): Promise<Ticket[]> {
    try {
      let query = `SELECT * FROM torquemada.tickets WHERE guild_id = $1`;
      const params: any[] = [guildId];

      if (status) {
        query += ` AND status = $2`;
        params.push(status);
      }

      query += ` ORDER BY created_at DESC`;

      const result = await getDbPool().query<Ticket>(query, params);
      return result.rows;
    } catch (error) {
      logger.error(`Erro ao listar tickets do servidor ${guildId}:`, error);
      return [];
    }
  },
};
