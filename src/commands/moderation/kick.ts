import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  GuildMember,
  MessageFlags,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { checkPermissions, checkBotPermissions, canModerate } from '../../utils/permissions';
import { errorEmbed, moderationEmbed } from '../../utils/embeds';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa um usuário do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('Usuário para expulsar')
        .setRequired(true),
    )
    .addStringOption(opt =>
      opt
        .setName('motivo')
        .setDescription('Motivo da expulsão')
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction, client: TorquemadaClient) {
    if (!interaction.guild) return;

    logger.command('kick', interaction.user.id, interaction.guild.id);

    // Permission checks
    if (!(await checkPermissions(interaction, [PermissionFlagsBits.KickMembers]))) return;
    if (!(await checkBotPermissions(interaction, [PermissionFlagsBits.KickMembers]))) return;

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('motivo') ?? 'Sem motivo informado';

    // Cannot kick yourself
    if (targetUser.id === interaction.user.id) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Você não pode se expulsar.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Cannot kick the bot
    if (targetUser.id === client.user?.id) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Eu não posso me expulsar.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    try {
      // Get target member
      const targetMember = await interaction.guild.members.fetch(targetUser.id);
      const moderator = interaction.member as GuildMember;

      // Check hierarchy
      if (!canModerate(moderator, targetMember)) {
        await interaction.editReply({
          embeds: [errorEmbed('Hierarquia', 'Você não pode expulsar alguém com cargo igual ou superior ao seu.')],
        });
        return;
      }

      const botMember = interaction.guild.members.me!;
      if (!canModerate(botMember, targetMember)) {
        await interaction.editReply({
          embeds: [errorEmbed('Hierarquia', 'Eu não posso expulsar alguém com cargo igual ou superior ao meu.')],
        });
        return;
      }

      if (!targetMember.kickable) {
        await interaction.editReply({
          embeds: [errorEmbed('Erro', 'Não é possível expulsar este usuário.')],
        });
        return;
      }

      // Execute kick
      await targetMember.kick(`${reason} | Por: ${interaction.user.tag}`);

      const embed = moderationEmbed(
        'Usuário Expulso',
        [
          `**Usuário:** ${targetUser.tag} (\`${targetUser.id}\`)`,
          `**Moderador:** ${interaction.user}`,
          `**Motivo:** ${reason}`,
        ].join('\n'),
      );

      await interaction.editReply({ embeds: [embed] });

      logger.success(`Kick: ${targetUser.tag} (${targetUser.id}) expulso de ${interaction.guild.name}`);
    } catch (error: any) {
      logger.error('Erro no comando kick:', error);

      if (error?.code === 10007) {
        await interaction.editReply({
          embeds: [errorEmbed('Erro', 'Usuário não encontrado no servidor.')],
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Erro', 'Ocorreu um erro ao tentar expulsar o usuário.')],
        });
      }
    }
  },
};

export default command;
