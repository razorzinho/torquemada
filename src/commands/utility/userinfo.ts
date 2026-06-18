import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { infoEmbed, errorEmbed } from '../../utils/embeds';
import { discordTimestamp } from '../../utils/duration';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Exibe informações detalhadas sobre um usuário')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Usuário para ver informações (padrão: você)')
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: TorquemadaClient) {
    const guildId = interaction.guildId!;
    logger.command('userinfo', interaction.user.id, guildId);

    const targetUser = interaction.options.getUser('user') ?? interaction.user;

    try {
      await interaction.deferReply();

      const member = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);
      const fetchedUser = await targetUser.fetch(); // Fetch full user data

      const embed = infoEmbed(`👤 ${fetchedUser.tag}`)
        .setThumbnail(fetchedUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          {
            name: '🆔 ID',
            value: fetchedUser.id,
            inline: true,
          },
          {
            name: '🏷️ Tag',
            value: fetchedUser.tag,
            inline: true,
          },
          {
            name: '🤖 Bot',
            value: fetchedUser.bot ? 'Sim' : 'Não',
            inline: true,
          },
          {
            name: '📅 Conta Criada',
            value: discordTimestamp(fetchedUser.createdAt, 'f') + '\n' + discordTimestamp(fetchedUser.createdAt, 'R'),
            inline: true,
          },
        );

      if (member) {
        const roles = member.roles.cache
          .filter(r => r.id !== guildId) // Exclude @everyone
          .sort((a, b) => b.position - a.position)
          .map(r => `${r}`)
          .slice(0, 20); // Limit to 20 roles to avoid embed limit

        const rolesText = roles.length > 0
          ? roles.join(', ') + (member.roles.cache.size - 1 > 20 ? ` e mais ${member.roles.cache.size - 1 - 20}...` : '')
          : '_Nenhum cargo_';

        embed.addFields(
          {
            name: '📥 Entrou no Servidor',
            value: member.joinedAt
              ? discordTimestamp(member.joinedAt, 'f') + '\n' + discordTimestamp(member.joinedAt, 'R')
              : '_Desconhecido_',
            inline: true,
          },
          {
            name: '📛 Apelido',
            value: member.nickname ?? '_Nenhum_',
            inline: true,
          },
          {
            name: '👑 Maior Cargo',
            value: `${member.roles.highest}`,
            inline: true,
          },
          {
            name: `🎭 Cargos (${member.roles.cache.size - 1})`,
            value: rolesText,
            inline: false,
          },
        );
      }

      // Add banner if available
      if (fetchedUser.bannerURL()) {
        embed.setImage(fetchedUser.bannerURL({ size: 1024 })!);
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Erro ao buscar informações do usuário:', error);
      const reply = interaction.deferred
        ? interaction.editReply.bind(interaction)
        : interaction.reply.bind(interaction);
      await reply({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao buscar informações do usuário.')],
      });
    }
  },
};

export default command;
