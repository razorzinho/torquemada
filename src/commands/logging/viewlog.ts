import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { guildSettingsRepo } from '../../database/repositories/guildSettings';
import { infoEmbed, errorEmbed } from '../../utils/embeds';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('viewlog')
    .setDescription('Exibe a configuração atual de logs do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction: ChatInputCommandInteraction, _client: TorquemadaClient) {
    const guildId = interaction.guildId!;
    logger.command('viewlog', interaction.user.id, guildId);

    try {
      const logConfig = await guildSettingsRepo.getLogChannel(guildId);

      if (!logConfig || !logConfig.log_channel) {
        await interaction.reply({
          embeds: [
            infoEmbed(
              '📋 Configuração de Logs',
              'Nenhum canal de logs configurado.\n\nUse `/setlog` para configurar.',
            ),
          ],
        });
        return;
      }

      const events = logConfig.log_events ?? [];
      const eventsList = events.length > 0
        ? events.map(e => `• \`${e}\``).join('\n')
        : '_Nenhum evento habilitado_';

      const embed = infoEmbed('📋 Configuração de Logs')
        .addFields(
          {
            name: '📌 Canal de Logs',
            value: `<#${logConfig.log_channel}>`,
            inline: true,
          },
          {
            name: '📊 Total de Eventos',
            value: `${events.length} evento(s)`,
            inline: true,
          },
          {
            name: '📝 Eventos Habilitados',
            value: eventsList,
            inline: false,
          },
        );

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Erro ao visualizar configuração de logs:', error);
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao buscar a configuração de logs.')],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default command;
