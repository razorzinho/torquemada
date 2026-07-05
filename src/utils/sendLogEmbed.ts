import { EmbedBuilder, AttachmentBuilder, TextChannel } from 'discord.js';
import { TorquemadaClient } from '../client';
import { guildSettingsRepo } from '../database/repositories/guildSettings';
import { logger } from './logger';

/**
 * Utilitário centralizado para envio de embeds no canal de log.
 * Elimina duplicação e garante consistência no acesso ao DB, fetch de canal e null safety.
 */
export async function sendLogEmbed(options: {
  client: TorquemadaClient;
  guildId: string;
  eventType: string;
  embed: EmbedBuilder;
  files?: AttachmentBuilder[];
}): Promise<void> {
  const { client, guildId, eventType, embed, files } = options;

  try {
    const logConfig = await guildSettingsRepo.getLogChannel(guildId);
    if (!logConfig?.log_channel || !logConfig.log_events?.includes(eventType)) return;

    const logChannel = await client.channels.fetch(logConfig.log_channel).catch(() => null) as TextChannel | null;
    if (!logChannel) return;

    await logChannel.send({ embeds: [embed], files: files ?? [] });
  } catch (error) {
    logger.error(`Erro ao enviar log embed (${eventType}) para guild ${guildId}:`, error);
  }
}
