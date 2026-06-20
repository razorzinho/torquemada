import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { ticketsRepo } from '../../database/repositories/tickets';
import { successEmbed, errorEmbed, infoEmbed, Colors } from '../../utils/embeds';
import { logger } from '../../utils/logger';

const styleMap: Record<string, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

/**
 * Constrói o embed do painel de tickets.
 */
function buildTicketPanelEmbed(title: string, description: string | null): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTitle(`🎫 ${title}`)
    .setDescription(description ?? 'Clique no botão abaixo para abrir um ticket de suporte.')
    .setFooter({ text: 'Apenas um ticket ativo por vez é permitido.' })
    .setTimestamp();
}

/**
 * Constrói o botão de abertura de ticket.
 */
function buildTicketButton(
  panelId: number,
  label: string,
  style: string,
  emoji: string | null,
): ActionRowBuilder<ButtonBuilder> {
  const button = new ButtonBuilder()
    .setCustomId(`ticket_open:${panelId}`)
    .setLabel(label)
    .setStyle(styleMap[style] ?? ButtonStyle.Primary);

  if (emoji) {
    button.setEmoji(emoji);
  }

  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Gerencia o sistema de tickets do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('setup')
        .setDescription('Cria um painel de tickets fixado em um canal')
        .addChannelOption(opt =>
          opt
            .setName('panel_channel')
            .setDescription('Canal onde o painel (embed com botão) será exibido')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addChannelOption(opt =>
          opt
            .setName('ticket_channel')
            .setDescription('Canal onde os tópicos de tickets serão criados')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('title')
            .setDescription('Título do embed do painel')
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('description')
            .setDescription('Descrição do embed do painel (opcional)')
            .setRequired(false),
        )
        .addStringOption(opt =>
          opt
            .setName('button_label')
            .setDescription('Texto do botão de abertura (padrão: 🎫 Abrir Ticket)')
            .setRequired(false),
        )
        .addStringOption(opt =>
          opt
            .setName('button_style')
            .setDescription('Estilo do botão')
            .setRequired(false)
            .addChoices(
              { name: 'Primário (Azul)', value: 'primary' },
              { name: 'Secundário (Cinza)', value: 'secondary' },
              { name: 'Sucesso (Verde)', value: 'success' },
              { name: 'Perigo (Vermelho)', value: 'danger' },
            ),
        )
        .addStringOption(opt =>
          opt
            .setName('button_emoji')
            .setDescription('Emoji do botão (opcional)')
            .setRequired(false),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('close')
        .setDescription('Fecha o ticket atual (deve ser usado dentro de um tópico de ticket)'),
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('Remove um painel de tickets do servidor')
        .addIntegerOption(opt =>
          opt
            .setName('panel')
            .setDescription('ID do painel a ser removido')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Lista todos os painéis de tickets do servidor'),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: TorquemadaClient) {
    const guildId = interaction.guildId!;
    const subcommand = interaction.options.getSubcommand();
    logger.command(`ticket ${subcommand}`, interaction.user.id, guildId);

    switch (subcommand) {
      case 'setup':
        return handleSetup(interaction, guildId);
      case 'close':
        return handleClose(interaction, guildId);
      case 'delete':
        return handleDelete(interaction, guildId);
      case 'list':
        return handleList(interaction, guildId);
    }
  },
};

// ===================== SUBCOMMAND HANDLERS =====================

async function handleSetup(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const panelChannel = interaction.options.getChannel('panel_channel', true) as TextChannel;
  const ticketChannel = interaction.options.getChannel('ticket_channel', true) as TextChannel;
  const title = interaction.options.getString('title', true);
  const description = interaction.options.getString('description') ?? null;
  const buttonLabel = interaction.options.getString('button_label') ?? '🎫 Abrir Ticket';
  const buttonStyle = interaction.options.getString('button_style') ?? 'primary';
  const buttonEmoji = interaction.options.getString('button_emoji') ?? null;

  try {
    // Envia a mensagem do painel no canal especificado
    const embed = buildTicketPanelEmbed(title, description);

    // O panelId será obtido após a inserção no banco, então usamos um placeholder temporário
    // e depois atualizamos a mensagem com o componente correto.
    const panelMessage = await panelChannel.send({ embeds: [embed] });

    // Salva no banco de dados
    const panel = await ticketsRepo.createPanel(
      guildId,
      panelChannel.id,
      panelMessage.id,
      ticketChannel.id,
      title,
      description,
      buttonLabel,
      buttonStyle,
      buttonEmoji,
    );

    if (!panel) {
      await panelMessage.delete().catch(() => {});
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Não foi possível salvar o painel de tickets no banco de dados.')],
        ephemeral: true,
      });
      return;
    }

    // Agora que temos o panelId, edita a mensagem para adicionar o botão correto
    const row = buildTicketButton(panel.id, buttonLabel, buttonStyle, buttonEmoji);
    await panelMessage.edit({ embeds: [embed], components: [row] });

    await interaction.reply({
      embeds: [
        successEmbed(
          'Painel de Tickets Criado',
          `Painel enviado em ${panelChannel} com sucesso.\n` +
          `📌 **ID do Painel:** \`${panel.id}\`\n` +
          `📂 **Canal de Tópicos:** ${ticketChannel}\n\n` +
          `Membros poderão clicar no botão para abrir tickets.`,
        ),
      ],
      ephemeral: true,
    });
  } catch (error) {
    logger.error('Erro ao criar painel de tickets:', error);
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Não foi possível criar o painel de tickets. Verifique as permissões do bot no canal.')],
      ephemeral: true,
    });
  }
}

async function handleClose(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const channel = interaction.channel;

  // Verifica se o comando foi executado dentro de um tópico (thread)
  if (!channel || !channel.isThread()) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Este comando deve ser usado dentro de um tópico de ticket.')],
      ephemeral: true,
    });
    return;
  }

  const threadId = channel.id;

  // Busca o ticket pelo thread_id
  const ticket = await ticketsRepo.getTicketByThread(threadId);
  if (!ticket || ticket.guild_id !== guildId) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Este tópico não está associado a nenhum ticket.')],
      ephemeral: true,
    });
    return;
  }

  if (ticket.status === 'closed') {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Este ticket já foi encerrado.')],
      ephemeral: true,
    });
    return;
  }

  try {
    // Fecha o ticket no banco
    await ticketsRepo.closeTicket(threadId, interaction.user.id);

    // Envia mensagem de encerramento na thread
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
    await channel.setLocked(true).catch(() => {});
    await channel.setArchived(true).catch(() => {});
  } catch (error) {
    logger.error('Erro ao fechar ticket:', error);
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Ocorreu um erro ao fechar o ticket.')],
      ephemeral: true,
    });
  }
}

async function handleDelete(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const panelId = interaction.options.getInteger('panel', true);

  const panel = await ticketsRepo.getPanel(panelId);
  if (!panel || panel.guild_id !== guildId) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Painel de tickets não encontrado neste servidor.')],
      ephemeral: true,
    });
    return;
  }

  try {
    // Tenta deletar a mensagem do painel do canal
    const channel = interaction.guild!.channels.cache.get(panel.panel_channel_id) as TextChannel | undefined;
    if (channel) {
      const message = await channel.messages.fetch(panel.panel_message_id).catch(() => null);
      if (message) {
        await message.delete().catch(() => {});
      }
    }

    // Deleta do banco de dados
    const deleted = await ticketsRepo.deletePanel(panelId);
    if (!deleted) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Não foi possível deletar o painel de tickets do banco de dados.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        successEmbed(
          'Painel de Tickets Removido',
          `O painel de tickets \`#${panelId}\` foi removido com sucesso.`,
        ),
      ],
      ephemeral: true,
    });
  } catch (error) {
    logger.error('Erro ao deletar painel de tickets:', error);
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Ocorreu um erro ao deletar o painel de tickets.')],
      ephemeral: true,
    });
  }
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  try {
    const panels = await ticketsRepo.getPanelsByGuild(guildId);

    if (panels.length === 0) {
      await interaction.reply({
        embeds: [infoEmbed('Painéis de Tickets', 'Nenhum painel de tickets encontrado neste servidor.')],
        ephemeral: true,
      });
      return;
    }

    const lines: string[] = [];
    for (const panel of panels) {
      const openTickets = await ticketsRepo.getTicketsByGuild(guildId, 'open');
      const panelOpenCount = openTickets.filter(t => t.panel_id === panel.id).length;
      lines.push(
        `**#${panel.id}** — ${panel.title}\n` +
        `  📍 Painel em: <#${panel.panel_channel_id}>\n` +
        `  📂 Tópicos em: <#${panel.target_channel_id}>\n` +
        `  🎫 Tickets abertos: ${panelOpenCount}`,
      );
    }

    await interaction.reply({
      embeds: [
        infoEmbed(
          `Painéis de Tickets (${panels.length})`,
          lines.join('\n\n'),
        ),
      ],
      ephemeral: true,
    });
  } catch (error) {
    logger.error('Erro ao listar painéis de tickets:', error);
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Ocorreu um erro ao listar os painéis de tickets.')],
      ephemeral: true,
    });
  }
}

export default command;
