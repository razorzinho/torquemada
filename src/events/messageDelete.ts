import {
  Events,
  Message,
  PartialMessage,
  TextChannel,
  AuditLogEvent,
  EmbedBuilder,
} from 'discord.js';
import { TorquemadaClient } from '../client';
import { guildSettingsRepo } from '../database/repositories/guildSettings';
import { downloadAttachments } from '../utils/mediaDownloader';
import { logEmbed, Colors } from '../utils/embeds';
import { logger } from '../utils/logger';

export default {
  name: Events.MessageDelete,
  once: false,

  async execute(message: Message | PartialMessage, client: TorquemadaClient) {
    try {
      // Ignore DMs
      if (!message.guild) return;

      // Ignore bot messages
      if (message.author?.bot) return;

      const guildId = message.guild.id;

      // Check if logging is configured for this event
      const logConfig = await guildSettingsRepo.getLogChannel(guildId);
      if (!logConfig?.log_channel || !logConfig.log_events?.includes('message_delete')) return;

      const logChannel = await client.channels.fetch(logConfig.log_channel).catch(() => null) as TextChannel | null;
      if (!logChannel) return;

      const author = message.author
        ? `<@${message.author.id}> (${message.author.tag} \`${message.author.id}\`)`
        : 'Desconhecido (mensagem não estava em cache)';

      const content = message.content
        ? message.content.length > 1024
          ? message.content.substring(0, 1021) + '...'
          : message.content
        : '_Conteúdo não disponível (mensagem não estava em cache)_';

      // Calcular idade da mensagem
      const messageAge = message.createdTimestamp
        ? formatDuration(Date.now() - message.createdTimestamp)
        : 'desconhecida';

      // --- Fase 1: Logar imediatamente com dados da mensagem ---
      const embed = logEmbed('Mensagem Deletada')
        .addFields(
          { name: '👤 Autor', value: author, inline: true },
          { name: '📌 Canal', value: `<#${message.channelId}>`, inline: true },
          { name: '⏱️ Idade', value: messageAge, inline: true },
          { name: '📝 Conteúdo', value: content, inline: false },
        );

      // Persistir anexos via download
      const files = [];
      if (message.attachments && message.attachments.size > 0) {
        const attachmentInfos = message.attachments.map(a => ({
          url: a.url,
          name: a.name ?? `anexo_${a.id}`,
        }));

        const downloaded = await downloadAttachments(attachmentInfos);
        files.push(...downloaded);

        // Listar todos os anexos (incluindo os que não foram baixados)
        const attachmentList = message.attachments
          .map(a => {
            const wasDownloaded = downloaded.some(d => d.name === (a.name ?? `anexo_${a.id}`));
            return wasDownloaded
              ? `✅ \`${a.name ?? 'arquivo'}\` (persistido)`
              : `⚠️ [\`${a.name ?? 'arquivo'}\`](${a.url}) _(URL pode expirar)_`;  // @TODO: persistir arquivos grandes
          })
          .join('\n');

        embed.addFields({
          name: `📎 Anexos (${message.attachments.size})`,
          value: attachmentList.length > 1024
            ? attachmentList.substring(0, 1021) + '...'
            : attachmentList,
          inline: false,
        });

        // Se houver imagem, mostrar a primeira como preview
        const firstImage = message.attachments.find(a =>
          a.contentType?.startsWith('image/'),
        );
        if (firstImage) {
          const imgName = firstImage.name ?? `anexo_${firstImage.id}`;
          const wasDownloaded = downloaded.some(d => d.name === imgName);
          if (wasDownloaded) {
            embed.setImage(`attachment://${imgName}`);
          }
        }
      }

      embed.setFooter({ text: `ID: ${message.id} • Deletada por: verificando...` });

      const logMessage = await logChannel.send({ embeds: [embed], files });

      // --- Fase 2: Consultar Audit Log após delay para identificar quem deletou ---
      setTimeout(async () => {
        try {
          const auditLogs = await message.guild!.fetchAuditLogs({
            type: AuditLogEvent.MessageDelete,
            limit: 5,
          });

          const relevantEntry = auditLogs.entries.find(entry => {
            // Procurar uma entry recente (<10s) que corresponda ao autor e canal
            const timeDiff = Date.now() - entry.createdTimestamp;
            return (
              timeDiff < 10000 &&
              entry.target?.id === message.author?.id &&
              (entry.extra as any)?.channel?.id === message.channelId
            );
          });

          const deletedBy = relevantEntry
            ? `<@${relevantEntry.executor?.id}> (${relevantEntry.executor?.tag})`
            : '_Próprio autor ou desconhecido_';

          // Atualizar o embed com a informação de quem deletou
          const updatedEmbed = EmbedBuilder.from(logMessage.embeds[0])
            .setFooter({ text: `ID: ${message.id}` })
            .addFields({ name: '🗑️ Deletada por', value: deletedBy, inline: true });

          await logMessage.edit({ embeds: [updatedEmbed] });
        } catch (err) {
          logger.warn('Não foi possível consultar Audit Log para deleção de mensagem:', err);
          // Atualizar para indicar que não conseguimos verificar
          try {
            const updatedEmbed = EmbedBuilder.from(logMessage.embeds[0])
              .setFooter({ text: `ID: ${message.id} • Não foi possível verificar quem deletou` });
            await logMessage.edit({ embeds: [updatedEmbed] });
          } catch { /* ignore */ }
        }
      }, 2500); // 2.5 segundos de delay para o Audit Log atualizar

    } catch (error) {
      logger.error('Erro ao logar mensagem deletada:', error);
    }
  },
};

/**
 * Formata uma duração em milissegundos para uma string legível.
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}min`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
