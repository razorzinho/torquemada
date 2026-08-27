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
  GuildMember,
  PermissionFlagsBits,
} from 'discord.js';
import { TorquemadaClient } from '../client';
import { logger } from '../utils/logger';
import { ticketsRepo } from '../database/repositories/tickets';
import { guildSettingsRepo } from '../database/repositories/guildSettings';
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
        
        try {
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
        } catch (followUpError) {
          logger.error('Falha ao enviar mensagem de erro (token expirado ou interação deletada):', followUpError);
        }
      }
    }

    // ===================== AUTOCOMPLETE INTERACTIONS =====================
    else if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        if (command.autocomplete) {
          await command.autocomplete(interaction, client);
        }
      } catch (error) {
        logger.error(`Erro ao executar autocomplete para /${interaction.commandName}:`, error);
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
              const threadChannel = interaction.guild?.channels.cache.get(collision.ticket.thread_id);
              if (threadChannel && threadChannel.isThread()) {
                await threadChannel.send({ content: `<@${userId}>, você tentou abrir um novo ticket que conflita com este. Por favor, continue o atendimento por aqui.` }).catch(() => {});
              }
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
              const threadChannel = interaction.guild?.channels.cache.get(activeTicket.thread_id);
              if (threadChannel && threadChannel.isThread()) {
                await threadChannel.send({ content: `<@${userId}>, você tentou abrir um novo ticket, mas este ainda está ativo. Por favor, continue o atendimento por aqui.` }).catch(() => {});
              }
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

          // Restaura roles da masmorra, se aplicável
          const settings = await guildSettingsRepo.getSettings(guildId);
          if (settings && ticket.panel_id === settings.masmorra_panel_id) {
            const { masmorraRepo } = await import('../database/repositories/masmorra');
            const session = await masmorraRepo.getSession(guildId, ticket.user_id);
            if (session && session.saved_roles.length > 0) {
              const targetMember = await interaction.guild?.members.fetch(ticket.user_id).catch(() => null);
              if (targetMember) {
                await targetMember.roles.add(session.saved_roles, 'Masmorra: liberação, ticket encerrado').catch(() => {});
                if (settings.masmorra_role_id) {
                  await targetMember.roles.remove(settings.masmorra_role_id).catch(() => {});
                }
              }
              await masmorraRepo.deleteSession(guildId, ticket.user_id);
            }
          }

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

      // ===================== TICKET MOD ACTION (DYNAMIC) =====================
      else if (interaction.customId.startsWith('ticket_mod_action:')) {
        try {
          const buttonId = parseInt(interaction.customId.split(':')[1], 10);
          const guildId = interaction.guildId!;
          
          if (!interaction.channel?.isThread()) return;
          const threadId = interaction.channel.id;

          const ticket = await ticketsRepo.getTicketByThread(threadId);
          if (!ticket) {
            return interaction.reply({ content: '❌ Ticket não encontrado.', flags: MessageFlags.Ephemeral });
          }
          if (!ticket.panel_id) {
            return interaction.reply({ content: '❌ Ticket não possui painel associado.', flags: MessageFlags.Ephemeral });
          }

          // Check permissions: Must have ManageMessages and not be the ticket author
          const member = interaction.member as GuildMember;
          if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '❌ Você não tem permissão para usar ações de moderação.', flags: MessageFlags.Ephemeral });
          }
          if (interaction.user.id === ticket.user_id) {
            return interaction.reply({ content: '❌ Você não pode aprovar ou usar ações no seu próprio ticket.', flags: MessageFlags.Ephemeral });
          }

          const buttons = await ticketsRepo.getActionButtons(ticket.panel_id);
          const button = buttons.find(b => b.id === buttonId);
          
          if (!button) {
            return interaction.reply({ content: '❌ Ação não encontrada ou foi removida.', flags: MessageFlags.Ephemeral });
          }

          await interaction.deferReply();

          const targetMember = await interaction.guild?.members.fetch(ticket.user_id).catch(() => null);
          if (!targetMember) {
            return interaction.followUp({ content: '❌ O autor do ticket não está mais no servidor.', flags: MessageFlags.Ephemeral });
          }

          const settings = await guildSettingsRepo.getSettings(guildId);
          let closeTicket = false;
          let effectCount = 0;

          for (const effect of button.effects) {
            if (effect.type === 'add_role' && effect.targetId) {
              await targetMember.roles.add(effect.targetId).catch(() => {});
              effectCount++;
            } else if (effect.type === 'remove_role' && effect.targetId) {
              await targetMember.roles.remove(effect.targetId).catch(() => {});
              effectCount++;
              
              // Se estamos removendo o cargo da masmorra, restaura os cargos salvos
              if (settings && effect.targetId === settings.masmorra_role_id) {
                const { masmorraRepo } = await import('../database/repositories/masmorra');
                const session = await masmorraRepo.getSession(guildId, targetMember.id);
                if (session && session.saved_roles.length > 0) {
                  await targetMember.roles.add(session.saved_roles, 'Masmorra: liberação, restaurando cargos antigos').catch(() => {});
                  await masmorraRepo.deleteSession(guildId, targetMember.id);
                }
              }
            } else if (effect.type === 'close_ticket') {
              closeTicket = true;
            }
          }

          await interaction.followUp({ content: `✅ Ação **${button.label}** executada com sucesso. (${effectCount} modificações aplicadas)` });

          if (closeTicket) {
            await ticketsRepo.closeTicket(threadId, interaction.user.id);
            const closeEmbed = new EmbedBuilder()
              .setColor(Colors.MODERATION)
              .setTitle('🔒 Ticket Encerrado')
              .setDescription(`Este ticket foi encerrado via ação de ${interaction.user}.`)
              .setTimestamp();
            await interaction.channel.send({ embeds: [closeEmbed] });
            await interaction.channel.setLocked(true).catch(() => {});
            await interaction.channel.setArchived(true).catch(() => {});
          }

        } catch (error) {
          logger.error('Erro ao executar ação dinâmica de ticket:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Ocorreu um erro ao executar a ação.', flags: MessageFlags.Ephemeral });
          } else {
            await interaction.followUp({ content: '❌ Ocorreu um erro ao executar a ação.' });
          }
        }
      }

      // ===================== MASMORRA HARDCODED BUTTONS =====================
      else if (interaction.customId.startsWith('masmorra_release') || interaction.customId.startsWith('masmorra_kick') || interaction.customId.startsWith('masmorra_ban')) {
        try {
          const [action, targetId] = interaction.customId.split(':');
          const guildId = interaction.guildId!;
          const member = interaction.member as GuildMember;
          
          if (!interaction.channel?.isThread()) return;
          const threadId = interaction.channel.id;

          const targetMember = await interaction.guild?.members.fetch(targetId).catch(() => null);
          const targetUser = targetMember?.user || await interaction.client.users.fetch(targetId).catch(() => null);

          if (!targetUser) {
            return interaction.reply({ content: '❌ O usuário alvo não foi encontrado.', flags: MessageFlags.Ephemeral });
          }

          if (interaction.user.id === targetUser.id) {
            return interaction.reply({ content: '❌ Você não pode aplicar ações em si mesmo.', flags: MessageFlags.Ephemeral });
          }

          if (action === 'masmorra_release' || action === 'masmorra_kick' || action === 'masmorra_ban') {
            if (action === 'masmorra_release' && !member.permissions.has(PermissionFlagsBits.ManageMessages)) {
              return interaction.reply({ content: '❌ Você não tem permissão para liberar este usuário.', flags: MessageFlags.Ephemeral });
            }
            if (action === 'masmorra_kick' && !member.permissions.has(PermissionFlagsBits.KickMembers)) {
              return interaction.reply({ content: '❌ Você não tem permissão para expulsar membros.', flags: MessageFlags.Ephemeral });
            }
            if (action === 'masmorra_ban' && !member.permissions.has(PermissionFlagsBits.BanMembers)) {
              return interaction.reply({ content: '❌ Você não tem permissão para banir membros.', flags: MessageFlags.Ephemeral });
            }

            if ((action === 'masmorra_kick' || action === 'masmorra_ban') && targetMember && targetMember.roles.highest.position >= member.roles.highest.position) {
              return interaction.reply({ content: '❌ Você não tem permissão para aplicar esta punição neste membro (cargo maior ou igual).', flags: MessageFlags.Ephemeral });
            }

            const modal = new ModalBuilder()
              .setCustomId(`masmorra_modal_${action.split('_')[1]}:${targetId}`)
              .setTitle(action === 'masmorra_release' ? 'Liberar Membro' : action === 'masmorra_kick' ? 'Expulsar Membro' : 'Banir Membro');

            const reasonInput = new TextInputBuilder()
              .setCustomId('reason')
              .setLabel('Motivo da ação')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setPlaceholder('Descreva o motivo dessa conclusão...');

            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
            
            await interaction.showModal(modal);
          }
        } catch (error) {
          logger.error('Erro ao executar botão de masmorra:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Ocorreu um erro ao executar a ação.', flags: MessageFlags.Ephemeral });
          } else {
            await interaction.followUp({ content: '❌ Ocorreu um erro ao executar a ação.' });
          }
        }
      }

      // ===================== MASMORRA CONFIRM / CANCEL =====================
      else if (interaction.customId.startsWith('masmorra_confirm_') || interaction.customId === 'masmorra_cancel') {
        try {
          if (interaction.customId === 'masmorra_cancel') {
            await interaction.update({ content: 'Ação cancelada.', embeds: [], components: [] });
            return;
          }

          // Resgata o motivo do embed ANTES de dar o update na mensagem
          const messageEmbed = interaction.message.embeds[0];
          let reason = 'Sem motivo especificado.';
          if (messageEmbed && messageEmbed.description) {
            const match = messageEmbed.description.match(/\*\*Motivo:\*\* (.*)/s);
            if (match) reason = match[1];
          }

          // Update immediately to avoid 3-second timeout
          await interaction.update({ content: `⏳ Processando ação...`, embeds: [], components: [] });

          const [action, targetId] = interaction.customId.split(':');
          const actionType = action.split('_')[2]; // release | kick | ban
          const guildId = interaction.guildId!;
          
          if (!interaction.channel?.isThread()) return;

          const targetMember = await interaction.guild?.members.fetch(targetId).catch(() => null);
          const targetUser = targetMember?.user || await interaction.client.users.fetch(targetId).catch(() => null);

          if (!targetUser) {
            await interaction.editReply({ content: '❌ O usuário alvo não foi encontrado.', embeds: [], components: [] });
            return;
          }

          if (actionType === 'release') {
            const settings = await guildSettingsRepo.getSettings(guildId);
            if (settings?.masmorra_role_id && targetMember) {
              await targetMember.roles.remove(settings.masmorra_role_id).catch(() => {});
            }

            const { masmorraRepo } = await import('../database/repositories/masmorra');
            const session = await masmorraRepo.getSession(guildId, targetId);
            if (session && session.saved_roles.length > 0 && targetMember) {
              await targetMember.roles.add(session.saved_roles, `Masmorra: liberação, restaurando cargos antigos. Motivo: ${reason}`).catch(() => {});
              await masmorraRepo.deleteSession(guildId, targetId);
            }

            const finalEmbed = new EmbedBuilder()
              .setColor(Colors.SUCCESS)
              .setTitle('Membro Liberado')
              .setDescription(`<@${targetId}> foi liberado da masmorra.\n\n**Motivo da Liberação:** ${reason}\n**Liberado por:** ${interaction.user}`)
              .setTimestamp();
            await interaction.channel.send({ embeds: [finalEmbed] });
          }
          else if (actionType === 'kick') {
            const { modAction } = await import('../utils/modAction');
            await modAction({
              guild: interaction.guild!,
              target: targetUser,
              moderator: interaction.user,
              actionType: 'kick',
              reason: `Expulso via Painel da Masmorra: ${reason}`,
              client: interaction.client as any,
            });
            await targetMember?.kick(`Expulso via Painel da Masmorra: ${reason}`).catch(() => {});
            
            const finalEmbed = new EmbedBuilder()
              .setColor(Colors.WARNING)
              .setTitle('Membro Expulso')
              .setDescription(`<@${targetId}> foi expulso do servidor.\n\n**Motivo:** ${reason}\n**Expulso por:** ${interaction.user}`)
              .setTimestamp();
            await interaction.channel.send({ embeds: [finalEmbed] });
          }
          else if (actionType === 'ban') {
            const { modAction } = await import('../utils/modAction');
            await modAction({
              guild: interaction.guild!,
              target: targetUser,
              moderator: interaction.user,
              actionType: 'ban',
              reason: `Banido via Painel da Masmorra: ${reason}`,
              client: interaction.client as any,
            });
            await interaction.guild?.members.ban(targetId, { reason: `Banido via Painel da Masmorra: ${reason}` }).catch(() => {});
            
            const finalEmbed = new EmbedBuilder()
              .setColor(Colors.ERROR)
              .setTitle('Membro Banido')
              .setDescription(`<@${targetId}> foi banido do servidor.\n\n**Motivo:** ${reason}\n**Banido por:** ${interaction.user}`)
              .setTimestamp();
            await interaction.channel.send({ embeds: [finalEmbed] });
          }

          // Optional: automatically lock the ticket if it was a final action? 
          // The user requested: "Ao finalizar com uma das ações, o bot deixa uma mensagem pública no final da thread com essa conclusão".
          // This is covered by the finalEmbed sends above.

        } catch (error) {
          logger.error('Erro ao executar confirmação de masmorra:', error);
          if (!interaction.replied) {
            await interaction.followUp({ content: '❌ Ocorreu um erro ao executar a ação.', flags: MessageFlags.Ephemeral });
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
      // ===================== MODAL SUBMIT =====================
      if (interaction.customId.startsWith('masmorra_modal_')) {
        const [action, targetId] = interaction.customId.split(':');
        const reason = interaction.fields.getTextInputValue('reason');
        const actionType = action.split('_')[2]; // release | kick | ban
        const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);

        if (!targetUser) {
          return interaction.reply({ content: '❌ O usuário alvo não foi encontrado.', flags: MessageFlags.Ephemeral });
        }

        let title = '';
        if (actionType === 'release') title = 'Liberar';
        else if (actionType === 'kick') title = 'Expulsar';
        else if (actionType === 'ban') title = 'Banir';

        const embed = new EmbedBuilder()
          .setColor(Colors.MODERATION)
          .setTitle(`Confirmação: ${title} ${targetUser.username}`)
          .setDescription(`**Motivo:** ${reason}`)
          .setFooter({ text: 'Por favor, confirme ou cancele esta ação.' });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`masmorra_confirm_${actionType}:${targetId}`)
            .setLabel('Confirmar')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`masmorra_cancel`)
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({
          embeds: [embed],
          components: [row]
        });
        return;
      }
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

    // Botões de aprovação/rejeição padrão (podem ser estendidos)
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

    const { getActionRowForPanel } = await import('../utils/ticketActions');
    const customRow = await getActionRowForPanel(panel.id);
    const components = customRow ? [actionRow, customRow] : [actionRow];

    await thread.send({ embeds: [welcomeEmbed], components });

    // Não adiciona o usuário à thread — somente staff vê
    await interaction.reply({
      content: '✅ Sua solicitação foi enviada para análise! Você receberá uma notificação quando for processada.',
      flags: MessageFlags.Ephemeral,
    });
  } else {
    // Modo interativo
    const customMsg = panel.welcome_message 
      ? panel.welcome_message.replace(/{user}/g, `<@${userId}>`)
      : 'Descreva seu problema ou solicitação aqui. Um membro da equipe irá atendê-lo em breve.';

    const welcomeEmbed = new EmbedBuilder()
      .setColor(Colors.SUCCESS)
      .setTitle(panel.welcome_title ?? `🎫 Ticket de ${interaction.user.username}`)
      .setDescription(
        `Olá <@${userId}>, bem-vindo ao seu ticket!\n\n` +
        `${customMsg}\n\n` +
        `📌 **Ticket ID:** \`#${ticket.id}\``,
      )
      .setTimestamp()
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

    const { getActionRowForPanel } = await import('../utils/ticketActions');
    const customRow = await getActionRowForPanel(panel.id);
    const components = customRow ? [customRow, closeButton] : [closeButton];

    await thread.send({
      content: `<@${userId}>`,
      embeds: [welcomeEmbed],
      components,
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
