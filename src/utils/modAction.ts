import { Guild, User, EmbedBuilder } from 'discord.js';
import { TorquemadaClient } from '../client';
import { modActionsRepo } from '../database/repositories/modActions';
import { sendLogEmbed } from './sendLogEmbed';
import { Colors } from './embeds';
import { logger } from './logger';

export type ModActionType =
  | 'ban' | 'kick' | 'timeout' | 'warn'
  | 'unban' | 'softban' | 'mute' | 'unmute' | 'untimeout' | 'masmorra';

export interface ModActionOptions {
  guild: Guild;
  target: User;
  moderator: User;
  actionType: ModActionType;
  reason: string;
  duration?: string;
  details?: Record<string, any>;
  client: TorquemadaClient;
  skipDm?: boolean;
}

const ACTION_LABELS: Record<ModActionType, { emoji: string; label: string; color: string; dmVerb: string }> = {
  ban:       { emoji: '🔨', label: 'Banido',            color: Colors.ERROR as string,      dmVerb: 'banido' },
  kick:      { emoji: '👢', label: 'Expulso',           color: Colors.ERROR as string,      dmVerb: 'expulso' },
  timeout:   { emoji: '⏳', label: 'Timeout Aplicado',  color: Colors.MODERATION as string, dmVerb: 'silenciado (timeout)' },
  warn:      { emoji: '⚠️', label: 'Aviso Adicionado',  color: Colors.WARNING as string,    dmVerb: 'avisado' },
  unban:     { emoji: '🔓', label: 'Desbanido',         color: Colors.SUCCESS as string,    dmVerb: 'desbanido' },
  softban:   { emoji: '🧹', label: 'Softban Aplicado',  color: Colors.ERROR as string,      dmVerb: 'removido temporariamente (softban)' },
  mute:      { emoji: '🔇', label: 'Mutado',            color: Colors.MODERATION as string, dmVerb: 'mutado' },
  unmute:    { emoji: '🔊', label: 'Mute Removido',       color: Colors.SUCCESS as string,    dmVerb: 'desmutado' },
  untimeout: { emoji: '⏱️', label: 'Timeout Removido',    color: Colors.SUCCESS as string,    dmVerb: 'teve o timeout removido' },
  masmorra:  { emoji: '⛓️', label: 'Masmorra',          color: Colors.WARNING as string,    dmVerb: 'enviado para a masmorra' },
};

/**
 * Utilitário central de moderação.
 * Persiste a ação no DB, envia DM ao alvo e posta no canal de log.
 */
export async function modAction(options: ModActionOptions): Promise<void> {
  const { guild, target, moderator, actionType, reason, duration, details, client, skipDm } = options;
  const info = ACTION_LABELS[actionType];

  // 1. Persistir no banco de dados
  const action = await modActionsRepo.create(
    guild.id,
    target.id,
    moderator.id,
    actionType,
    reason,
    duration ?? null,
    details ?? null,
  );

  // 2. Enviar DM ao alvo (se não skipDm)
  if (!skipDm) {
    try {
      const dmLines = [
        `${info.emoji} Você foi **${info.dmVerb}** no servidor **${guild.name}**.`,
        `**Motivo:** ${reason}`,
      ];
      if (duration) dmLines.push(`**Duração:** ${duration}`);
      dmLines.push(`**Moderador:** ${moderator.tag}`);

      await target.send({ content: dmLines.join('\n') });
    } catch {
      // DMs bloqueadas — ignorar silenciosamente
    }
  }

  // 3. Postar no canal de log
  const embed = new EmbedBuilder()
    .setColor(info.color as any)
    .setTitle(`${info.emoji} ${info.label}`)
    .addFields(
      { name: '👤 Usuário', value: `<@${target.id}> (\`${target.id}\`)`, inline: true },
      { name: '🛡️ Moderador', value: `<@${moderator.id}>`, inline: true },
      { name: '📝 Motivo', value: reason, inline: false },
    )
    .setThumbnail(target.displayAvatarURL({ extension: 'png', size: 128 }))
    .setFooter({ text: `Case #${action?.id ?? '?'}` })
    .setTimestamp();

  if (duration) {
    embed.addFields({ name: '⏱️ Duração', value: duration, inline: true });
  }

  await sendLogEmbed({
    client,
    guildId: guild.id,
    eventType: 'mod_action',
    embed,
  });
}
