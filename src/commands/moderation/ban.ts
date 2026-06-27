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
import { errorEmbed, successEmbed, moderationEmbed } from '../../utils/embeds';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bane um usuário do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(opt =>
      opt
        .setName('user')
        .setDescription('Usuário para banir (@menção ou ID — funciona mesmo com quem não está no servidor)')
        .setRequired(true),
    )
    .addStringOption(opt =>
      opt
        .setName('motivo')
        .setDescription('Motivo do banimento')
        .setRequired(false),
    )
    .addIntegerOption(opt =>
      opt
        .setName('delete_days')
        .setDescription('Dias de mensagens para apagar (0-7)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(7),
    ),

  async execute(interaction: ChatInputCommandInteraction, client: TorquemadaClient) {
    if (!interaction.guild) return;

    logger.command('ban', interaction.user.id, interaction.guild.id);

    // Permission checks
    if (!(await checkPermissions(interaction, [PermissionFlagsBits.BanMembers]))) return;
    if (!(await checkBotPermissions(interaction, [PermissionFlagsBits.BanMembers]))) return;

    const userInput = interaction.options.getString('user', true).trim();
    const reason = interaction.options.getString('motivo') ?? 'Sem motivo informado';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

    // Extract user ID from mention format <@!ID> or <@ID>, or use raw ID
    const idMatch = userInput.match(/^<@!?(\d+)>$/) ?? userInput.match(/^(\d+)$/);

    if (!idMatch) {
      await interaction.reply({
        embeds: [errorEmbed('ID Inválido', 'Forneça uma menção (@user) ou um ID de usuário válido.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const userId = idMatch[1];

    // Cannot ban yourself
    if (userId === interaction.user.id) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Você não pode se banir.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Cannot ban the bot
    if (userId === client.user?.id) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Eu não posso me banir.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    try {
      // Try to get member from guild (may not exist for hackbans)
      let targetMember: GuildMember | null = null;
      try {
        targetMember = await interaction.guild.members.fetch(userId);
      } catch {
        // User is not in the server — hackban
      }

      // If member is in the server, check hierarchy
      if (targetMember) {
        const moderator = interaction.member as GuildMember;

        if (!canModerate(moderator, targetMember)) {
          await interaction.editReply({
            embeds: [errorEmbed('Hierarquia', 'Você não pode banir alguém com cargo igual ou superior ao seu.')],
          });
          return;
        }

        const botMember = interaction.guild.members.me!;
        if (!canModerate(botMember, targetMember)) {
          await interaction.editReply({
            embeds: [errorEmbed('Hierarquia', 'Eu não posso banir alguém com cargo igual ou superior ao meu.')],
          });
          return;
        }

        if (!targetMember.bannable) {
          await interaction.editReply({
            embeds: [errorEmbed('Erro', 'Não é possível banir este usuário.')],
          });
          return;
        }
      }

      // Fetch user info for display (may fail for truly unknown users)
      let userTag = userId;
      try {
        const user = await client.users.fetch(userId);
        userTag = user.tag;
      } catch {
        // Unknown user, just use the ID
      }

      // Execute ban
      await interaction.guild.members.ban(userId, {
        deleteMessageSeconds: deleteDays * 86400,
        reason: `${reason} | Por: ${interaction.user.tag}`,
      });

      const embed = moderationEmbed(
        'Usuário Banido',
        [
          `**Usuário:** ${userTag} (\`${userId}\`)`,
          `**Moderador:** ${interaction.user}`,
          `**Motivo:** ${reason}`,
          deleteDays > 0 ? `**Mensagens apagadas:** ${deleteDays} dia(s)` : '',
          !targetMember ? '*(Hackban — usuário não estava no servidor)*' : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );

      await interaction.editReply({ embeds: [embed] });

      logger.success(`Ban: ${userTag} (${userId}) banido de ${interaction.guild.name}`);
    } catch (error: any) {
      logger.error('Erro no comando ban:', error);

      if (error?.code === 10013) {
        await interaction.editReply({
          embeds: [errorEmbed('Erro', 'Usuário não encontrado. Verifique o ID informado.')],
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Erro', 'Ocorreu um erro ao tentar banir o usuário.')],
        });
      }
    }
  },
};

export default command;
