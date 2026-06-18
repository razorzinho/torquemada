import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
  ChannelType,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { checkPermissions, checkBotPermissions } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Gerencia o bloqueio de canais')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Bloqueia um canal (impede @everyone de enviar mensagens)')
        .addChannelOption(opt =>
          opt
            .setName('canal')
            .setDescription('Canal para bloquear (padrão: canal atual)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        )
        .addStringOption(opt =>
          opt
            .setName('motivo')
            .setDescription('Motivo do bloqueio')
            .setRequired(false),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Desbloqueia um canal (permite @everyone enviar mensagens)')
        .addChannelOption(opt =>
          opt
            .setName('canal')
            .setDescription('Canal para desbloquear (padrão: canal atual)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction, client: TorquemadaClient) {
    if (!interaction.guild) return;

    const subcommand = interaction.options.getSubcommand();

    logger.command(`lock ${subcommand}`, interaction.user.id, interaction.guild.id);

    // Permission checks
    if (!(await checkPermissions(interaction, [PermissionFlagsBits.ManageChannels]))) return;
    if (!(await checkBotPermissions(interaction, [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles]))) return;

    const targetChannel = (interaction.options.getChannel('canal') ?? interaction.channel) as TextChannel;

    if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Este comando só pode ser usado em canais de texto.')],
        ephemeral: true,
      });
      return;
    }

    const everyoneRole = interaction.guild.roles.everyone;

    await interaction.deferReply();

    try {
      if (subcommand === 'set') {
        const reason = interaction.options.getString('motivo') ?? 'Sem motivo informado';

        await targetChannel.permissionOverwrites.edit(everyoneRole, {
          SendMessages: false,
        }, {
          reason: `Canal bloqueado por ${interaction.user.tag}: ${reason}`,
        });

        const embed = successEmbed(
          '🔒 Canal Bloqueado',
          [
            `O canal ${targetChannel} foi bloqueado.`,
            `**Motivo:** ${reason}`,
            `**Moderador:** ${interaction.user}`,
          ].join('\n'),
        );

        await interaction.editReply({ embeds: [embed] });

        logger.success(`Lock: #${targetChannel.name} bloqueado em ${interaction.guild.name}`);
      } else {
        await targetChannel.permissionOverwrites.edit(everyoneRole, {
          SendMessages: null,
        }, {
          reason: `Canal desbloqueado por ${interaction.user.tag}`,
        });

        const embed = successEmbed(
          '🔓 Canal Desbloqueado',
          [
            `O canal ${targetChannel} foi desbloqueado.`,
            `**Moderador:** ${interaction.user}`,
          ].join('\n'),
        );

        await interaction.editReply({ embeds: [embed] });

        logger.success(`Unlock: #${targetChannel.name} desbloqueado em ${interaction.guild.name}`);
      }
    } catch (error) {
      logger.error('Erro no comando lock:', error);
      await interaction.editReply({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao tentar alterar as permissões do canal.')],
      });
    }
  },
};

export default command;
