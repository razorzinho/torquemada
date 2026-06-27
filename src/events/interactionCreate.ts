import {
  Events,
  Interaction,
  ChannelType,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} from 'discord.js';
import { TorquemadaClient } from '../client';
import { logger } from '../utils/logger';
import { ticketsRepo } from '../database/repositories/tickets';
import { Colors } from '../utils/embeds';

export default {
  name: Events.InteractionCreate,
  once: false,

  async execute(interaction: Interaction, client: TorquemadaClient) {
    // ===================== SLASH COMMANDS =====================
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        logger.warn(`Nenhum comando correspondente para /${interaction.commandName} foi encontrado.`);
        return;
      }

      try {
        await command.execute(interaction, client);
      } catch (error) {
        logger.error(`Erro ao executar comando /${interaction.commandName}:`, error);
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'Ocorreu um erro inesperado ao executar este comando!',
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: 'Ocorreu um erro inesperado ao executar este comando!',
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    }

    // ===================== BUTTON INTERACTIONS =====================
    else if (interaction.isButton()) {
      // ===================== ROLE PANEL BUTTONS =====================
      if (interaction.customId.startsWith('rolepanel:')) {
        try {
          const parts = interaction.customId.split(':');
          if (parts.length < 3) return;
          const roleId = parts[2];
          const member = interaction.guild?.members.cache.get(interaction.user.id) || await interaction.guild?.members.fetch(interaction.user.id);
          
          if (!member) {
            await interaction.reply({ content: 'Não foi possível encontrar o membro.', flags: MessageFlags.Ephemeral });
            return;
          }

          const role = interaction.guild?.roles.cache.get(roleId);
          if (!role) {
            await interaction.reply({ content: 'Este cargo não existe mais no servidor.', flags: MessageFlags.Ephemeral });
            return;
          }

          if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId);
            await interaction.reply({ content: `O cargo **${role.name}** foi removido de você.`, flags: MessageFlags.Ephemeral });
          } else {
            await member.roles.add(roleId);
            await interaction.reply({ content: `O cargo **${role.name}** foi adicionado a você.`, flags: MessageFlags.Ephemeral });
          }
        } catch (error) {
          logger.error('Erro ao interagir com botão do painel de roles:', error);
          await interaction.reply({ content: 'Não foi possível gerenciar este cargo (provavelmente por causa da hierarquia de cargos ou permissões).', flags: MessageFlags.Ephemeral });
        }
      }

      // ===================== TICKET OPEN BUTTON =====================
      else if (interaction.customId.startsWith('ticket_open:')) {
        try {
          const panelId = parseInt(interaction.customId.split(':')[1], 10);
          if (isNaN(panelId)) return;

          const guildId = interaction.guildId!;
          const userId = interaction.user.id;

          // Busca o painel
          const panel = await ticketsRepo.getPanel(panelId);
          if (!panel) {
            await interaction.reply({ content: '❌ Painel de tickets não encontrado.', flags: MessageFlags.Ephemeral });
            return;
          }

          // ===== VALIDAÇÃO DE COLISÃO =====
          if (panel.collision_group) {
            // Painel com grupo de colisão — verifica se o usuário tem ticket ativo no grupo
            const collision = await ticketsRepo.getActiveTicketInGroup(guildId, userId, panel.collision_group);
            if (collision) {
              await interaction.reply({
                content: `❌ Você já possui um ticket ativo no painel **${collision.panelTitle}**: <#${collision.ticket.thread_id}>.\n` +
                  `Painéis do grupo \`${panel.collision_group}\` não permitem tickets simultâneos.`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
          } else {
            // Painel sem grupo — verifica apenas se já tem ticket neste painel específico
            const activeTicket = await ticketsRepo.getActiveTicketForPanel(guildId, userId, panelId);
            if (activeTicket) {
              await interaction.reply({
                content: `❌ Você já possui um ticket aberto neste painel: <#${activeTicket.thread_id}>.\nPor favor, utilize o ticket existente ou aguarde seu encerramento.`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
          }

          // ===== VERIFICAR SE TEM FORMULÁRIO =====
          const formFields = await ticketsRepo.getFormFields(panelId);

          if (formFields.length > 0) {
            // Tem formulário — exibe Modal
            const modal = new ModalBuilder()
              .setCustomId(`ticket_form:${panelId}`)
              .setTitle(panel.title.slice(0, 45));

            for (const field of formFields) {
              const textInput = new TextInputBuilder()
                .setCustomId(`field_${field.id}`)
                .setLabel(field.label)
                .setStyle(field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
                .setRequired(field.required);

              if (field.placeholder) {
                textInput.setPlaceholder(field.placeholder);
              }

              modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(textInput),
              );
            }

            await interaction.showModal(modal);
            return;
          }

          // Sem formulário + modo analysis → bloqueia
          if (panel.mode === 'analysis') {
            await interaction.reply({
              content: '❌ Este painel está em modo análise mas não possui formulário configurado. Contate um administrador.',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          // Sem formulário + modo interactive → cria thread direto
          await createTicketThread(interaction, panel, userId, guildId, null);

        } catch (error) {
          logger.error('Erro ao abrir ticket:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '❌ Ocorreu um erro ao abrir o ticket. Tente novamente mais tarde.',
              flags: MessageFlags.Ephemeral,
            });
          }
        }
      }

      // ===================== TICKET CLOSE BUTTON =====================
      else if (interaction.customId.startsWith('ticket_close:')) {
        try {
          const threadId = interaction.customId.split(':')[1];
          const guildId = interaction.guildId!;

          const ticket = await ticketsRepo.getTicketByThread(threadId);
          if (!ticket || ticket.guild_id !== guildId) {
            await interaction.reply({ content: '❌ Ticket não encontrado.', flags: MessageFlags.Ephemeral });
            return;
          }

          if (ticket.status === 'closed') {
            await interaction.reply({ content: '❌ Este ticket já foi encerrado.', flags: MessageFlags.Ephemeral });
            return;
          }

          await ticketsRepo.closeTicket(threadId, interaction.user.id);

          const closeEmbed = new EmbedBuilder()
            .setColor(Colors.MODERATION)
            .setTitle('🔒 Ticket Encerrado')
            .setDescription(
              `Este ticket foi encerrado por ${interaction.user}.\n` +
              `O tópico será arquivado e trancado.`,
            )
            .setTimestamp();

          await interaction.reply({ embeds: [closeEmbed] });

          const channel = interaction.channel;
          if (channel && channel.isThread()) {
            await channel.setLocked(true).catch(() => {});
            await channel.setArchived(true).catch(() => {});
          }
        } catch (error) {
          logger.error('Erro ao fechar ticket via botão:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Ocorreu um erro ao fechar o ticket.', flags: MessageFlags.Ephemeral });
          }
        }
      }

      // ===================== TICKET APPROVE BUTTON (ANALYSIS) =====================
      else if (interaction.customId.startsWith('ticket_approve:')) {
        try {
          const threadId = interaction.customId.split(':')[1];
          const guildId = interaction.guildId!;

          const ticket = await ticketsRepo.getTicketByThread(threadId);
          if (!ticket || ticket.guild_id !== guildId) {
            await interaction.reply({ content: '❌ Ticket não encontrado.', flags: MessageFlags.Ephemeral });
            return;
          }

          if (ticket.status === 'closed') {
            await interaction.reply({ content: '❌ Este ticket já foi processado.', flags: MessageFlags.Ephemeral });
            return;
          }

          await ticketsRepo.closeTicket(threadId, interaction.user.id);

          // Tenta enviar DM ao autor
          try {
            const user = await interaction.client.users.fetch(ticket.user_id);
            const panel = ticket.panel_id ? await ticketsRepo.getPanel(ticket.panel_id) : null;
            const panelName = panel?.title ?? 'Ticket';
            await user.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(Colors.SUCCESS)
                  .setTitle('✅ Solicitação Aprovada')
                  .setDescription(`Sua solicitação no painel **${panelName}** foi aprovada por **${interaction.user.tag}**.`)
                  .setTimestamp(),
              ],
            });
          } catch {
            logger.warn(`Não foi possível enviar DM para ${ticket.user_id} (aprovação).`);
          }

          const approveEmbed = new EmbedBuilder()
            .setColor(Colors.SUCCESS)
            .setTitle('✅ Ticket Aprovado')
            .setDescription(`Aprovado por ${interaction.user}. O tópico será arquivado.`)
            .setTimestamp();

          await interaction.reply({ embeds: [approveEmbed] });

          const channel = interaction.channel;
          if (channel && channel.isThread()) {
            await channel.setLocked(true).catch(() => {});
            await channel.setArchived(true).catch(() => {});
          }
        } catch (error) {
          logger.error('Erro ao aprovar ticket:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Ocorreu um erro ao aprovar o ticket.', flags: MessageFlags.Ephemeral });
          }
        }
      }

      // ===================== TICKET REJECT BUTTON (ANALYSIS) =====================
      else if (interaction.customId.startsWith('ticket_reject:')) {
        try {
          const threadId = interaction.customId.split(':')[1];

          // Exibe modal pedindo motivo
          const modal = new ModalBuilder()
            .setCustomId(`ticket_reject_reason:${threadId}`)
            .setTitle('Motivo da Rejeição');

          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Motivo')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Descreva o motivo da rejeição...')
                .setRequired(true),
            ),
          );

          await interaction.showModal(modal);
        } catch (error) {
          logger.error('Erro ao abrir modal de rejeição:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Ocorreu um erro ao processar a rejeição.', flags: MessageFlags.Ephemeral });
          }
        }
      }
    }

    // ===================== MODAL SUBMIT INTERACTIONS =====================
    else if (interaction.isModalSubmit()) {
      // ===================== TICKET FORM SUBMIT =====================
      if (interaction.customId.startsWith('ticket_form:')) {
        try {
          const panelId = parseInt(interaction.customId.split(':')[1], 10);
          if (isNaN(panelId)) return;

          const guildId = interaction.guildId!;
          const userId = interaction.user.id;

          const panel = await ticketsRepo.getPanel(panelId);
          if (!panel) {
            await interaction.reply({ content: '❌ Painel não encontrado.', flags: MessageFlags.Ephemeral });
            return;
          }

          // Re-validar colisão (o modal pode levar tempo para preencher)
          if (panel.collision_group) {
            const collision = await ticketsRepo.getActiveTicketInGroup(guildId, userId, panel.collision_group);
            if (collision) {
              await interaction.reply({
                content: `❌ Enquanto você preenchia o formulário, um ticket no grupo \`${panel.collision_group}\` foi aberto. Tente novamente depois.`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
          } else {
            const activeTicket = await ticketsRepo.getActiveTicketForPanel(guildId, userId, panelId);
            if (activeTicket) {
              await interaction.reply({
                content: `❌ Você já possui um ticket aberto neste painel: <#${activeTicket.thread_id}>.`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
          }

          // Coleta as respostas do formulário
          const formFields = await ticketsRepo.getFormFields(panelId);
          const answers: { label: string; value: string }[] = [];
          for (const field of formFields) {
            const value = interaction.fields.getTextInputValue(`field_${field.id}`);
            if (value) {
              answers.push({ label: field.label, value });
            }
          }

          await createTicketThread(interaction, panel, userId, guildId, answers);
        } catch (error) {
          logger.error('Erro ao processar formulário de ticket:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Ocorreu um erro ao processar o formulário.', flags: MessageFlags.Ephemeral });
          }
        }
      }

      // ===================== TICKET REJECT REASON SUBMIT =====================
      else if (interaction.customId.startsWith('ticket_reject_reason:')) {
        try {
          const threadId = interaction.customId.split(':')[1];
          const guildId = interaction.guildId!;
          const reason = interaction.fields.getTextInputValue('reason');

          const ticket = await ticketsRepo.getTicketByThread(threadId);
          if (!ticket || ticket.guild_id !== guildId) {
            await interaction.reply({ content: '❌ Ticket não encontrado.', flags: MessageFlags.Ephemeral });
            return;
          }

          if (ticket.status === 'closed') {
            await interaction.reply({ content: '❌ Este ticket já foi processado.', flags: MessageFlags.Ephemeral });
            return;
          }

          await ticketsRepo.closeTicket(threadId, interaction.user.id);

          // Tenta enviar DM ao autor
          try {
            const user = await interaction.client.users.fetch(ticket.user_id);
            const panel = ticket.panel_id ? await ticketsRepo.getPanel(ticket.panel_id) : null;
            const panelName = panel?.title ?? 'Ticket';
            await user.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(Colors.ERROR)
                  .setTitle('❌ Solicitação Rejeitada')
                  .setDescription(
                    `Sua solicitação no painel **${panelName}** foi rejeitada por **${interaction.user.tag}**.\n\n` +
                    `📝 **Motivo:** ${reason}`,
                  )
                  .setTimestamp(),
              ],
            });
          } catch {
            logger.warn(`Não foi possível enviar DM para ${ticket.user_id} (rejeição).`);
          }

          const rejectEmbed = new EmbedBuilder()
            .setColor(Colors.ERROR)
            .setTitle('❌ Ticket Rejeitado')
            .setDescription(`Rejeitado por ${interaction.user}.\n📝 **Motivo:** ${reason}\n\nO tópico será arquivado.`)
            .setTimestamp();

          await interaction.reply({ embeds: [rejectEmbed] });

          const channel = interaction.channel;
          if (channel && channel.isThread()) {
            await channel.setLocked(true).catch(() => {});
            await channel.setArchived(true).catch(() => {});
          }
        } catch (error) {
          logger.error('Erro ao processar rejeição de ticket:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Ocorreu um erro ao processar a rejeição.', flags: MessageFlags.Ephemeral });
          }
        }
      }
    }
  },
};

// ===================== HELPER: CRIA A THREAD DO TICKET =====================

import { TicketPanel } from '../types/database';

/**
 * Cria a thread do ticket, registra no banco e envia a mensagem inicial.
 * Funciona tanto para tickets diretos (sem formulário) quanto para tickets com formulário (Modal Submit).
 */
async function createTicketThread(
  interaction: Interaction & { reply: Function; user: any; guild: any },
  panel: TicketPanel,
  userId: string,
  guildId: string,
  answers: { label: string; value: string }[] | null,
): Promise<void> {
  const targetChannel = interaction.guild!.channels.cache.get(panel.target_channel_id) as TextChannel | undefined;
  if (!targetChannel) {
    await interaction.reply({
      content: '❌ O canal de tickets configurado não foi encontrado. Contate um administrador.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Monta o nome da thread com prefixo
  const username = interaction.user.username;
  const threadName = panel.thread_prefix
    ? `${panel.thread_prefix}-${username}`
    : `🎫│${username}`;

  // Cria a thread privada
  const thread = await targetChannel.threads.create({
    name: threadName,
    type: ChannelType.PrivateThread,
    invitable: true,
    reason: `Ticket aberto por ${interaction.user.tag}`,
  });

  // Registra no banco de dados
  const ticket = await ticketsRepo.openTicket(guildId, userId, thread.id, panel.id);
  if (!ticket) {
    await thread.delete().catch(() => {});
    await interaction.reply({
      content: '❌ Não foi possível registrar o ticket. Tente novamente.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Monta o embed de boas-vindas
  const welcomeEmbed = new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTimestamp();

  if (panel.mode === 'analysis') {
    // Modo análise — embed com dados do autor para o staff
    welcomeEmbed
      .setTitle(panel.welcome_title || '🎫 Nova Solicitação')
      .setDescription(
        `**Autor:** <@${userId}> (\`${interaction.user.tag}\`)\n` +
        `**ID:** \`${userId}\`\n` +
        `📌 **Ticket ID:** \`#${ticket.id}\``,
      )
      .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }));

    // Adiciona as respostas do formulário como campos
    if (answers && answers.length > 0) {
      for (const answer of answers) {
        welcomeEmbed.addFields({ name: answer.label, value: answer.value || '*Não respondido*' });
      }
    }

    welcomeEmbed.setFooter({ text: 'Use os botões abaixo para aprovar ou rejeitar.' });

    // Botões de aprovação/rejeição
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_approve:${thread.id}`)
        .setLabel('✅ Aprovar')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ticket_reject:${thread.id}`)
        .setLabel('❌ Rejeitar')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`ticket_close:${thread.id}`)
        .setLabel('🔒 Fechar')
        .setStyle(ButtonStyle.Secondary),
    );

    await thread.send({ embeds: [welcomeEmbed], components: [actionRow] });

    // Não adiciona o usuário à thread — somente staff vê
    await interaction.reply({
      content: '✅ Sua solicitação foi enviada para análise! Você receberá uma notificação quando for processada.',
      flags: MessageFlags.Ephemeral,
    });
  } else {
    // Modo interativo — adiciona o usuário
    welcomeEmbed
      .setTitle(panel.welcome_title || '🎫 Ticket Aberto')
      .setDescription(
        `Olá <@${userId}>, bem-vindo ao seu ticket!\n\n` +
        `Descreva seu problema ou solicitação aqui. Um membro da equipe irá atendê-lo em breve.\n\n` +
        `📌 **Ticket ID:** \`#${ticket.id}\``,
      )
      .setFooter({ text: 'Clique no botão abaixo para encerrar o ticket quando finalizado.' });

    // Adiciona as respostas do formulário como campos
    if (answers && answers.length > 0) {
      for (const answer of answers) {
        welcomeEmbed.addFields({ name: answer.label, value: answer.value || '*Não respondido*' });
      }
    }

    const closeButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_close:${thread.id}`)
        .setLabel('🔒 Fechar Ticket')
        .setStyle(ButtonStyle.Danger),
    );

    await thread.send({
      content: `<@${userId}>`,
      embeds: [welcomeEmbed],
      components: [closeButton],
    });

    // Tenta adicionar o membro explicitamente (fallback não-fatal)
    try {
      await thread.members.add(userId);
    } catch {
      logger.warn(`Não foi possível adicionar ${userId} à thread ${thread.id} via members.add — menção utilizada como fallback.`);
    }

    await interaction.reply({
      content: `✅ Seu ticket foi criado com sucesso: ${thread}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
