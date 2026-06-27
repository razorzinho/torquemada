import {
  Events,
  Message,
  PartialMessage,
  TextChannel,
} from 'discord.js';
import { TorquemadaClient } from '../client';
import { guildSettingsRepo } from '../database/repositories/guildSettings';
import { logEmbed } from '../utils/embeds';
import { renderDiscordMessage } from '../utils/discordMessageRenderer';
import { logger } from '../utils/logger';

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
      if (oldMessage.content === newMessage.content) return;

      if (oldMessage.partial) {
        try { await oldMessage.fetch(); } catch { return; }
      }
      if (newMessage.partial) {
        try { await newMessage.fetch(); } catch { return; }
      }

      if (!oldMessage.content && !newMessage.content) return;

      const guildId = newMessage.guild.id;
      const logConfig = await guildSettingsRepo.getLogChannel(guildId);
      if (!logConfig?.log_channel || !logConfig.log_events?.includes('message_edit')) return;

      const logChannel = await client.channels.fetch(logConfig.log_channel).catch(() => null) as TextChannel | null;
      if (!logChannel) return;

      const author = newMessage.author
        ? `${newMessage.author.tag} (${newMessage.author.id})`
        : 'Desconhecido';

      const oldRaw = oldMessage.content || '';
      const newRaw = newMessage.content || '';

      const maxLen = 1000;
      const oldTrunc = oldRaw.length > maxLen ? oldRaw.substring(0, maxLen - 3) + '...' : oldRaw || '*Vazio*';
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
        content: parseMentions(oldRaw, oldMessage, client),
        headerPrefix: 'Conteúdo ANTERIOR da mensagem no servidor ',
      });
      // Override the file name to avoid duplicate collision in the array
      mockupOld.setName('old_message.png');

      const mockupNew = await renderDiscordMessage({
        ...baseOptions,
        content: parseMentions(newRaw, newMessage, client),
        headerPrefix: 'Conteúdo NOVO da mensagem editada no servidor ',
      });
      mockupNew.setName('new_message.png');

      const embed = logEmbed('Mensagem Editada')
        .addFields(
          { name: '👤 Autor', value: author, inline: true },
          { name: '📌 Canal', value: `<#${newMessage.channelId}>`, inline: true },
          { name: '🔗 Link', value: `[Ir para a mensagem](${newMessage.url})`, inline: true },
          { name: '📝 Conteúdo Anterior', value: `\`\`\`\n${oldTrunc.replace(/```/g, '\\`\\`\\`')}\n\`\`\``, inline: false },
          { name: '📝 Conteúdo Novo', value: `\`\`\`\n${newTrunc.replace(/```/g, '\\`\\`\\`')}\n\`\`\``, inline: false },
        )
        .setFooter({ text: `ID da mensagem: ${newMessage.id}` });

      await logChannel.send({ embeds: [embed], files: [mockupOld, mockupNew] });
    } catch (error) {
      logger.error('Erro ao logar mensagem editada:', error);
    }
  },
};
