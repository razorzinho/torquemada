import { getDbPool } from '../client';
import { TicketPanel, Ticket } from '../../types/database';
import { logger } from '../../utils/logger';

/**
 * Repositório para as tabelas ticket_panels e tickets.
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
  ): Promise<TicketPanel | null> {
    try {
      const result = await getDbPool().query<TicketPanel>(
        `INSERT INTO torquemada.ticket_panels
           (guild_id, panel_channel_id, panel_message_id, target_channel_id, title, description, button_label, button_style, button_emoji)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [guildId, panelChannelId, panelMessageId, targetChannelId, title, description, buttonLabel, buttonStyle, buttonEmoji],
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

  // ===================== TICKETS =====================

  /**
   * Verifica se o usuário já possui um ticket aberto no servidor.
   */
  async getActiveTicket(guildId: string, userId: string): Promise<Ticket | null> {
    try {
      const result = await getDbPool().query<Ticket>(
        `SELECT * FROM torquemada.tickets
         WHERE guild_id = $1 AND user_id = $2 AND status = 'open'
         LIMIT 1`,
        [guildId, userId],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      logger.error(`Erro ao buscar ticket ativo de ${userId} em ${guildId}:`, error);
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
