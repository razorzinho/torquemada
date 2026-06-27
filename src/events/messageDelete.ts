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
import { renderDiscordMessage } from '../utils/discordMessageRenderer';
import { Colors } from '../utils/embeds';
import { logger } from '../utils/logger';

export default {
  name: Events.MessageDelete,
  once: false,

  async execute(message: Message | PartialMessage, client: TorquemadaClient) {
    try {
      if (!message.guild) return;
      if (message.author?.bot) return;

      const guildId = message.guild.id;

      const logConfig = await guildSettingsRepo.getLogChannel(guildId);
      if (!logConfig?.log_channel || !logConfig.log_events?.includes('message_delete')) return;

      const logChannel = await client.channels.fetch(logConfig.log_channel).catch(() => null) as TextChannel | null;
      if (!logChannel) return;

      const authorName = message.author ? message.author.tag : 'Usuário Desconhecido';
      const authorId = message.author?.id ?? '???';
      
      // Default to default discord avatar if none
      let avatarUrl = message.author?.displayAvatarURL({ extension: 'png', size: 128 }) ?? 'https://cdn.discordapp.com/embed/avatars/0.png';
      
      const roleColor = message.member?.displayHexColor ?? '#000000';
      
      // Timestamp no formato: "Hoje às 15:30" (aproximação para visualização)
      const date = message.createdAt ?? new Date();
      const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString('pt-BR');
      const timestampStr = `${dateStr} às ${timeStr}`;

      let parsedContent = message.content || '';

      // Parse user mentions
      const userMentionRegex = /<@!?(\d+)>/g;
      let match;
      while ((match = userMentionRegex.exec(parsedContent)) !== null) {
        const id = match[1];
        const user = message.mentions?.users?.get(id) || client.users.cache.get(id);
        if (user) {
          parsedContent = parsedContent.replace(match[0], `[[@${user.username}|${id}]]`);
        }
      }

      // Parse channel mentions
      const channelMentionRegex = /<#(\d+)>/g;
      while ((match = channelMentionRegex.exec(parsedContent)) !== null) {
        const id = match[1];
        const channel = message.mentions?.channels?.get(id) || client.channels.cache.get(id);
        if (channel) {
          parsedContent = parsedContent.replace(match[0], `[[#${(channel as any).name}|${id}]]`);
        }
      }
      
      const mockupAttachment = await renderDiscordMessage({
        avatarUrl: avatarUrl,
        username: authorName,
        roleColor: roleColor,
        timestamp: timestampStr,
        content: parsedContent,
        guildName: message.guild.name,
        guildIconUrl: message.guild.iconURL({ extension: 'png', size: 64 }),
        channelName: (message.channel as any).name ?? 'canal',
        channelId: message.channelId,
        guildId: message.guildId ?? '?',
        userId: authorId,
        messageId: message.id,
      });

      // Truncar conteúdo bruto original para caber na description (limite 4096 do Discord)
      const maxContentLength = 3900;
      const rawContent = message.content || '';
      const safeContent = rawContent.length > maxContentLength 
        ? rawContent.substring(0, maxContentLength) + '\n... [conteúdo truncado]' 
        : rawContent || '*Mensagem sem texto, apenas mídias.*';

      const embed = new EmbedBuilder()
        .setColor(Colors.ERROR)
        .setAuthor({
          name: `Mensagem deletada em #${(message.channel as any).name ?? 'canal'}`,
          iconURL: avatarUrl,
        })
        .setDescription(`**Conteúdo original:**\n\`\`\`\n${safeContent.replace(/```/g, '\\`\\`\\`')}\n\`\`\``)
        .addFields({ name: '👤 Autor', value: `<@${authorId}> (\`${authorId}\`)`, inline: false })
        .setFooter({ text: `ID: ${message.id} • Deletada por: verificando...` })
        .setTimestamp();

      const files = [mockupAttachment];

      // Persistir anexos via download
      if (message.attachments && message.attachments.size > 0) {
        const attachmentInfos = message.attachments.map(a => ({
          url: a.url,
          name: a.name ?? `anexo_${a.id}`,
        }));

        const downloaded = await downloadAttachments(attachmentInfos);
        files.push(...downloaded);

        const attachmentList = message.attachments
          .map(a => {
            const wasDownloaded = downloaded.some(d => d.name === (a.name ?? `anexo_${a.id}`));
            return wasDownloaded
              ? `✅ \`${a.name ?? 'arquivo'}\` (persistido)`
              : `⚠️ [\`${a.name ?? 'arquivo'}\`](${a.url}) _(URL pode expirar)_`;
          })
          .join('\n');

        embed.addFields({
          name: 'Anexos da Mensagem',
          value: attachmentList.length > 1024
            ? attachmentList.substring(0, 1021) + '...'
            : attachmentList,
          inline: false,
        });
      }

      const logMessage = await logChannel.send({ embeds: [embed], files });

      // --- Fase 2: Consultar Audit Log após delay para identificar quem deletou ---
      setTimeout(async () => {
        try {
          const auditLogs = await message.guild!.fetchAuditLogs({
            type: AuditLogEvent.MessageDelete,
            limit: 5,
          });

          const relevantEntry = auditLogs.entries.find(entry => {
            const timeDiff = Date.now() - entry.createdTimestamp;
            return (
              timeDiff < 10000 &&
              entry.target?.id === message.author?.id &&
              (entry.extra as any)?.channel?.id === message.channelId
            );
          });

          const deletedBy = relevantEntry
            ? `<@${relevantEntry.executor?.id}> (${relevantEntry.executor?.tag})`
            : 'Próprio autor ou desconhecido';

          const updatedEmbed = EmbedBuilder.from(logMessage.embeds[0])
            .setFooter({ text: `ID: ${message.id} • Deletada por: ${deletedBy}` });

          await logMessage.edit({ embeds: [updatedEmbed] });
        } catch (err) {
          try {
            const updatedEmbed = EmbedBuilder.from(logMessage.embeds[0])
              .setFooter({ text: `ID: ${message.id} • Deletada por: autor ou falha na verificação` });
            await logMessage.edit({ embeds: [updatedEmbed] });
          } catch { /* ignore */ }
        }
      }, 2500);

    } catch (error) {
      logger.error('Erro ao logar mensagem deletada:', error);
    }
  },
};
