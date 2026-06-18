import { EmbedBuilder, ColorResolvable } from 'discord.js';

const Colors = {
  SUCCESS: '#2ecc71' as ColorResolvable,
  ERROR: '#e74c3c' as ColorResolvable,
  WARNING: '#f39c12' as ColorResolvable,
  INFO: '#3498db' as ColorResolvable,
  MODERATION: '#e91e63' as ColorResolvable,
  LOGGING: '#9b59b6' as ColorResolvable,
  PURGE: '#e67e22' as ColorResolvable,
};

export function successEmbed(title: string, description?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.SUCCESS)
    .setTitle(`✅ ${title}`)
    .setDescription(description ?? null)
    .setTimestamp();
}

export function errorEmbed(title: string, description?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.ERROR)
    .setTitle(`❌ ${title}`)
    .setDescription(description ?? null)
    .setTimestamp();
}

export function warningEmbed(title: string, description?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.WARNING)
    .setTitle(`⚠️ ${title}`)
    .setDescription(description ?? null)
    .setTimestamp();
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTitle(title)
    .setDescription(description ?? null)
    .setTimestamp();
}

export function moderationEmbed(title: string, description?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.MODERATION)
    .setTitle(`🔨 ${title}`)
    .setDescription(description ?? null)
    .setTimestamp();
}

export function logEmbed(title: string, description?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.LOGGING)
    .setTitle(`📋 ${title}`)
    .setDescription(description ?? null)
    .setTimestamp();
}

export function purgeEmbed(title: string, description?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.PURGE)
    .setTitle(`🧹 ${title}`)
    .setDescription(description ?? null)
    .setTimestamp();
}

export function progressEmbed(current: number, total: number, label: string): EmbedBuilder {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round(percentage / 5);
  const empty = 20 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  return new EmbedBuilder()
    .setColor(Colors.PURGE)
    .setTitle(`🧹 ${label}`)
    .setDescription(`${bar} ${percentage}%\n\n**${current}** / **${total}** mensagens`)
    .setTimestamp();
}

export { Colors };
