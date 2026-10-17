import {
  Events,
  Message,
  GuildMember,
  PermissionFlagsBits,
  EmbedBuilder,
  TextChannel,
} from 'discord.js';
import { TorquemadaClient } from '../client';
import {
  automodRepo,
  BADWORD_PUNISHMENT_DESCRIPTIONS,
  BADWORD_PUNISHMENT_SHORT_LABELS,
} from '../database/repositories/automod';
import { guildSettingsRepo } from '../database/repositories/guildSettings';
import { messageCacheRepo } from '../database/repositories/messageCache';
import { modActionsRepo } from '../database/repositories/modActions';
import { AutomodConfig, BadwordPunishment } from '../types/database';
import {
  DEFAULT_BADWORDS_PRESET,
  BlockedWordMatch,
  findBlockedWordDetailed,
} from '../utils/textNormalizer';
import { Colors } from '../utils/embeds';
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

function getFallbackConfig(guildId: string): AutomodConfig {
  return {
    guild_id: guildId,
    enabled: true,
    log_channel_id: null,
    antispam_enabled: false,
    antispam_threshold: 5,
    antispam_action: 'timeout',
    antilink_enabled: false,
    antilink_whitelist: [],
    antilink_action: 'delete',
    badwords: DEFAULT_BADWORDS_PRESET,
    badwords_action: 'warn',
    badwords_severe_action: 'timeout',
    max_mentions: 0,
    max_mentions_action: 'delete',
  };
}

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

      // ==========================================
      // Cache Persistente de Mensagens
      // ==========================================
      const attachments = message.attachments.size > 0 
        ? message.attachments.map(a => ({ url: a.url, name: a.name, contentType: a.contentType }))
        : null;

      // Roda assincronamente (não usa await para não travar o fluxo)
      messageCacheRepo.saveMessage({
        id: message.id,
        guild_id: guildId,
        channel_id: message.channelId,
        author_id: message.author.id,
        author_tag: message.author.tag,
        author_avatar: message.author.displayAvatarURL({ extension: 'png', size: 128 }),
        role_color: message.member.displayHexColor ?? '#000000',
        content: message.content || null,
        attachments: attachments,
      });

      // Cleanup Ocasional (1% de chance de rodar na criação de mensagem para evitar gargalos)
      if (Math.random() < 0.01) {
        guildSettingsRepo.getLogChannel(guildId).then(settings => {
          const retentionDays = settings?.message_log_retention_days ?? 30;
          messageCacheRepo.cleanupOldMessages(guildId, retentionDays).catch(() => {});
        }).catch(() => {});
      }
      // ==========================================

      // Fetch automod config (com fallback em memória caso o DB falhe)
      const config = (await automodRepo.getConfig(guildId)) ?? getFallbackConfig(guildId);
      if (!config.enabled) return;

      // Run all checks
      await runChecks(message, config, client, false);
    } catch (error) {
      logger.error('Erro no automod (messageCreate):', error);
    }
  },
};

async function runChecks(
  message: Message,
  config: AutomodConfig,
  client: TorquemadaClient,
  isEdit = false,
): Promise<boolean> {
  // Check anti-spam (only on new messages, not edits)
  if (!isEdit && config.antispam_enabled) {
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

  // Check badwords (com motor anti-ofuscação e 2 níveis de severidade configuráveis)
  const activeBadwords =
    config.badwords && config.badwords.length > 0 ? config.badwords : DEFAULT_BADWORDS_PRESET;

  if (activeBadwords.length > 0) {
    const match = checkBadwords(message, activeBadwords);
    if (match) {
      const isSevere = match.severity === 'severe';
      const punishment: BadwordPunishment = isSevere
        ? (config.badwords_severe_action ?? 'timeout')
        : (config.badwords_action ?? 'warn');

      const reason = isSevere
        ? 'AutoMod: ofensa grave ou palavra proibida detectada'
        : 'AutoMod: termo ou assunto restrito detectado';

      // 1. Executa a ação de punição imediatamente (deleta a mensagem + aplica punição do tier)
      await takeAction(message, punishment, reason);

      // 2. Registra no logger (console + banco de dados + canal de logs do AutoMod/servidor)
      await logBadwordViolation(message, client, config, match, punishment, isEdit);

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
 * Registra detalhadamente a detecção de palavra proibida no console, no banco (mod_actions)
 * e no canal de logs do AutoMod (ou canal de logs geral do servidor), destacando o trecho exato
 * encontrado e a decisão de punição.
 */
async function logBadwordViolation(
  message: Message,
  client: TorquemadaClient,
  config: AutomodConfig,
  match: BlockedWordMatch,
  punishment: BadwordPunishment,
  isEdit: boolean,
): Promise<void> {
  const guild = message.guild!;
  const author = message.author;
  const isSevere = match.severity === 'severe';
  const tierLabel = isSevere
    ? '🔇 Nível 1 — Ofensas Graves'
    : '⚠️ Nível 2 — Termos Restritos / Debates / Memes';
  const punishmentWritten =
    BADWORD_PUNISHMENT_DESCRIPTIONS[punishment] ?? BADWORD_PUNISHMENT_DESCRIPTIONS.warn;
  const punishmentShort =
    BADWORD_PUNISHMENT_SHORT_LABELS[punishment] ?? BADWORD_PUNISHMENT_SHORT_LABELS.warn;
  const channelName = (message.channel as any)?.name
    ? `#${(message.channel as any).name}`
    : message.channelId;

  // 1. Log detalhado no Console
  logger.automod(
    `Mensagem flagada${isEdit ? ' (edição)' : ''} | ` +
      `Servidor: ${guild.name} (${guild.id}) | ` +
      `Canal: ${channelName} | ` +
      `Autor: ${author.tag} (${author.id}) | ` +
      `Tier: ${isSevere ? 'Nível 1 (Grave)' : 'Nível 2 (Restrito)'} | ` +
      `Regra acionada: "${match.word}" | ` +
      `Trecho exato encontrado: "${match.matchedText}" | ` +
      `Mensagem destacada: "${match.highlightedText}" | ` +
      `Decisão de punição: ${punishment.toUpperCase()} (${punishmentWritten})`,
  );

  // 2. Persistir no histórico de moderação (mod_actions)
  let caseId: number | null = null;
  try {
    const modRecord = await modActionsRepo.create(
      guild.id,
      author.id,
      client.user?.id ?? 'automod',
      `automod_${punishment}`,
      `AutoMod (${isSevere ? 'Nível 1' : 'Nível 2'}): palavra/trecho "${match.matchedText}" (regra: ${match.word})`,
      punishment === 'timeout' ? '1m' : null,
      {
        rule: match.word,
        matched_text: match.matchedText,
        highlighted_text: match.highlightedText,
        tier: match.severity,
        punishment,
        channel_id: message.channelId,
        is_edit: isEdit,
      },
    );
    caseId = modRecord?.id ?? null;
  } catch (err) {
    logger.error('Erro ao registrar ação do AutoMod em mod_actions:', err);
  }

  // 3. Enviar Embed detalhado para o canal de logs do AutoMod (ou fallback para /setlog)
  try {
    let targetLogChannelId = config.log_channel_id ?? null;
    if (!targetLogChannelId) {
      const logConfig = await guildSettingsRepo.getLogChannel(guild.id);
      targetLogChannelId = logConfig?.log_channel ?? null;
    }
    if (!targetLogChannelId) return;

    const logChannel = (await client.channels
      .fetch(targetLogChannelId)
      .catch(() => null)) as TextChannel | null;
    if (!logChannel) return;

    const truncatedHighlighted =
      match.highlightedText.length > 1000
        ? match.highlightedText.slice(0, 997) + '...'
        : match.highlightedText;

    const embed = new EmbedBuilder()
      .setColor(isSevere ? Colors.ERROR : Colors.WARNING)
      .setTitle(`🛡️ AutoMod — Mensagem Flagada${isEdit ? ' (Edição)' : ''}`)
      .setDescription(
        `Uma mensagem de <@${author.id}> foi interceptada pelo filtro anti-ofuscação no canal <#${message.channelId}>.`,
      )
      .addFields(
        {
          name: '👤 Autor',
          value: `<@${author.id}> (\`${author.id}\`)`,
          inline: true,
        },
        {
          name: '📍 Canal',
          value: `<#${message.channelId}>`,
          inline: true,
        },
        {
          name: '📊 Classificação (Tier)',
          value: tierLabel,
          inline: true,
        },
        {
          name: '🎯 Trecho Exato Encontrado',
          value: `\`${match.matchedText.replace(/`/g, "'")}\``,
          inline: true,
        },
        {
          name: '📏 Regra Acionada',
          value: `\`${match.word}\``,
          inline: true,
        },
        {
          name: '⚖️ Decisão de Punição',
          value: `**${punishmentShort}**\n_${punishmentWritten}_`,
          inline: false,
        },
        {
          name: '💬 Mensagem com Destaque da Infração',
          value: truncatedHighlighted || '_Mensagem vazia_',
          inline: false,
        },
      )
      .setThumbnail(author.displayAvatarURL({ extension: 'png', size: 128 }))
      .setFooter({
        text: caseId
          ? `Case #${caseId} • ID da Mensagem: ${message.id}`
          : `ID da Mensagem: ${message.id}`,
      })
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    logger.error(`Erro ao enviar log de AutoMod para o servidor ${guild.id}:`, error);
  }
}

/**
 * Executa as checagens do AutoMod quando uma mensagem existente é editada.
 */
export async function runAutomodOnEdit(message: Message, client: TorquemadaClient): Promise<boolean> {
  try {
    if (!message.guild || message.author?.bot || !message.member) return false;
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

    const config = (await automodRepo.getConfig(message.guild.id)) ?? getFallbackConfig(message.guild.id);
    if (!config.enabled) return false;

    return await runChecks(message, config, client, true);
  } catch (error) {
    logger.error('Erro no automod (messageUpdate):', error);
    return false;
  }
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
 * Checks if the message contains any badwords using the smart anti-obfuscation engine.
 */
function checkBadwords(message: Message, badwords: string[]): BlockedWordMatch | null {
  return findBlockedWordDetailed(message.content, badwords);
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
