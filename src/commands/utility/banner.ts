import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { infoEmbed, errorEmbed, warningEmbed } from '../../utils/embeds';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('Exibe o banner de um usuário')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Usuário para ver o banner (padrão: você)')
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: TorquemadaClient) {
    const guildId = interaction.guildId!;
    logger.command('banner', interaction.user.id, guildId);

    const targetUser = interaction.options.getUser('user') ?? interaction.user;

    try {
      // Need to fetch user to get banner data
      const fetchedUser = await targetUser.fetch();

      const bannerUrl = fetchedUser.bannerURL({ size: 4096 });

      if (!bannerUrl) {
        await interaction.reply({
          embeds: [
            warningEmbed(
              'Sem Banner',
              `${fetchedUser.tag} não possui um banner definido.`,
            ),
          ],
          ephemeral: true,
        });
        return;
      }

      const isAnimated = fetchedUser.banner?.startsWith('a_');
      const base = bannerUrl.split('?')[0];

      const links = [
        `[PNG](${base.replace(/\.(png|jpg|webp|gif)$/, '.png')}?size=4096)`,
        `[JPG](${base.replace(/\.(png|jpg|webp|gif)$/, '.jpg')}?size=4096)`,
        `[WEBP](${base.replace(/\.(png|jpg|webp|gif)$/, '.webp')}?size=4096)`,
      ];
      if (isAnimated) {
        links.push(`[GIF](${base.replace(/\.(png|jpg|webp|gif)$/, '.gif')}?size=4096)`);
      }

      const embed = infoEmbed(`🎨 Banner de ${fetchedUser.tag}`)
        .setImage(bannerUrl)
        .addFields({
          name: '📥 Formatos',
          value: links.join(' • '),
          inline: false,
        });

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Erro ao buscar banner:', error);
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao buscar o banner.')],
        ephemeral: true,
      });
    }
  },
};

export default command;
