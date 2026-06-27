import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildVerificationLevel,
  MessageFlags,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { infoEmbed, errorEmbed } from '../../utils/embeds';
import { discordTimestamp } from '../../utils/duration';
import { logger } from '../../utils/logger';

const verificationLevels: Record<GuildVerificationLevel, string> = {
  [GuildVerificationLevel.None]: 'Nenhuma',
  [GuildVerificationLevel.Low]: 'Baixa',
  [GuildVerificationLevel.Medium]: 'Média',
  [GuildVerificationLevel.High]: 'Alta',
  [GuildVerificationLevel.VeryHigh]: 'Muito Alta',
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Exibe informações detalhadas sobre o servidor'),

  async execute(interaction: ChatInputCommandInteraction, _client: TorquemadaClient) {
    const guildId = interaction.guildId!;
    logger.command('serverinfo', interaction.user.id, guildId);

    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Não foi possível obter informações do servidor.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await interaction.deferReply();

      // Fetch full guild data to get accurate member counts
      const fetchedGuild = await guild.fetch();
      const members = await guild.members.fetch();

      const owner = await guild.fetchOwner();
      const totalMembers = guild.memberCount;
      const onlineMembers = members.filter(m => m.presence?.status !== 'offline' && m.presence?.status !== undefined).size;
      const botCount = members.filter(m => m.user.bot).size;
      const humanCount = totalMembers - botCount;

      const textChannels = guild.channels.cache.filter(c => c.isTextBased() && !c.isThread()).size;
      const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased()).size;
      const categories = guild.channels.cache.filter(c => c.type === 4).size; // CategoryChannel type = 4

      const boostLevel = fetchedGuild.premiumTier;
      const boostCount = fetchedGuild.premiumSubscriptionCount ?? 0;

      const embed = infoEmbed(`📊 ${guild.name}`)
        .addFields(
          {
            name: '🆔 ID',
            value: guild.id,
            inline: true,
          },
          {
            name: '👑 Dono',
            value: `${owner.user.tag}`,
            inline: true,
          },
          {
            name: '📅 Criado em',
            value: discordTimestamp(guild.createdAt, 'f') + '\n' + discordTimestamp(guild.createdAt, 'R'),
            inline: true,
          },
          {
            name: `👥 Membros (${totalMembers})`,
            value: `👤 Humanos: **${humanCount}**\n🤖 Bots: **${botCount}**\n🟢 Online: **${onlineMembers}**`,
            inline: true,
          },
          {
            name: `💬 Canais (${textChannels + voiceChannels})`,
            value: `📝 Texto: **${textChannels}**\n🔊 Voz: **${voiceChannels}**\n📁 Categorias: **${categories}**`,
            inline: true,
          },
          {
            name: '🎭 Cargos',
            value: `**${guild.roles.cache.size}** cargos`,
            inline: true,
          },
          {
            name: '🚀 Boost',
            value: `Nível: **${boostLevel}**\nBoosts: **${boostCount}**`,
            inline: true,
          },
          {
            name: '🔒 Verificação',
            value: verificationLevels[guild.verificationLevel] ?? 'Desconhecido',
            inline: true,
          },
        );

      if (guild.description) {
        embed.addFields({
          name: '📝 Descrição',
          value: guild.description,
          inline: false,
        });
      }

      if (guild.iconURL()) {
        embed.setThumbnail(guild.iconURL({ size: 1024 }));
      }

      if (guild.bannerURL()) {
        embed.setImage(guild.bannerURL({ size: 1024 }));
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Erro ao buscar informações do servidor:', error);
      const reply = interaction.deferred
        ? interaction.editReply.bind(interaction)
        : interaction.reply.bind(interaction);
      await reply({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao buscar informações do servidor.')],
      });
    }
  },
};

export default command;
