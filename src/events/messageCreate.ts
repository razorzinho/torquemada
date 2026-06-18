import {
  Events,
  Message,
  GuildMember,
  PermissionFlagsBits,
} from 'discord.js';
import { TorquemadaClient } from '../client';
import { automodRepo } from '../database/repositories/automod';
import { AutomodConfig } from '../types/database';
import { logger } from '../utils/logger';

// In-memory spam tracker: Map<guildId:userId, { count, firstTimestamp }>
const spamTracker = new Map<string, { count: number; timer: NodeJS.Timeout }>();

// URL regex pattern
const URL_REGEX = /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/gi;

// Cleanup interval for stale spam entries (every 30 seconds)
setInterval(() => {
  // The timers self-clean, but this is a safety net
  const now = Date.now();
  for (const [key] of spamTracker) {
    // Entries are cleaned by their own timers
    void key;
  }
}, 30_000);

export default {
  name: Events.MessageCreate,
  once: false,

  async execute(message: Message, client: TorquemadaClient) {
    try {
      // Ignore DMs, bots, and system messages
      if (!message.guild) return;
      if (message.author.bot) return;
      if (!message.member) return;

      // Ignore members with ManageMessages permission
      if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

      const guildId = message.guild.id;

      // Fetch automod config
      const config = await automodRepo.getConfig(guildId);
      if (!config || !config.enabled) return;

      // Run all checks
      const violated = await runChecks(message, config, client);
      if (violated) {
        logger.debug(`AutoMod: Violação detectada para ${message.author.tag} em ${guildId}`);
      }
    } catch (error) {
      logger.error('Erro no automod (messageCreate):', error);
    }
  },
};

async function runChecks(
  message: Message,
  config: AutomodConfig,
  _client: TorquemadaClient,
): Promise<boolean> {
  // Check anti-spam
  if (config.antispam_enabled) {
    const isSpam = checkSpam(message, config.antispam_threshold);
    if (isSpam) {
      await takeAction(message, config.antispam_action, 'Anti-Spam: mensagens enviadas muito rápido');
      return true;
    }
  }

  // Check anti-link
  if (config.antilink_enabled) {
    const hasLink = checkLinks(message, config.antilink_whitelist);
    if (hasLink) {
      await takeAction(message, config.antilink_action, 'Anti-Link: links não são permitidos');
      return true;
    }
  }

  // Check badwords
  if (config.badwords && config.badwords.length > 0) {
    const hasBadword = checkBadwords(message, config.badwords);
    if (hasBadword) {
      await takeAction(message, config.badwords_action, 'AutoMod: palavra proibida detectada');
      return true;
    }
  }

  // Check max mentions
  if (config.max_mentions > 0) {
    const tooManyMentions = checkMentions(message, config.max_mentions);
    if (tooManyMentions) {
      await takeAction(message, config.max_mentions_action, 'AutoMod: muitas menções na mensagem');
      return true;
    }
  }

  return false;
}

/**
 * Tracks message count per user and returns true if threshold is exceeded within 5 seconds.
 */
function checkSpam(message: Message, threshold: number): boolean {
  const key = `${message.guild!.id}:${message.author.id}`;
  const entry = spamTracker.get(key);

  if (entry) {
    entry.count++;
    if (entry.count >= threshold) {
      // Reset the counter after triggering
      clearTimeout(entry.timer);
      spamTracker.delete(key);
      return true;
    }
  } else {
    // Create new entry with 5-second timer
    const timer = setTimeout(() => {
      spamTracker.delete(key);
    }, 5000);

    spamTracker.set(key, { count: 1, timer });
  }

  return false;
}

/**
 * Checks if the message contains links not in the whitelist.
 */
function checkLinks(message: Message, whitelist: string[]): boolean {
  const content = message.content;
  const matches = content.match(URL_REGEX);

  if (!matches) return false;

  // If no whitelist, all links are blocked
  if (!whitelist || whitelist.length === 0) return true;

  // Check if any link is NOT in the whitelist
  return matches.some(url => {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return !whitelist.some(domain =>
        hostname === domain.toLowerCase() || hostname.endsWith(`.${domain.toLowerCase()}`),
      );
    } catch {
      return true; // Invalid URL = blocked
    }
  });
}

/**
 * Checks if the message contains any badwords (case-insensitive).
 */
function checkBadwords(message: Message, badwords: string[]): boolean {
  const content = message.content.toLowerCase();
  return badwords.some(word => content.includes(word));
}

/**
 * Checks if the message has too many mentions.
 */
function checkMentions(message: Message, maxMentions: number): boolean {
  const totalMentions = message.mentions.users.size + message.mentions.roles.size;
  return totalMentions > maxMentions;
}

/**
 * Takes the configured action against the message/member.
 */
async function takeAction(
  message: Message,
  action: string,
  reason: string,
): Promise<void> {
  const member = message.member as GuildMember;

  // Always try to delete the offending message
  try {
    if (message.deletable) {
      await message.delete();
    }
  } catch (error) {
    logger.error('AutoMod: Erro ao deletar mensagem:', error);
  }

  switch (action) {
    case 'delete':
      // Message already deleted above
      break;

    case 'warn':
      try {
        const warning = await (message.channel as any).send({
          content: `⚠️ ${member}, ${reason}.`,
        });
        // Auto-delete warning after 5 seconds
        setTimeout(() => {
          warning.delete().catch(() => {});
        }, 5000);
      } catch (error) {
        logger.error('AutoMod: Erro ao enviar aviso:', error);
      }
      break;

    case 'timeout':
      try {
        await member.timeout(60_000, `[AutoMod] ${reason}`); // 1 minute timeout
        const warning = await (message.channel as any).send({
          content: `🔇 ${member} foi silenciado por 1 minuto. Motivo: ${reason}.`,
        });
        setTimeout(() => {
          warning.delete().catch(() => {});
        }, 5000);
      } catch (error) {
        logger.error('AutoMod: Erro ao aplicar timeout:', error);
      }
      break;

    case 'kick':
      try {
        const kickMsg = await (message.channel as any).send({
          content: `👢 ${member.user.tag} foi expulso. Motivo: ${reason}.`,
        });
        await member.kick(`[AutoMod] ${reason}`);
        setTimeout(() => {
          kickMsg.delete().catch(() => {});
        }, 10000);
      } catch (error) {
        logger.error('AutoMod: Erro ao expulsar membro:', error);
      }
      break;

    case 'ban':
      try {
        const banMsg = await (message.channel as any).send({
          content: `🔨 ${member.user.tag} foi banido. Motivo: ${reason}.`,
        });
        await member.ban({ reason: `[AutoMod] ${reason}` });
        setTimeout(() => {
          banMsg.delete().catch(() => {});
        }, 10000);
      } catch (error) {
        logger.error('AutoMod: Erro ao banir membro:', error);
      }
      break;
  }
}
