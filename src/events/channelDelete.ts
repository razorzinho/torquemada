import { Events, GuildChannel, AuditLogEvent, EmbedBuilder, ChannelType, DMChannel } from 'discord.js';
import { TorquemadaClient } from '../client';
import { sendLogEmbed } from '../utils/sendLogEmbed';
import { Colors } from '../utils/embeds';
import { logger } from '../utils/logger';

const CHANNEL_TYPE_LABELS: Partial<Record<ChannelType, string>> = {
  [ChannelType.GuildText]: '💬 Texto',
  [ChannelType.GuildVoice]: '🔊 Voz',
  [ChannelType.GuildCategory]: '📁 Categoria',
  [ChannelType.GuildAnnouncement]: '📢 Anúncios',
  [ChannelType.GuildStageVoice]: '🎤 Palco',
  [ChannelType.GuildForum]: '📋 Fórum',
};

export default {
  name: Events.ChannelDelete,
  once: false,

  async execute(channel: GuildChannel | DMChannel, client: TorquemadaClient) {
    try {
      if (!('guild' in channel) || !channel.guild) return;

      const guildId = channel.guild.id;
      const typeLabel = CHANNEL_TYPE_LABELS[channel.type] ?? 'Outro';

      let executor = 'Desconhecido';
      try {
        const auditLogs = await channel.guild.fetchAuditLogs({
          type: AuditLogEvent.ChannelDelete,
          limit: 5,
        });
        const entry = auditLogs.entries.find((e: any) => {
          const timeDiff = Date.now() - e.createdTimestamp;
          return timeDiff < 10000 && e.target?.id === channel.id;
        });
        if (entry) executor = `<@${entry.executor?.id}>`;
      } catch { /* sem permissão */ }

      const embed = new EmbedBuilder()
        .setColor(Colors.ERROR)
        .setTitle('🗑️ Canal Deletado')
        .addFields(
          { name: '📌 Canal', value: `\`#${channel.name}\``, inline: true },
          { name: '📂 Tipo', value: typeLabel, inline: true },
          { name: '🛡️ Deletado por', value: executor, inline: true },
        )
        .setFooter({ text: `ID: ${channel.id}` })
        .setTimestamp();

      if ('parent' in channel && channel.parent) {
        embed.addFields({ name: '📁 Categoria', value: channel.parent.name, inline: true });
      }

      await sendLogEmbed({ client, guildId, eventType: 'channel_delete', embed });
    } catch (error) {
      logger.error('Erro ao logar channel delete:', error);
    }
  },
};
