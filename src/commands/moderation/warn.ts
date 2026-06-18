import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { checkPermissions } from '../../utils/permissions';
import { errorEmbed, successEmbed, moderationEmbed, infoEmbed } from '../../utils/embeds';
import { logger } from '../../utils/logger';
import { discordTimestamp } from '../../utils/duration';
import {
  addWarning,
  getWarnings,
  getWarningCount,
  clearWarnings,
  deleteWarning,
} from '../../database/repositories/warnings';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Gerencia avisos de usuários')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Adiciona um aviso a um usuário')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('Usuário para avisar')
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('motivo')
            .setDescription('Motivo do aviso')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Lista os avisos de um usuário')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('Usuário para consultar')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('clear')
        .setDescription('Remove todos os avisos de um usuário')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('Usuário para limpar os avisos')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove um aviso específico pelo ID')
        .addIntegerOption(opt =>
          opt
            .setName('id')
            .setDescription('ID do aviso para remover')
            .setRequired(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction, client: TorquemadaClient) {
    if (!interaction.guild) return;

    const subcommand = interaction.options.getSubcommand();

    logger.command(`warn ${subcommand}`, interaction.user.id, interaction.guild.id);

    // Permission check
    if (!(await checkPermissions(interaction, [PermissionFlagsBits.ManageMessages]))) return;

    const guildId = interaction.guild.id;

    switch (subcommand) {
      case 'add': {
        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('motivo', true);

        await interaction.deferReply();

        const warning = await addWarning(guildId, targetUser.id, interaction.user.id, reason);

        if (!warning) {
          await interaction.editReply({
            embeds: [errorEmbed('Erro', 'Não foi possível salvar o aviso no banco de dados.')],
          });
          return;
        }

        const count = await getWarningCount(guildId, targetUser.id);

        const embed = moderationEmbed(
          'Aviso Adicionado',
          [
            `**Usuário:** ${targetUser} (\`${targetUser.id}\`)`,
            `**Moderador:** ${interaction.user}`,
            `**Motivo:** ${reason}`,
            `**ID do aviso:** #${warning.id}`,
            `**Total de avisos:** ${count}`,
          ].join('\n'),
        );

        await interaction.editReply({ embeds: [embed] });

        logger.success(`Warn: ${targetUser.tag} (${targetUser.id}) — aviso #${warning.id} em ${interaction.guild.name}`);
        break;
      }

      case 'list': {
        const targetUser = interaction.options.getUser('user', true);

        await interaction.deferReply();

        const warnings = await getWarnings(guildId, targetUser.id);

        if (warnings.length === 0) {
          await interaction.editReply({
            embeds: [infoEmbed(`📋 Avisos de ${targetUser.tag}`, 'Este usuário não possui avisos.')],
          });
          return;
        }

        const warningList = warnings.map(w => {
          const date = discordTimestamp(new Date(w.created_at), 'f');
          return `**#${w.id}** — ${w.reason}\n> Moderador: <@${w.moderator_id}> | Data: ${date}`;
        });

        // Split into pages if too many warnings (embed limit)
        const description = warningList.join('\n\n');
        const truncated = description.length > 4000
          ? description.substring(0, 3997) + '...'
          : description;

        const embed = infoEmbed(
          `📋 Avisos de ${targetUser.tag}`,
          truncated,
        ).setFooter({ text: `Total: ${warnings.length} aviso(s)` });

        await interaction.editReply({ embeds: [embed] });
        break;
      }

      case 'clear': {
        const targetUser = interaction.options.getUser('user', true);

        await interaction.deferReply();

        const count = await clearWarnings(guildId, targetUser.id);

        if (count === 0) {
          await interaction.editReply({
            embeds: [infoEmbed('Sem Avisos', 'Este usuário não possuía avisos para remover.')],
          });
          return;
        }

        const embed = successEmbed(
          'Avisos Limpos',
          `**${count}** aviso(s) de ${targetUser} (\`${targetUser.id}\`) foram removidos.`,
        );

        await interaction.editReply({ embeds: [embed] });

        logger.success(`Warn clear: ${count} avisos removidos de ${targetUser.tag} (${targetUser.id}) em ${interaction.guild.name}`);
        break;
      }

      case 'remove': {
        const warningId = interaction.options.getInteger('id', true);

        await interaction.deferReply();

        const success = await deleteWarning(warningId);

        if (!success) {
          await interaction.editReply({
            embeds: [errorEmbed('Erro', `Não foi possível remover o aviso **#${warningId}**. Verifique se o ID está correto.`)],
          });
          return;
        }

        const embed = successEmbed(
          'Aviso Removido',
          `O aviso **#${warningId}** foi removido com sucesso.`,
        );

        await interaction.editReply({ embeds: [embed] });

        logger.success(`Warn remove: aviso #${warningId} removido em ${interaction.guild.name}`);
        break;
      }
    }
  },
};

export default command;
