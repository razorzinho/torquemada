import { Events, Role, AuditLogEvent, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { TorquemadaClient } from '../client';
import { sendLogEmbed } from '../utils/sendLogEmbed';
import { Colors } from '../utils/embeds';
import { logger } from '../utils/logger';

export default {
  name: Events.GuildRoleUpdate,
  once: false,

  async execute(oldRole: Role, newRole: Role, client: TorquemadaClient) {
    try {
      if (!newRole.guild) return;

      const guildId = newRole.guild.id;
      const changes: string[] = [];

      if (oldRole.name !== newRole.name) {
        changes.push(`**Nome:** \`${oldRole.name}\` → \`${newRole.name}\``);
      }
      if (oldRole.hexColor !== newRole.hexColor) {
        changes.push(`**Cor:** \`${oldRole.hexColor}\` → \`${newRole.hexColor}\``);
      }
      if (oldRole.hoist !== newRole.hoist) {
        changes.push(`**Exibir separadamente:** ${oldRole.hoist ? 'Sim' : 'Não'} → ${newRole.hoist ? 'Sim' : 'Não'}`);
      }
      if (oldRole.mentionable !== newRole.mentionable) {
        changes.push(`**Mencionável:** ${oldRole.mentionable ? 'Sim' : 'Não'} → ${newRole.mentionable ? 'Sim' : 'Não'}`);
      }

      // Check permission changes
      const oldPerms = new PermissionsBitField(oldRole.permissions);
      const newPerms = new PermissionsBitField(newRole.permissions);
      if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
        const added = newPerms.toArray().filter(p => !oldPerms.has(p));
        const removed = oldPerms.toArray().filter(p => !newPerms.has(p));
        if (added.length > 0) changes.push(`**Permissões adicionadas:** ${added.join(', ')}`);
        if (removed.length > 0) changes.push(`**Permissões removidas:** ${removed.join(', ')}`);
      }

      if (changes.length === 0) return;

      let executor = 'Desconhecido';
      try {
        const auditLogs = await newRole.guild.fetchAuditLogs({
          type: AuditLogEvent.RoleUpdate,
          limit: 5,
        });
        const entry = auditLogs.entries.find((e: any) => {
          const timeDiff = Date.now() - e.createdTimestamp;
          return timeDiff < 10000 && e.target?.id === newRole.id;
        });
        if (entry) executor = `<@${entry.executor?.id}>`;
      } catch { /* sem permissão */ }

      const embed = new EmbedBuilder()
        .setColor(Colors.WARNING)
        .setTitle('📋 Cargo Atualizado')
        .addFields(
          { name: '🏷️ Cargo', value: `<@&${newRole.id}> (\`${newRole.id}\`)`, inline: true },
          { name: '🛡️ Alterado por', value: executor, inline: true },
          { name: '📝 Alterações', value: changes.join('\n'), inline: false },
        )
        .setFooter({ text: `ID do Cargo: ${newRole.id}` })
        .setTimestamp();

      await sendLogEmbed({ client, guildId, eventType: 'role_update', embed });
    } catch (error) {
      logger.error('Erro ao logar role update:', error);
    }
  },
};
