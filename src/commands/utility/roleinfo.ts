import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionsBitField,
  MessageFlags,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { infoEmbed, errorEmbed } from '../../utils/embeds';
import { discordTimestamp } from '../../utils/duration';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('roleinfo')
    .setDescription('Exibe informações detalhadas sobre um cargo')
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('Cargo para ver informações')
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: TorquemadaClient) {
    const guildId = interaction.guildId!;
    logger.command('roleinfo', interaction.user.id, guildId);

    const role = interaction.options.getRole('role', true);

    try {
      // Fetch full role from the guild to have all data
      const guildRole = await interaction.guild?.roles.fetch(role.id);

      if (!guildRole) {
        await interaction.reply({
          embeds: [errorEmbed('Erro', 'Cargo não encontrado.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const permissions = new PermissionsBitField(guildRole.permissions).toArray();
      const permissionsList = permissions.length > 0
        ? permissions.map(p => `\`${p}\``).join(', ')
        : '_Nenhuma permissão especial_';

      // Truncate permissions if too long
      const maxPermLength = 1024;
      const permText = permissionsList.length > maxPermLength
        ? permissionsList.substring(0, maxPermLength - 20) + `... e mais ${permissions.length} permissões`
        : permissionsList;

      const colorHex = guildRole.hexColor === '#000000' ? 'Padrão' : guildRole.hexColor;

      const embed = infoEmbed(`🎭 ${guildRole.name}`)
        .setColor(guildRole.color || null)
        .addFields(
          {
            name: '🆔 ID',
            value: guildRole.id,
            inline: true,
          },
          {
            name: '🎨 Cor',
            value: colorHex,
            inline: true,
          },
          {
            name: '📊 Posição',
            value: `${guildRole.position}`,
            inline: true,
          },
          {
            name: '📢 Mencionável',
            value: guildRole.mentionable ? 'Sim' : 'Não',
            inline: true,
          },
          {
            name: '📌 Hoisted',
            value: guildRole.hoist ? 'Sim' : 'Não',
            inline: true,
          },
          {
            name: '👥 Membros',
            value: `${guildRole.members.size}`,
            inline: true,
          },
          {
            name: '📅 Criado em',
            value: discordTimestamp(guildRole.createdAt, 'f') + '\n' + discordTimestamp(guildRole.createdAt, 'R'),
            inline: false,
          },
          {
            name: `🔑 Permissões (${permissions.length})`,
            value: permText,
            inline: false,
          },
        );

      if (guildRole.iconURL()) {
        embed.setThumbnail(guildRole.iconURL({ size: 256 })!);
      }

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Erro ao buscar informações do cargo:', error);
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao buscar informações do cargo.')],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default command;
