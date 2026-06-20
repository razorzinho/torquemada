import {
  Events,
  Interaction,
  ChannelType,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { TorquemadaClient } from '../client';
import { logger } from '../utils/logger';
import { ticketsRepo } from '../database/repositories/tickets';
import { Colors } from '../utils/embeds';

export default {
  name: Events.InteractionCreate,
  once: false,

  async execute(interaction: Interaction, client: TorquemadaClient) {
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
        
        const errorReply = {
          content: 'Ocorreu um erro inesperado ao executar este comando!',
          ephemeral: true,
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorReply);
        } else {
          await interaction.reply(errorReply);
        }
      }
    } else if (interaction.isButton()) {
      // ===================== ROLE PANEL BUTTONS =====================
      if (interaction.customId.startsWith('rolepanel:')) {
        try {
          const parts = interaction.customId.split(':');
          // Formato: rolepanel:panelId:roleId
          if (parts.length < 3) return;
          const roleId = parts[2];
          const member = interaction.guild?.members.cache.get(interaction.user.id) || await interaction.guild?.members.fetch(interaction.user.id);
          
          if (!member) {
            await interaction.reply({ content: 'Não foi possível encontrar o membro.', ephemeral: true });
            return;
          }

          const role = interaction.guild?.roles.cache.get(roleId);
          if (!role) {
            await interaction.reply({ content: 'Este cargo não existe mais no servidor.', ephemeral: true });
            return;
          }

          if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId);
            await interaction.reply({ content: `O cargo **${role.name}** foi removido de você.`, ephemeral: true });
          } else {
            await member.roles.add(roleId);
            await interaction.reply({ content: `O cargo **${role.name}** foi adicionado a você.`, ephemeral: true });
          }
        } catch (error) {
          logger.error('Erro ao interagir com botão do painel de roles:', error);
          await interaction.reply({ content: 'Não foi possível gerenciar este cargo (provavelmente por causa da hierarquia de cargos ou permissões).', ephemeral: true });
        }
      }

      // ===================== TICKET OPEN BUTTON =====================
      else if (interaction.customId.startsWith('ticket_open:')) {
        try {
          const panelId = parseInt(interaction.customId.split(':')[1], 10);
          if (isNaN(panelId)) return;

          const guildId = interaction.guildId!;
          const userId = interaction.user.id;

          // Verifica se o usuário já tem um ticket aberto
          const activeTicket = await ticketsRepo.getActiveTicket(guildId, userId);
          if (activeTicket) {
            await interaction.reply({
              content: `❌ Você já possui um ticket aberto: <#${activeTicket.thread_id}>.\nPor favor, utilize o ticket existente ou aguarde seu encerramento.`,
              ephemeral: true,
            });
            return;
          }

          // Busca o painel no banco para saber o canal de destino
          const panel = await ticketsRepo.getPanel(panelId);
          if (!panel) {
            await interaction.reply({
              content: '❌ Painel de tickets não encontrado.',
              ephemeral: true,
            });
            return;
          }

          // Busca o canal de destino dos tópicos
          const targetChannel = interaction.guild!.channels.cache.get(panel.target_channel_id) as TextChannel | undefined;
          if (!targetChannel) {
            await interaction.reply({
              content: '❌ O canal de tickets configurado não foi encontrado. Contate um administrador.',
              ephemeral: true,
            });
            return;
          }

          // Cria um tópico privado no canal de destino
          const threadName = `🎫│${interaction.user.username}`;
          const thread = await targetChannel.threads.create({
            name: threadName,
            type: ChannelType.PrivateThread,
            reason: `Ticket aberto por ${interaction.user.tag}`,
          });

          // Adiciona o autor do ticket à thread
          await thread.members.add(userId);

          // Registra no banco de dados
          const ticket = await ticketsRepo.openTicket(guildId, userId, thread.id, panelId);
          if (!ticket) {
            await thread.delete().catch(() => {});
            await interaction.reply({
              content: '❌ Não foi possível registrar o ticket. Tente novamente.',
              ephemeral: true,
            });
            return;
          }

          // Envia a mensagem inicial na thread
          const welcomeEmbed = new EmbedBuilder()
            .setColor(Colors.INFO)
            .setTitle('🎫 Ticket Aberto')
            .setDescription(
              `Olá ${interaction.user}, bem-vindo ao seu ticket!\n\n` +
              `Descreva seu problema ou solicitação aqui. Um membro da equipe irá atendê-lo em breve.\n\n` +
              `📌 **Ticket ID:** \`#${ticket.id}\``,
            )
            .setFooter({ text: 'Clique no botão abaixo para encerrar o ticket quando finalizado.' })
            .setTimestamp();

          const closeButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`ticket_close:${thread.id}`)
              .setLabel('🔒 Fechar Ticket')
              .setStyle(ButtonStyle.Danger),
          );

          await thread.send({ embeds: [welcomeEmbed], components: [closeButton] });

          // Responde ao usuário que clicou no botão
          await interaction.reply({
            content: `✅ Seu ticket foi criado com sucesso: ${thread}`,
            ephemeral: true,
          });
        } catch (error) {
          logger.error('Erro ao abrir ticket:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '❌ Ocorreu um erro ao abrir o ticket. Tente novamente mais tarde.',
              ephemeral: true,
            });
          }
        }
      }

      // ===================== TICKET CLOSE BUTTON =====================
      else if (interaction.customId.startsWith('ticket_close:')) {
        try {
          const threadId = interaction.customId.split(':')[1];
          const guildId = interaction.guildId!;

          // Busca o ticket pelo thread_id
          const ticket = await ticketsRepo.getTicketByThread(threadId);
          if (!ticket || ticket.guild_id !== guildId) {
            await interaction.reply({
              content: '❌ Ticket não encontrado.',
              ephemeral: true,
            });
            return;
          }

          if (ticket.status === 'closed') {
            await interaction.reply({
              content: '❌ Este ticket já foi encerrado.',
              ephemeral: true,
            });
            return;
          }

          // Fecha o ticket no banco
          await ticketsRepo.closeTicket(threadId, interaction.user.id);

          // Envia a mensagem de encerramento
          const closeEmbed = new EmbedBuilder()
            .setColor(Colors.MODERATION)
            .setTitle('🔒 Ticket Encerrado')
            .setDescription(
              `Este ticket foi encerrado por ${interaction.user}.\n` +
              `O tópico será arquivado e trancado.`,
            )
            .setTimestamp();

          await interaction.reply({ embeds: [closeEmbed] });

          // Arquiva e tranca a thread
          const channel = interaction.channel;
          if (channel && channel.isThread()) {
            await channel.setLocked(true).catch(() => {});
            await channel.setArchived(true).catch(() => {});
          }
        } catch (error) {
          logger.error('Erro ao fechar ticket via botão:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '❌ Ocorreu um erro ao fechar o ticket.',
              ephemeral: true,
            });
          }
        }
      }
    }
  },
};

