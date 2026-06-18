import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  GuildMember,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { checkPermissions, checkBotPermissions, canModerate } from '../../utils/permissions';
import { errorEmbed, moderationEmbed } from '../../utils/embeds';
import { logger } from '../../utils/logger';
import { parseDuration, formatDuration } from '../../utils/duration';

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // 28 days in milliseconds

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Gerencia o timeout de um usuário')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Aplica timeout em um usuário')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('Usuário para aplicar timeout')
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('duração')
            .setDescription('Duração do timeout (ex: 10m, 1h, 7d, 1d12h)')
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('motivo')
            .setDescription('Motivo do timeout')
            .setRequired(false),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove o timeout de um usuário')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('Usuário para remover o timeout')
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('motivo')
            .setDescription('Motivo da remoção do timeout')
            .setRequired(false),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction, client: TorquemadaClient) {
    if (!interaction.guild) return;

    const subcommand = interaction.options.getSubcommand();

    logger.command(`timeout ${subcommand}`, interaction.user.id, interaction.guild.id);

    // Permission checks
    if (!(await checkPermissions(interaction, [PermissionFlagsBits.ModerateMembers]))) return;
    if (!(await checkBotPermissions(interaction, [PermissionFlagsBits.ModerateMembers]))) return;

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('motivo') ?? 'Sem motivo informado';

    // Cannot timeout yourself
    if (targetUser.id === interaction.user.id) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Você não pode aplicar timeout em si mesmo.')],
        ephemeral: true,
      });
      return;
    }

    // Cannot timeout the bot
    if (targetUser.id === client.user?.id) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Eu não posso aplicar timeout em mim mesmo.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const targetMember = await interaction.guild.members.fetch(targetUser.id);
      const moderator = interaction.member as GuildMember;

      // Check hierarchy
      if (!canModerate(moderator, targetMember)) {
        await interaction.editReply({
          embeds: [errorEmbed('Hierarquia', 'Você não pode moderar alguém com cargo igual ou superior ao seu.')],
        });
        return;
      }

      const botMember = interaction.guild.members.me!;
      if (!canModerate(botMember, targetMember)) {
        await interaction.editReply({
          embeds: [errorEmbed('Hierarquia', 'Eu não posso moderar alguém com cargo igual ou superior ao meu.')],
        });
        return;
      }

      if (!targetMember.moderatable) {
        await interaction.editReply({
          embeds: [errorEmbed('Erro', 'Não é possível aplicar timeout neste usuário.')],
        });
        return;
      }

      if (subcommand === 'set') {
        const durationInput = interaction.options.getString('duração', true);
        const durationMs = parseDuration(durationInput);

        if (!durationMs) {
          await interaction.editReply({
            embeds: [errorEmbed('Duração Inválida', 'Use formatos como: `10s`, `5m`, `2h`, `1d`, `1w`, `1d12h`')],
          });
          return;
        }

        if (durationMs > MAX_TIMEOUT_MS) {
          await interaction.editReply({
            embeds: [errorEmbed('Duração Excedida', `O timeout máximo do Discord é de **28 dias**. Você informou: **${formatDuration(durationMs)}**`)],
          });
          return;
        }

        // Apply timeout
        await targetMember.timeout(durationMs, `${reason} | Por: ${interaction.user.tag}`);

        const embed = moderationEmbed(
          'Timeout Aplicado',
          [
            `**Usuário:** ${targetUser.tag} (\`${targetUser.id}\`)`,
            `**Moderador:** ${interaction.user}`,
            `**Duração:** ${formatDuration(durationMs)}`,
            `**Motivo:** ${reason}`,
          ].join('\n'),
        );

        await interaction.editReply({ embeds: [embed] });

        logger.success(
          `Timeout: ${targetUser.tag} (${targetUser.id}) — ${formatDuration(durationMs)} em ${interaction.guild.name}`,
        );
      } else {
        // Remove timeout
        await targetMember.timeout(null, `${reason} | Por: ${interaction.user.tag}`);

        const embed = moderationEmbed(
          'Timeout Removido',
          [
            `**Usuário:** ${targetUser.tag} (\`${targetUser.id}\`)`,
            `**Moderador:** ${interaction.user}`,
            `**Motivo:** ${reason}`,
          ].join('\n'),
        );

        await interaction.editReply({ embeds: [embed] });

        logger.success(
          `Untimeout: ${targetUser.tag} (${targetUser.id}) em ${interaction.guild.name}`,
        );
      }
    } catch (error: any) {
      logger.error('Erro no comando timeout:', error);

      if (error?.code === 10007) {
        await interaction.editReply({
          embeds: [errorEmbed('Erro', 'Usuário não encontrado no servidor.')],
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Erro', 'Ocorreu um erro ao tentar aplicar/remover o timeout.')],
        });
      }
    }
  },
};

export default command;
