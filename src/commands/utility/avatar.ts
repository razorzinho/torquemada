import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { infoEmbed, errorEmbed } from '../../utils/embeds';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Exibe o avatar de um usuário em alta resolução')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Usuário para ver o avatar (padrão: você)')
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: TorquemadaClient) {
    const guildId = interaction.guildId!;
    logger.command('avatar', interaction.user.id, guildId);

    const targetUser = interaction.options.getUser('user') ?? interaction.user;

    try {
      const member = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);

      const globalAvatar = targetUser.displayAvatarURL({ size: 4096 });
      const serverAvatar = member?.displayAvatarURL({ size: 4096 });
      const isAnimated = targetUser.avatar?.startsWith('a_');

      // Build format links
      const formatLinks = (url: string, animated: boolean) => {
        const base = url.split('?')[0]; // Remove query params
        const links = [
          `[PNG](${base.replace(/\.(png|jpg|webp|gif)$/, '.png')}?size=4096)`,
          `[JPG](${base.replace(/\.(png|jpg|webp|gif)$/, '.jpg')}?size=4096)`,
          `[WEBP](${base.replace(/\.(png|jpg|webp|gif)$/, '.webp')}?size=4096)`,
        ];
        if (animated) {
          links.push(`[GIF](${base.replace(/\.(png|jpg|webp|gif)$/, '.gif')}?size=4096)`);
        }
        return links.join(' • ');
      };

      const embed = infoEmbed(`🖼️ Avatar de ${targetUser.tag}`)
        .setImage(globalAvatar)
        .addFields({
          name: '🌐 Avatar Global',
          value: formatLinks(globalAvatar, isAnimated ?? false),
          inline: false,
        });

      // If server avatar is different from global
      if (serverAvatar && serverAvatar !== globalAvatar) {
        const isServerAnimated = member?.avatar?.startsWith('a_');
        embed.addFields({
          name: '🏠 Avatar do Servidor',
          value: formatLinks(serverAvatar, isServerAnimated ?? false),
          inline: false,
        });

        // Show server avatar as image, global as thumbnail
        embed.setImage(serverAvatar);
        embed.setThumbnail(globalAvatar);
      }

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Erro ao buscar avatar:', error);
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao buscar o avatar.')],
        ephemeral: true,
      });
    }
  },
};

export default command;
