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
import { rolePanelsRepo } from '../../database/repositories/rolePanels';
import { successEmbed, errorEmbed, infoEmbed } from '../../utils/embeds';
import { Colors } from '../../utils/embeds';
import { logger } from '../../utils/logger';
import { RolePanelButton } from '../../types/database';

// ===================== BUTTON BUILDING LOGIC =====================

const BUTTONS_PER_ROW = 5;
const MAX_ROWS = 5;
const MAX_ROLE_BUTTONS_NO_PAGINATION = 20; // 4 rows × 5 buttons (reserve nothing)
const MAX_ROLE_BUTTONS_WITH_PAGINATION = 20; // 4 rows × 5 buttons (row 5 = pagination)

const styleMap: Record<string, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

/**
 * Builds action rows for a role panel, with optional pagination.
 * - ≤20 buttons: no pagination, just role buttons
 * - >20 buttons: 20 role buttons per page + 1 pagination row
 */
export function buildRolePanelComponents(
  buttons: RolePanelButton[],
  panelId: number,
  page: number = 0,
): ActionRowBuilder<ButtonBuilder>[] {
  const needsPagination = buttons.length > MAX_ROLE_BUTTONS_NO_PAGINATION;
  const buttonsPerPage = needsPagination ? MAX_ROLE_BUTTONS_WITH_PAGINATION : MAX_ROLE_BUTTONS_NO_PAGINATION;
  const totalPages = needsPagination ? Math.ceil(buttons.length / buttonsPerPage) : 1;
  const currentPage = Math.max(0, Math.min(page, totalPages - 1));

  // Slice buttons for the current page
  const pageButtons = buttons.slice(
    currentPage * buttonsPerPage,
    (currentPage + 1) * buttonsPerPage,
  );

  // Build role button rows
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < pageButtons.length; i += BUTTONS_PER_ROW) {
    const rowButtons = pageButtons.slice(i, i + BUTTONS_PER_ROW);
    const row = new ActionRowBuilder<ButtonBuilder>();

    for (const btn of rowButtons) {
      const button = new ButtonBuilder()
        .setCustomId(`rolepanel:${panelId}:${btn.role_id}`)
        .setLabel(btn.label)
        .setStyle(styleMap[btn.style] ?? ButtonStyle.Primary);

      if (btn.emoji) {
        button.setEmoji(btn.emoji);
      }

      row.addComponents(button);
    }

    rows.push(row);
  }

  // Add pagination row if needed
  if (needsPagination) {
    const paginationRow = new ActionRowBuilder<ButtonBuilder>();

    paginationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`rolepanel_page:${panelId}:${currentPage - 1}`)
        .setLabel('◀ Anterior')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId(`rolepanel_page_info:${panelId}`)
        .setLabel(`Página ${currentPage + 1} de ${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`rolepanel_page:${panelId}:${currentPage + 1}`)
        .setLabel('Próximo ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages - 1),
    );

    rows.push(paginationRow);
  }

  return rows;
}

/**
 * Builds the embed for a role panel.
 */
function buildPanelEmbed(title: string, description: string | null): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTitle(title)
    .setDescription(description ?? 'Clique nos botões abaixo para obter ou remover cargos.')
    .setTimestamp();
}

// ===================== COMMAND =====================

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('rolepanel')
    .setDescription('Gerencia painéis de cargos com botões interativos')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Cria um novo painel de cargos em um canal')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Canal onde o painel será criado')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('title')
            .setDescription('Título do painel')
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('description')
            .setDescription('Descrição do painel (opcional)')
            .setRequired(false),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('addrole')
        .setDescription('Adiciona um botão de cargo ao painel')
        .addIntegerOption(opt =>
          opt
            .setName('panel')
            .setDescription('ID do painel')
            .setRequired(true),
        )
        .addRoleOption(opt =>
          opt
            .setName('role')
            .setDescription('Cargo a ser associado ao botão')
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('label')
            .setDescription('Texto do botão')
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('style')
            .setDescription('Estilo do botão')
            .setRequired(true)
            .addChoices(
              { name: 'Primário (Azul)', value: 'primary' },
              { name: 'Secundário (Cinza)', value: 'secondary' },
              { name: 'Sucesso (Verde)', value: 'success' },
              { name: 'Perigo (Vermelho)', value: 'danger' },
            ),
        )
        .addStringOption(opt =>
          opt
            .setName('emoji')
            .setDescription('Emoji do botão (opcional)')
            .setRequired(false),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('removerole')
        .setDescription('Remove um botão de cargo do painel')
        .addIntegerOption(opt =>
          opt
            .setName('panel')
            .setDescription('ID do painel')
            .setRequired(true),
        )
        .addRoleOption(opt =>
          opt
            .setName('role')
            .setDescription('Cargo do botão a ser removido')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('edit')
        .setDescription('Edita o embed do painel')
        .addIntegerOption(opt =>
          opt
            .setName('panel')
            .setDescription('ID do painel')
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('title')
            .setDescription('Novo título (opcional)')
            .setRequired(false),
        )
        .addStringOption(opt =>
          opt
            .setName('description')
            .setDescription('Nova descrição (opcional)')
            .setRequired(false),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('Deleta um painel de cargos')
        .addIntegerOption(opt =>
          opt
            .setName('panel')
            .setDescription('ID do painel')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Lista todos os painéis de cargos do servidor'),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: TorquemadaClient) {
    const guildId = interaction.guildId!;
    const subcommand = interaction.options.getSubcommand();
    logger.command(`rolepanel ${subcommand}`, interaction.user.id, guildId);

    switch (subcommand) {
      case 'create':
        return handleCreate(interaction, guildId);
      case 'addrole':
        return handleAddRole(interaction, guildId);
      case 'removerole':
        return handleRemoveRole(interaction, guildId);
      case 'edit':
        return handleEdit(interaction, guildId);
      case 'delete':
        return handleDelete(interaction, guildId);
      case 'list':
        return handleList(interaction, guildId);
    }
  },
};

// ===================== SUBCOMMAND HANDLERS =====================

async function handleCreate(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const channel = interaction.options.getChannel('channel', true) as TextChannel;
  const title = interaction.options.getString('title', true);
  const description = interaction.options.getString('description') ?? null;

  try {
    // Send the panel message to the target channel
    const embed = buildPanelEmbed(title, description);
    const message = await channel.send({ embeds: [embed] });

    // Save to database
    const panel = await rolePanelsRepo.createPanel(
      guildId,
      channel.id,
      message.id,
      title,
      description,
    );

    if (!panel) {
      await message.delete().catch(() => {});
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Não foi possível salvar o painel no banco de dados.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        successEmbed(
          'Painel Criado',
          `Painel criado com sucesso no canal ${channel}.\n**ID do Painel:** \`${panel.id}\`\n\nUse \`/rolepanel addrole\` para adicionar botões.`,
        ),
      ],
      ephemeral: true,
    });
  } catch (error) {
    logger.error('Erro ao criar painel:', error);
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Não foi possível criar o painel. Verifique as permissões do bot no canal.')],
      ephemeral: true,
    });
  }
}

async function handleAddRole(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const panelId = interaction.options.getInteger('panel', true);
  const role = interaction.options.getRole('role', true);
  const label = interaction.options.getString('label', true);
  const style = interaction.options.getString('style', true);
  const emoji = interaction.options.getString('emoji') ?? null;

  // Get the panel
  const panel = await rolePanelsRepo.getPanel(panelId);
  if (!panel || panel.guild_id !== guildId) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Painel não encontrado neste servidor.')],
      ephemeral: true,
    });
    return;
  }

  // Check if the role is already in the panel
  const existingButtons = await rolePanelsRepo.getButtons(panelId);
  if (existingButtons.some(b => b.role_id === role.id)) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', `O cargo ${role} já está no painel.`)],
      ephemeral: true,
    });
    return;
  }

  // Check max buttons (5 rows × 5 buttons = 25, but with pagination the limit per page is managed)
  // We allow up to 25 buttons without pagination concerns on the DB side
  const newPosition = existingButtons.length;

  try {
    // Add button to database
    const button = await rolePanelsRepo.addButton(panelId, role.id, label, emoji, style, newPosition);
    if (!button) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Não foi possível adicionar o botão ao banco de dados.')],
        ephemeral: true,
      });
      return;
    }

    // Rebuild and update the message
    const allButtons = await rolePanelsRepo.getButtons(panelId);
    const components = buildRolePanelComponents(allButtons, panelId, 0);
    const embed = buildPanelEmbed(panel.title, panel.description);

    const channel = interaction.guild!.channels.cache.get(panel.channel_id) as TextChannel | undefined;
    if (!channel) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Canal do painel não encontrado.')],
        ephemeral: true,
      });
      return;
    }

    const message = await channel.messages.fetch(panel.message_id).catch(() => null);
    if (!message) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Mensagem do painel não encontrada. O painel pode ter sido deletado manualmente.')],
        ephemeral: true,
      });
      return;
    }

    await message.edit({ embeds: [embed], components });

    await interaction.reply({
      embeds: [
        successEmbed(
          'Botão Adicionado',
          `O cargo ${role} foi adicionado ao painel \`#${panelId}\` com o botão "${label}".`,
        ),
      ],
      ephemeral: true,
    });
  } catch (error) {
    logger.error('Erro ao adicionar botão ao painel:', error);
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Ocorreu um erro ao adicionar o botão.')],
      ephemeral: true,
    });
  }
}

async function handleRemoveRole(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const panelId = interaction.options.getInteger('panel', true);
  const role = interaction.options.getRole('role', true);

  // Get the panel
  const panel = await rolePanelsRepo.getPanel(panelId);
  if (!panel || panel.guild_id !== guildId) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Painel não encontrado neste servidor.')],
      ephemeral: true,
    });
    return;
  }

  try {
    // Remove button from database
    const removed = await rolePanelsRepo.removeButton(panelId, role.id);
    if (!removed) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Não foi possível remover o botão.')],
        ephemeral: true,
      });
      return;
    }

    // Rebuild and update the message
    const allButtons = await rolePanelsRepo.getButtons(panelId);
    const components = buildRolePanelComponents(allButtons, panelId, 0);
    const embed = buildPanelEmbed(panel.title, panel.description);

    const channel = interaction.guild!.channels.cache.get(panel.channel_id) as TextChannel | undefined;
    if (channel) {
      const message = await channel.messages.fetch(panel.message_id).catch(() => null);
      if (message) {
        await message.edit({ embeds: [embed], components });
      }
    }

    await interaction.reply({
      embeds: [
        successEmbed(
          'Botão Removido',
          `O cargo ${role} foi removido do painel \`#${panelId}\`.`,
        ),
      ],
      ephemeral: true,
    });
  } catch (error) {
    logger.error('Erro ao remover botão do painel:', error);
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Ocorreu um erro ao remover o botão.')],
      ephemeral: true,
    });
  }
}

async function handleEdit(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const panelId = interaction.options.getInteger('panel', true);
  const newTitle = interaction.options.getString('title') ?? undefined;
  const newDescription = interaction.options.getString('description') ?? undefined;

  if (!newTitle && !newDescription) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Informe pelo menos um campo para editar (título ou descrição).')],
      ephemeral: true,
    });
    return;
  }

  // Get the panel
  const panel = await rolePanelsRepo.getPanel(panelId);
  if (!panel || panel.guild_id !== guildId) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Painel não encontrado neste servidor.')],
      ephemeral: true,
    });
    return;
  }

  try {
    const updates: { title?: string; description?: string } = {};
    if (newTitle) updates.title = newTitle;
    if (newDescription) updates.description = newDescription;

    const updatedPanel = await rolePanelsRepo.updatePanel(panelId, updates);
    if (!updatedPanel) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Não foi possível atualizar o painel.')],
        ephemeral: true,
      });
      return;
    }

    // Update the message embed
    const channel = interaction.guild!.channels.cache.get(panel.channel_id) as TextChannel | undefined;
    if (channel) {
      const message = await channel.messages.fetch(panel.message_id).catch(() => null);
      if (message) {
        const allButtons = await rolePanelsRepo.getButtons(panelId);
        const components = buildRolePanelComponents(allButtons, panelId, 0);
        const embed = buildPanelEmbed(updatedPanel.title, updatedPanel.description);
        await message.edit({ embeds: [embed], components });
      }
    }

    await interaction.reply({
      embeds: [
        successEmbed(
          'Painel Editado',
          `O painel \`#${panelId}\` foi atualizado com sucesso.`,
        ),
      ],
      ephemeral: true,
    });
  } catch (error) {
    logger.error('Erro ao editar painel:', error);
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Ocorreu um erro ao editar o painel.')],
      ephemeral: true,
    });
  }
}

async function handleDelete(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const panelId = interaction.options.getInteger('panel', true);

  // Get the panel
  const panel = await rolePanelsRepo.getPanel(panelId);
  if (!panel || panel.guild_id !== guildId) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Painel não encontrado neste servidor.')],
      ephemeral: true,
    });
    return;
  }

  try {
    // Try to delete the message from the channel
    const channel = interaction.guild!.channels.cache.get(panel.channel_id) as TextChannel | undefined;
    if (channel) {
      const message = await channel.messages.fetch(panel.message_id).catch(() => null);
      if (message) {
        await message.delete().catch(() => {});
      }
    }

    // Delete from database (buttons cascade)
    const deleted = await rolePanelsRepo.deletePanel(panelId);
    if (!deleted) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Não foi possível deletar o painel do banco de dados.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        successEmbed(
          'Painel Deletado',
          `O painel \`#${panelId}\` foi deletado com sucesso.`,
        ),
      ],
      ephemeral: true,
    });
  } catch (error) {
    logger.error('Erro ao deletar painel:', error);
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Ocorreu um erro ao deletar o painel.')],
      ephemeral: true,
    });
  }
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  try {
    const panels = await rolePanelsRepo.getPanelsByGuild(guildId);

    if (panels.length === 0) {
      await interaction.reply({
        embeds: [infoEmbed('Painéis de Cargos', 'Nenhum painel de cargos encontrado neste servidor.')],
        ephemeral: true,
      });
      return;
    }

    // Get button counts for each panel
    const panelLines: string[] = [];
    for (const panel of panels) {
      const buttonCount = await rolePanelsRepo.getButtonCount(panel.id);
      panelLines.push(
        `**#${panel.id}** — ${panel.title}\n` +
        `  📍 Canal: <#${panel.channel_id}>\n` +
        `  🔘 Botões: ${buttonCount}`,
      );
    }

    await interaction.reply({
      embeds: [
        infoEmbed(
          `Painéis de Cargos (${panels.length})`,
          panelLines.join('\n\n'),
        ),
      ],
      ephemeral: true,
    });
  } catch (error) {
    logger.error('Erro ao listar painéis:', error);
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Ocorreu um erro ao listar os painéis.')],
      ephemeral: true,
    });
  }
}

export default command;
