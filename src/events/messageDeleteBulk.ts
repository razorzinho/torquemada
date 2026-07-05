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
import { Colors } from '../utils/embeds';
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

      const embed = new EmbedBuilder()
        .setColor(Colors.ERROR)
        .setTitle('📋 Mensagens Deletadas em Massa')
        .addFields(
          { name: '📌 Canal', value: `<#${channel.id}>`, inline: true },
          { name: '🗑️ Quantidade', value: `${messages.size} mensagens`, inline: true },
          { name: '🗑️ Deletadas por', value: '_verificando..._', inline: false },
        )
        .setFooter({ text: 'Bulk delete' })
        .setTimestamp();

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
            ? `<@${relevantEntry.executor?.id}> (\`${relevantEntry.executor?.id}\`)`
            : '_Desconhecido_';

          const previousEmbed = EmbedBuilder.from(logMessage.embeds[0]);
          const fields = previousEmbed.data.fields ?? [];
          const deletedByIdx = fields.findIndex(f => f.name === '🗑️ Deletadas por');
          if (deletedByIdx !== -1) fields[deletedByIdx].value = deletedBy;
          const updatedEmbed = previousEmbed.setFields(fields);

          await logMessage.edit({ embeds: [updatedEmbed] });
        } catch (err) {
          logger.warn('Não foi possível consultar Audit Log para bulk delete:', err);
          try {
            const previousEmbed = EmbedBuilder.from(logMessage.embeds[0]);
            const fields = previousEmbed.data.fields ?? [];
            const deletedByIdx = fields.findIndex(f => f.name === '🗑️ Deletadas por');
            if (deletedByIdx !== -1) fields[deletedByIdx].value = '_Falha na verificação_';
            const updatedEmbed = previousEmbed.setFields(fields);
            await logMessage.edit({ embeds: [updatedEmbed] });
          } catch { /* ignore */ }
        }
      }, 2500);
    } catch (error) {
      logger.error('Erro ao logar messageDeleteBulk:', error);
    }
  },
};
