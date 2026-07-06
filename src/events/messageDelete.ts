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
import { messageCacheRepo } from '../database/repositories/messageCache';

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

      // ==========================================
      // Ghost Logging Fallback via Cache
      // ==========================================
      const isPartial = message.partial || !message.author;
      const cachedMessage = isPartial ? await messageCacheRepo.getMessage(message.id) : null;

      let authorName = 'Usuário Desconhecido';
      let authorId = '???';
      let avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
      let roleColor = '#000000';
      let parsedContent = '';
      let date = new Date();
      let cachedAttachments: any[] = [];

      if (isPartial && cachedMessage) {
        authorId = cachedMessage.author_id;
        roleColor = cachedMessage.role_color ?? roleColor;
        parsedContent = cachedMessage.content ?? '';
        date = new Date(cachedMessage.created_at);
        cachedAttachments = cachedMessage.attachments ?? [];

        try {
          const user = await client.users.fetch(authorId);
          authorName = user.tag;
          avatarUrl = user.displayAvatarURL({ extension: 'png', size: 128 });
        } catch {
          authorName = cachedMessage.author_tag ?? 'Usuário Desconhecido';
          avatarUrl = cachedMessage.author_avatar ?? avatarUrl;
        }
      } else if (!isPartial) {
        authorName = message.author!.tag;
        authorId = message.author!.id;
        avatarUrl = message.author!.displayAvatarURL({ extension: 'png', size: 128 });
        roleColor = message.member?.displayHexColor ?? '#000000';
        parsedContent = message.content || '';
        date = message.createdAt ?? new Date();
      } else {
        // Sem mensagem original e sem cache
        parsedContent = '*O bot reiniciou e esta mensagem não foi cacheada.*';
      }
      // ==========================================

      const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString('pt-BR');
      const timestampStr = `${dateStr} às ${timeStr}`;

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
      const rawContent = (isPartial && cachedMessage ? cachedMessage.content : message.content) || '';
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
        .addFields({ name: '🗑️ Deletada por', value: '_verificando..._', inline: false })
        .setFooter({ text: `ID: ${message.id}` })
        .setTimestamp();

      const files = [mockupAttachment];

      // Persistir anexos via download
      const attachmentInfos: { url: string, name: string }[] = [];
      
      if (!isPartial && message.attachments && message.attachments.size > 0) {
        attachmentInfos.push(...message.attachments.map(a => ({
          url: a.url,
          name: a.name ?? `anexo_${a.id}`,
        })));
      } else if (isPartial && cachedAttachments.length > 0) {
        attachmentInfos.push(...cachedAttachments.map((a: any, i) => ({
          url: a.url,
          name: a.name ?? `anexo_${i}.png`,
        })));
      }

      if (attachmentInfos.length > 0) {
        const downloaded = await downloadAttachments(attachmentInfos);
        files.push(...downloaded);

        const attachmentList = attachmentInfos
          .map(a => {
            const wasDownloaded = downloaded.some(d => d.name === a.name);
            return wasDownloaded
              ? `✅ \`${a.name}\` (persistido)`
              : `⚠️ [\`${a.name}\`](${a.url}) _(URL pode expirar)_`;
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
            ? `<@${relevantEntry.executor?.id}> (\`${relevantEntry.executor?.id}\`)`
            : '_Próprio autor ou desconhecido_';

          const previousEmbed = EmbedBuilder.from(logMessage.embeds[0]);
          const fields = previousEmbed.data.fields ?? [];
          const deletedByIdx = fields.findIndex(f => f.name === '🗑️ Deletada por');
          if (deletedByIdx !== -1) fields[deletedByIdx].value = deletedBy;
          const updatedEmbed = previousEmbed.setFields(fields);

          await logMessage.edit({ embeds: [updatedEmbed] });
        } catch (err) {
          try {
            const previousEmbed = EmbedBuilder.from(logMessage.embeds[0]);
            const fields = previousEmbed.data.fields ?? [];
            const deletedByIdx = fields.findIndex(f => f.name === '🗑️ Deletada por');
            if (deletedByIdx !== -1) fields[deletedByIdx].value = '_Autor ou falha na verificação_';
            const updatedEmbed = previousEmbed.setFields(fields);
            await logMessage.edit({ embeds: [updatedEmbed] });
          } catch { /* ignore */ }
        }
      }, 2500);

    } catch (error) {
      logger.error('Erro ao logar mensagem deletada:', error);
    }
  },
};
