import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { checkPermissions, checkBotPermissions } from '../../utils/permissions';
import { errorEmbed, successEmbed } from '../../utils/embeds';
import { logger } from '../../utils/logger';
import { formatDuration } from '../../utils/duration';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Define o modo lento de um canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(opt =>
      opt
        .setName('duração')
        .setDescription('Duração do slowmode em segundos (0 para desativar)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600),
    )
    .addChannelOption(opt =>
      opt
        .setName('canal')
        .setDescription('Canal para aplicar (padrão: canal atual)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction, client: TorquemadaClient) {
    if (!interaction.guild) return;

    logger.command('slowmode', interaction.user.id, interaction.guild.id);

    // Permission checks
    if (!(await checkPermissions(interaction, [PermissionFlagsBits.ManageChannels]))) return;
    if (!(await checkBotPermissions(interaction, [PermissionFlagsBits.ManageChannels]))) return;

    const duration = interaction.options.getInteger('duração', true);
    const targetChannel = (interaction.options.getChannel('canal') ?? interaction.channel) as TextChannel;

    if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Este comando só pode ser usado em canais de texto.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    try {
      await targetChannel.setRateLimitPerUser(duration, `Slowmode alterado por ${interaction.user.tag}`);

      if (duration === 0) {
        const embed = successEmbed(
          'Slowmode Desativado',
          `O modo lento foi desativado em ${targetChannel}.`,
        );
        await interaction.editReply({ embeds: [embed] });

        logger.success(`Slowmode: desativado em #${targetChannel.name} (${interaction.guild.name})`);
      } else {
        const formattedDuration = formatDuration(duration * 1000);
        const embed = successEmbed(
          'Slowmode Ativado',
          `O modo lento de ${targetChannel} foi definido para **${formattedDuration}**.`,
        );
        await interaction.editReply({ embeds: [embed] });

        logger.success(`Slowmode: ${formattedDuration} em #${targetChannel.name} (${interaction.guild.name})`);
      }
    } catch (error) {
      logger.error('Erro no comando slowmode:', error);
      await interaction.editReply({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao tentar alterar o modo lento.')],
      });
    }
  },
};

export default command;
