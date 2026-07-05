import { Events, VoiceState, EmbedBuilder } from 'discord.js';
import { TorquemadaClient } from '../client';
import { sendLogEmbed } from '../utils/sendLogEmbed';
import { Colors } from '../utils/embeds';
import { logger } from '../utils/logger';

export default {
  name: Events.VoiceStateUpdate,
  once: false,

  async execute(oldState: VoiceState, newState: VoiceState, client: TorquemadaClient) {
    try {
      const guild = newState.guild ?? oldState.guild;
      if (!guild) return;

      const guildId = guild.id;
      const member = newState.member ?? oldState.member;
      if (!member) return;

      const userId = member.id;
      const userTag = member.user.tag;
      const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 128 });

      // Detectar tipo de evento
      const oldChannel = oldState.channel;
      const newChannel = newState.channel;

      if (!oldChannel && newChannel) {
        // Voice Join
        const embed = new EmbedBuilder()
          .setColor(Colors.SUCCESS)
          .setTitle('🔊 Entrou em Canal de Voz')
          .addFields(
            { name: '👤 Usuário', value: `<@${userId}> (\`${userId}\`)`, inline: true },
            { name: '🔊 Canal', value: `<#${newChannel.id}>`, inline: true },
          )
          .setThumbnail(avatarUrl)
          .setFooter({ text: `ID: ${userId}` })
          .setTimestamp();

        await sendLogEmbed({ client, guildId, eventType: 'voice_join', embed });

      } else if (oldChannel && !newChannel) {
        // Voice Leave
        const embed = new EmbedBuilder()
          .setColor(Colors.MUTED)
          .setTitle('🔇 Saiu do Canal de Voz')
          .addFields(
            { name: '👤 Usuário', value: `<@${userId}> (\`${userId}\`)`, inline: true },
            { name: '🔇 Canal', value: `<#${oldChannel.id}>`, inline: true },
          )
          .setThumbnail(avatarUrl)
          .setFooter({ text: `ID: ${userId}` })
          .setTimestamp();

        await sendLogEmbed({ client, guildId, eventType: 'voice_leave', embed });

      } else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
        // Voice Move
        const embed = new EmbedBuilder()
          .setColor(Colors.INFO)
          .setTitle('🔀 Movido de Canal de Voz')
          .addFields(
            { name: '👤 Usuário', value: `<@${userId}> (\`${userId}\`)`, inline: true },
            { name: '⬅️ De', value: `<#${oldChannel.id}>`, inline: true },
            { name: '➡️ Para', value: `<#${newChannel.id}>`, inline: true },
          )
          .setThumbnail(avatarUrl)
          .setFooter({ text: `ID: ${userId}` })
          .setTimestamp();

        await sendLogEmbed({ client, guildId, eventType: 'voice_move', embed });
      }
    } catch (error) {
      logger.error('Erro ao logar voice state update:', error);
    }
  },
};
