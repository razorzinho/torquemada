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
import { modAction } from '../../utils/modAction';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Bane e desbane imediatamente (expulsa + limpa mensagens)')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('Usuário para aplicar o softban')
        .setRequired(true),
    )
    .addStringOption(opt =>
      opt
        .setName('motivo')
        .setDescription('Motivo do softban')
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction, client: TorquemadaClient) {
    if (!interaction.guild) return;

    logger.command('softban', interaction.user.id, interaction.guild.id);

    if (!(await checkPermissions(interaction, [PermissionFlagsBits.BanMembers]))) return;
    if (!(await checkBotPermissions(interaction, [PermissionFlagsBits.BanMembers]))) return;

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('motivo') ?? 'Sem motivo informado';

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Você não pode aplicar softban em si mesmo.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (targetUser.id === client.user?.id) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Eu não posso aplicar softban em mim mesmo.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    try {
      let targetMember: GuildMember | null = null;
      try {
        targetMember = await interaction.guild.members.fetch(targetUser.id);
      } catch { /* não está no servidor */ }

      if (targetMember) {
        const moderator = interaction.member as GuildMember;
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
      }

      // DM + persistência ANTES do ban
      await modAction({
        guild: interaction.guild,
        target: targetUser,
        moderator: interaction.user,
        actionType: 'softban',
        reason,
        client,
      });

      // Ban com limpeza de 7 dias
      await interaction.guild.members.ban(targetUser.id, {
        deleteMessageSeconds: 7 * 86400,
        reason: `[Softban] ${reason} | Por: ${interaction.user.tag}`,
      });

      // Unban imediato
      await interaction.guild.bans.remove(targetUser.id, `Softban — desbane automático`);

      const embed = moderationEmbed(
        'Softban Aplicado',
        [
          `**Usuário:** ${targetUser.tag} (\`${targetUser.id}\`)`,
          `**Moderador:** ${interaction.user}`,
          `**Motivo:** ${reason}`,
          `*Mensagens dos últimos 7 dias foram limpas.*`,
        ].join('\n'),
      );

      await interaction.editReply({ embeds: [embed] });
      logger.success(`Softban: ${targetUser.tag} (${targetUser.id}) em ${interaction.guild.name}`);
    } catch (error: any) {
      logger.error('Erro no comando softban:', error);
      await interaction.editReply({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao aplicar o softban.')],
      });
    }
  },
};

export default command;
