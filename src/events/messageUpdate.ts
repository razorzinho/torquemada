import {
  Events,
  Message,
  PartialMessage,
  EmbedBuilder,
} from 'discord.js';
import { TorquemadaClient } from '../client';
import { Colors } from '../utils/embeds';
import { sendLogEmbed } from '../utils/sendLogEmbed';
import { renderDiscordMessage } from '../utils/discordMessageRenderer';
import { logger } from '../utils/logger';
import { messageCacheRepo } from '../database/repositories/messageCache';

function parseMentions(content: string, message: Message | PartialMessage, client: TorquemadaClient) {
  let parsed = content;
  const userRegex = /<@!?(\d+)>/g;
  let match;
  while ((match = userRegex.exec(parsed)) !== null) {
    const user = message.mentions?.users?.get(match[1]) || client.users.cache.get(match[1]);
    if (user) parsed = parsed.replace(match[0], `[[@${user.username}|${match[1]}]]`);
  }
  const channelRegex = /<#(\d+)>/g;
  while ((match = channelRegex.exec(parsed)) !== null) {
    const channel = message.mentions?.channels?.get(match[1]) || client.channels.cache.get(match[1]);
    if (channel) parsed = parsed.replace(match[0], `[[#${(channel as any).name}|${match[1]}]]`);
  }
  return parsed;
}

export default {
  name: Events.MessageUpdate,
  once: false,

  async execute(
    oldMessage: Message | PartialMessage,
    newMessage: Message | PartialMessage,
    client: TorquemadaClient,
  ) {
    try {
      if (!newMessage.guild) return;
      if (newMessage.author?.bot) return;

      const guildId = newMessage.guild.id;

      // ==========================================
      // Ghost Logging Fallback via Cache
      // ==========================================
      let oldRaw = oldMessage.content;
      if (oldMessage.partial) {
        const cachedMessage = await messageCacheRepo.getMessage(newMessage.id);
        if (cachedMessage && cachedMessage.content !== null) {
          oldRaw = cachedMessage.content;
        } else {
          try { await oldMessage.fetch(); oldRaw = oldMessage.content; } catch {}
        }
      }

      if (newMessage.partial) {
        try { await newMessage.fetch(); } catch { return; }
      }

      const newRaw = newMessage.content || '';
      if (!oldRaw && !newRaw) return;
      if (oldRaw === newRaw) return; // Ignore se o conteúdo não mudou (ex: embeds renderizados)

      const author = newMessage.author
        ? `<@${newMessage.author.id}> (\`${newMessage.author.id}\`)`
        : 'Desconhecido';

      const maxLen = 1000;
      const oldTrunc = oldRaw && oldRaw.length > maxLen ? oldRaw.substring(0, maxLen - 3) + '...' : oldRaw || '*Vazio*';
      const newTrunc = newRaw.length > maxLen ? newRaw.substring(0, maxLen - 3) + '...' : newRaw || '*Vazio*';

      // Gerar Mockups via Canvas
      let avatarUrl = newMessage.author?.displayAvatarURL({ extension: 'png', size: 128 }) ?? 'https://cdn.discordapp.com/embed/avatars/0.png';
      const roleColor = newMessage.member?.displayHexColor ?? '#000000';
      
      const date = newMessage.createdAt ?? new Date();
      const timestampStr = `${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      
      const baseOptions = {
        avatarUrl,
        username: newMessage.author?.tag ?? 'Usuário',
        roleColor,
        timestamp: timestampStr,
        guildName: newMessage.guild.name,
        guildIconUrl: newMessage.guild.iconURL({ extension: 'png', size: 64 }),
        channelName: (newMessage.channel as any).name ?? 'canal',
        channelId: newMessage.channelId,
        guildId: newMessage.guildId ?? '?',
        userId: newMessage.author?.id ?? '?',
        messageId: newMessage.id,
      };

      const mockupOld = await renderDiscordMessage({
        ...baseOptions,
        content: parseMentions(oldRaw || '', oldMessage, client),
        headerPrefix: 'Conteúdo ANTERIOR da mensagem no servidor ',
      });
      // Override the file name to avoid duplicate collision in the array
      mockupOld.setName('old_message.png');

      const mockupNew = await renderDiscordMessage({
        ...baseOptions,
        content: parseMentions(newRaw || '', newMessage, client),
        headerPrefix: 'Conteúdo NOVO da mensagem editada no servidor ',
      });
      mockupNew.setName('new_message.png');

      const embed = new EmbedBuilder()
        .setColor(Colors.WARNING)
        .setTitle('📋 Mensagem Editada')
        .addFields(
          { name: '👤 Autor', value: author, inline: true },
          { name: '📌 Canal', value: `<#${newMessage.channelId}>`, inline: true },
          { name: '🔗 Link', value: `[Ir para a mensagem](${newMessage.url})`, inline: true },
          { name: '📝 Conteúdo Anterior', value: `\`\`\`\n${oldTrunc.replace(/```/g, '\\`\\`\\`')}\n\`\`\``, inline: false },
          { name: '📝 Conteúdo Novo', value: `\`\`\`\n${newTrunc.replace(/```/g, '\\`\\`\\`')}\n\`\`\``, inline: false },
        )
        .setFooter({ text: `ID da mensagem: ${newMessage.id}` })
        .setTimestamp();

      await sendLogEmbed({ client, guildId, eventType: 'message_edit', embed, files: [mockupOld, mockupNew] });
    } catch (error) {
      logger.error('Erro ao logar mensagem editada:', error);
    }
  },
};
