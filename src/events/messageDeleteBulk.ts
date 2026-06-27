import {
  Events,
  Collection,
  Message,
  PartialMessage,
  TextChannel,
  GuildTextBasedChannel,
  AuditLogEvent,
  EmbedBuilder,
} from 'discord.js';
import { TorquemadaClient } from '../client';
import { guildSettingsRepo } from '../database/repositories/guildSettings';
import { logEmbed, Colors } from '../utils/embeds';
import { logger } from '../utils/logger';

export default {
  name: Events.MessageBulkDelete,
  once: false,

  async execute(
    messages: Collection<string, Message | PartialMessage>,
    channel: GuildTextBasedChannel,
    client: TorquemadaClient,
  ) {
    try {
      const guildId = channel.guild.id;

      const logConfig = await guildSettingsRepo.getLogChannel(guildId);
      if (!logConfig?.log_channel || !logConfig.log_events?.includes('message_delete')) return;

      const logChannel = await client.channels.fetch(logConfig.log_channel).catch(() => null) as TextChannel | null;
      if (!logChannel) return;

      const embed = logEmbed('Mensagens Deletadas em Massa')
        .setColor(Colors.ERROR)
        .addFields(
          { name: '📌 Canal', value: `<#${channel.id}>`, inline: true },
          { name: '🗑️ Quantidade', value: `${messages.size} mensagens`, inline: true },
        )
        .setFooter({ text: 'Deletadas por: verificando...' });

      const logMessage = await logChannel.send({ embeds: [embed] });

      // Fase 2: Consultar Audit Log para ver quem disparou o bulk delete
      setTimeout(async () => {
        try {
          const auditLogs = await channel.guild.fetchAuditLogs({
            type: AuditLogEvent.MessageBulkDelete,
            limit: 5,
          });

          const relevantEntry = auditLogs.entries.find(entry => {
            const timeDiff = Date.now() - entry.createdTimestamp;
            return timeDiff < 10000 && entry.target?.id === channel.id;
          });

          const deletedBy = relevantEntry
            ? `<@${relevantEntry.executor?.id}> (${relevantEntry.executor?.tag})`
            : '_Desconhecido_';

          const updatedEmbed = EmbedBuilder.from(logMessage.embeds[0])
            .setFooter({ text: 'Bulk delete' })
            .addFields({ name: '🗑️ Deletadas por', value: deletedBy, inline: false });

          await logMessage.edit({ embeds: [updatedEmbed] });
        } catch (err) {
          logger.warn('Não foi possível consultar Audit Log para bulk delete:', err);
          try {
            const updatedEmbed = EmbedBuilder.from(logMessage.embeds[0])
              .setFooter({ text: 'Não foi possível verificar quem deletou' });
            await logMessage.edit({ embeds: [updatedEmbed] });
          } catch { /* ignore */ }
        }
      }, 2500);
    } catch (error) {
      logger.error('Erro ao logar messageDeleteBulk:', error);
    }
  },
};
