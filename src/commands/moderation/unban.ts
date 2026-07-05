import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { checkPermissions, checkBotPermissions } from '../../utils/permissions';
import { errorEmbed, moderationEmbed } from '../../utils/embeds';
import { modAction } from '../../utils/modAction';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Desbane um usuário do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(opt =>
      opt
        .setName('user_id')
        .setDescription('ID do usuário para desbanir')
        .setRequired(true),
    )
    .addStringOption(opt =>
      opt
        .setName('motivo')
        .setDescription('Motivo do desbanimento')
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction, client: TorquemadaClient) {
    if (!interaction.guild) return;

    logger.command('unban', interaction.user.id, interaction.guild.id);

    if (!(await checkPermissions(interaction, [PermissionFlagsBits.BanMembers]))) return;
    if (!(await checkBotPermissions(interaction, [PermissionFlagsBits.BanMembers]))) return;

    const userIdInput = interaction.options.getString('user_id', true).trim();
    const reason = interaction.options.getString('motivo') ?? 'Sem motivo informado';

    const idMatch = userIdInput.match(/^(\d+)$/);
    if (!idMatch) {
      await interaction.reply({
        embeds: [errorEmbed('ID Inválido', 'Forneça um ID de usuário válido (somente números).')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const userId = idMatch[1];
    await interaction.deferReply();

    try {
      // Verificar se o usuário está banido
      try {
        await interaction.guild.bans.fetch(userId);
      } catch {
        await interaction.editReply({
          embeds: [errorEmbed('Não Banido', 'Este usuário não está na lista de bans do servidor.')],
        });
        return;
      }

      // Fetch user info
      let userTag = userId;
      let targetUser = null;
      try {
        targetUser = await client.users.fetch(userId);
        userTag = targetUser.tag;
      } catch {
        // Usuário desconhecido
      }

      // Executar unban
      await interaction.guild.bans.remove(userId, `${reason} | Por: ${interaction.user.tag}`);

      // Registrar ação (DM não é enviada no unban — o usuário não está no servidor)
      if (targetUser) {
        await modAction({
          guild: interaction.guild,
          target: targetUser,
          moderator: interaction.user,
          actionType: 'unban',
          reason,
          client,
          skipDm: true,
        });
      }

      const embed = moderationEmbed(
        'Usuário Desbanido',
        [
          `**Usuário:** ${userTag} (\`${userId}\`)`,
          `**Moderador:** ${interaction.user}`,
          `**Motivo:** ${reason}`,
        ].join('\n'),
      );

      await interaction.editReply({ embeds: [embed] });
      logger.success(`Unban: ${userTag} (${userId}) desbanido de ${interaction.guild.name}`);
    } catch (error: any) {
      logger.error('Erro no comando unban:', error);
      await interaction.editReply({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao tentar desbanir o usuário.')],
      });
    }
  },
};

export default command;
