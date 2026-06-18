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
        ? `${message.author.tag} (${message.author.id})`
        : 'Desconhecido (mensagem não estava em cache)';

      const content = message.content
        ? message.content.length > 1024
          ? message.content.substring(0, 1021) + '...'
          : message.content
        : '_Conteúdo não disponível (mensagem não estava em cache)_';

      const embed = logEmbed('Mensagem Deletada')
        .addFields(
          {
            name: '👤 Autor',
            value: author,
            inline: true,
          },
          {
            name: '📌 Canal',
            value: `<#${message.channelId}>`,
            inline: true,
          },
          {
            name: '📝 Conteúdo',
            value: content,
            inline: false,
          },
        );

      // Add attachments info if any
      if (message.attachments && message.attachments.size > 0) {
        const attachmentList = message.attachments
          .map(a => `[${a.name ?? 'arquivo'}](${a.url})`)
          .join('\n');
        embed.addFields({
          name: `📎 Anexos (${message.attachments.size})`,
          value: attachmentList.length > 1024
            ? attachmentList.substring(0, 1021) + '...'
            : attachmentList,
          inline: false,
        });
      }

      // Add message ID
      embed.setFooter({ text: `ID da mensagem: ${message.id}` });

      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      logger.error('Erro ao logar mensagem deletada:', error);
    }
  },
};
