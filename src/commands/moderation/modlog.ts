import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { checkPermissions } from '../../utils/permissions';
import { errorEmbed, infoEmbed, Colors } from '../../utils/embeds';
import { modActionsRepo } from '../../database/repositories/modActions';
import { discordTimestamp } from '../../utils/duration';
import { logger } from '../../utils/logger';

const ACTION_EMOJIS: Record<string, string> = {
  ban: '🔨', kick: '👢', timeout: '⏳', warn: '⚠️',
  unban: '🔓', softban: '🧹', mute: '🔇', unmute: '🔊', untimeout: '⏱️',
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('modlog')
    .setDescription('Consulta o histórico de ações de moderação')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
      sub
        .setName('user')
        .setDescription('Lista ações aplicadas a um usuário')
        .addStringOption(opt =>
          opt
            .setName('user_id')
            .setDescription('ID do usuário (funciona com contas deletadas)')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('case')
        .setDescription('Exibe os detalhes de uma ação específica')
        .addIntegerOption(opt =>
          opt
            .setName('id')
            .setDescription('ID da ação (case number)')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('recent')
        .setDescription('Lista as ações mais recentes do servidor')
        .addIntegerOption(opt =>
          opt
            .setName('quantidade')
            .setDescription('Quantidade (padrão: 10, máx: 25)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(25),
        )
        .addStringOption(opt =>
          opt
            .setName('tipo')
            .setDescription('Filtrar por tipo de ação')
            .setRequired(false)
            .addChoices(
              { name: 'Ban', value: 'ban' },
              { name: 'Kick', value: 'kick' },
              { name: 'Timeout', value: 'timeout' },
              { name: 'Warn', value: 'warn' },
              { name: 'Unban', value: 'unban' },
              { name: 'Softban', value: 'softban' },
              { name: 'Mute', value: 'mute' },
              { name: 'Unmute', value: 'unmute' },
            ),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: TorquemadaClient) {
    if (!interaction.guild) return;

    const subcommand = interaction.options.getSubcommand();
    logger.command(`modlog ${subcommand}`, interaction.user.id, interaction.guild.id);

    if (!(await checkPermissions(interaction, [PermissionFlagsBits.ManageMessages]))) return;

    const guildId = interaction.guild.id;

    switch (subcommand) {
      case 'user':
        return handleUser(interaction, guildId);
      case 'case':
        return handleCase(interaction, guildId);
      case 'recent':
        return handleRecent(interaction, guildId);
    }
  },
};

async function handleUser(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const userId = interaction.options.getString('user_id', true).trim();

  if (!/^\d+$/.test(userId)) {
    await interaction.reply({
      embeds: [errorEmbed('ID Inválido', 'Forneça um ID de usuário válido.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  const actions = await modActionsRepo.getByUser(guildId, userId);

  if (actions.length === 0) {
    await interaction.editReply({
      embeds: [infoEmbed(`📋 Histórico de \`${userId}\``, 'Nenhuma ação de moderação encontrada para este usuário.')],
    });
    return;
  }

  const lines = actions.slice(0, 25).map(a => {
    const emoji = ACTION_EMOJIS[a.action_type] ?? '📋';
    const date = discordTimestamp(new Date(a.created_at), 'R');
    const duration = a.duration ? ` (${a.duration})` : '';
    return `${emoji} **#${a.id}** — \`${a.action_type}\`${duration}\n> ${a.reason ?? 'Sem motivo'} • Mod: <@${a.moderator_id}> • ${date}`;
  });

  const description = lines.join('\n\n');
  const truncated = description.length > 4000 ? description.substring(0, 3997) + '...' : description;

  const embed = new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTitle(`📋 Histórico de Moderação — \`${userId}\``)
    .setDescription(truncated)
    .setFooter({ text: `Total: ${actions.length} ação(ões)` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleCase(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const caseId = interaction.options.getInteger('id', true);

  await interaction.deferReply();

  const action = await modActionsRepo.getById(caseId, guildId);

  if (!action) {
    await interaction.editReply({
      embeds: [errorEmbed('Não Encontrado', `Ação **#${caseId}** não encontrada neste servidor.`)],
    });
    return;
  }

  const emoji = ACTION_EMOJIS[action.action_type] ?? '📋';
  const date = discordTimestamp(new Date(action.created_at), 'f');

  const embed = new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTitle(`${emoji} Case #${action.id} — ${action.action_type.toUpperCase()}`)
    .addFields(
      { name: '👤 Usuário', value: `<@${action.user_id}> (\`${action.user_id}\`)`, inline: true },
      { name: '🛡️ Moderador', value: `<@${action.moderator_id}>`, inline: true },
      { name: '📝 Motivo', value: action.reason ?? 'Sem motivo informado', inline: false },
      { name: '📅 Data', value: date, inline: true },
    )
    .setFooter({ text: `Case #${action.id}` })
    .setTimestamp();

  if (action.duration) {
    embed.addFields({ name: '⏱️ Duração', value: action.duration, inline: true });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleRecent(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const amount = interaction.options.getInteger('quantidade') ?? 10;
  const actionType = interaction.options.getString('tipo') ?? undefined;

  await interaction.deferReply();

  const actions = await modActionsRepo.getRecent(guildId, amount, actionType);

  if (actions.length === 0) {
    await interaction.editReply({
      embeds: [infoEmbed('📋 Ações Recentes', 'Nenhuma ação de moderação encontrada.')],
    });
    return;
  }

  const lines = actions.map(a => {
    const emoji = ACTION_EMOJIS[a.action_type] ?? '📋';
    const date = discordTimestamp(new Date(a.created_at), 'R');
    return `${emoji} **#${a.id}** \`${a.action_type}\` — <@${a.user_id}> por <@${a.moderator_id}> ${date}`;
  });

  const typeFilter = actionType ? ` (filtro: \`${actionType}\`)` : '';

  const embed = new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTitle(`📋 Ações Recentes${typeFilter}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Exibindo ${actions.length} ação(ões)` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export default command;
