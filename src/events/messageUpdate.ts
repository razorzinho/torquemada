import {
  Events,
  Message,
  PartialMessage,
  TextChannel,
} from 'discord.js';
import { TorquemadaClient } from '../client';
import { guildSettingsRepo } from '../database/repositories/guildSettings';
import { logEmbed } from '../utils/embeds';
import { logger } from '../utils/logger';

export default {
  name: Events.MessageUpdate,
  once: false,

  async execute(
    oldMessage: Message | PartialMessage,
    newMessage: Message | PartialMessage,
    client: TorquemadaClient,
  ) {
    try {
      // Ignore DMs
      if (!newMessage.guild) return;

      // Ignore bot messages
      if (newMessage.author?.bot) return;

      // Ignore embed-only updates (no actual content change)
      if (oldMessage.content === newMessage.content) return;

      // If old message is partial, try to fetch it — but it might not be cached
      if (oldMessage.partial) {
        try {
          await oldMessage.fetch();
        } catch {
          // Old message not in cache, skip
          return;
        }
      }

      // If new message is partial, fetch it
      if (newMessage.partial) {
        try {
          await newMessage.fetch();
        } catch {
          return;
        }
      }

      // Skip if content is empty (shouldn't happen after fetch, but safe guard)
      if (!oldMessage.content && !newMessage.content) return;

      const guildId = newMessage.guild.id;

      // Check if logging is configured for this event
      const logConfig = await guildSettingsRepo.getLogChannel(guildId);
      if (!logConfig?.log_channel || !logConfig.log_events?.includes('message_edit')) return;

      const logChannel = await client.channels.fetch(logConfig.log_channel).catch(() => null) as TextChannel | null;
      if (!logChannel) return;

      const author = newMessage.author
        ? `${newMessage.author.tag} (${newMessage.author.id})`
        : 'Desconhecido';

      const oldContent = oldMessage.content
        ? oldMessage.content.length > 1024
          ? oldMessage.content.substring(0, 1021) + '...'
          : oldMessage.content
        : '_Conteúdo anterior não disponível_';

      const newContent = newMessage.content
        ? newMessage.content.length > 1024
          ? newMessage.content.substring(0, 1021) + '...'
          : newMessage.content
        : '_Conteúdo novo não disponível_';

      const jumpLink = newMessage.url;

      const embed = logEmbed('Mensagem Editada')
        .addFields(
          {
            name: '👤 Autor',
            value: author,
            inline: true,
          },
          {
            name: '📌 Canal',
            value: `<#${newMessage.channelId}>`,
            inline: true,
          },
          {
            name: '🔗 Link',
            value: `[Ir para a mensagem](${jumpLink})`,
            inline: true,
          },
          {
            name: '📝 Conteúdo Anterior',
            value: oldContent,
            inline: false,
          },
          {
            name: '📝 Conteúdo Novo',
            value: newContent,
            inline: false,
          },
        )
        .setFooter({ text: `ID da mensagem: ${newMessage.id}` });

      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      logger.error('Erro ao logar mensagem editada:', error);
    }
  },
};
