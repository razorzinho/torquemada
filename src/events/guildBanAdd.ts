import { Events, AuditLogEvent } from 'discord.js';
import { TorquemadaClient } from '../client';
import { sendLogEmbed } from '../utils/sendLogEmbed';
import { Colors } from '../utils/embeds';
import { logger } from '../utils/logger';
import { EmbedBuilder } from 'discord.js';

export default {
  name: Events.GuildBanAdd,
  once: false,

  async execute(ban: any, client: TorquemadaClient) {
    try {
      if (!ban.guild) return;

      const guildId = ban.guild.id;
      const user = ban.user;

      let executor = 'Desconhecido';
      let reason = ban.reason ?? 'Sem motivo informado';

      try {
        const auditLogs = await ban.guild.fetchAuditLogs({
          type: AuditLogEvent.MemberBanAdd,
          limit: 5,
        });

        const entry = auditLogs.entries.find((e: any) => {
          const timeDiff = Date.now() - e.createdTimestamp;
          return timeDiff < 10000 && e.target?.id === user.id;
        });

        if (entry) {
          executor = `<@${entry.executor?.id}>`;
          if (entry.reason) reason = entry.reason;
        }
      } catch {
        // Sem permissão para audit log
      }

      const embed = new EmbedBuilder()
        .setColor(Colors.ERROR)
        .setTitle('🔨 Membro Banido')
        .addFields(
          { name: '👤 Usuário', value: `<@${user.id}> (\`${user.id}\`)`, inline: true },
          { name: '🛡️ Banido por', value: executor, inline: true },
          { name: '📝 Motivo', value: reason, inline: false },
        )
        .setThumbnail(user.displayAvatarURL({ extension: 'png', size: 128 }))
        .setFooter({ text: `ID: ${user.id}` })
        .setTimestamp();

      await sendLogEmbed({ client, guildId, eventType: 'member_ban', embed });
    } catch (error) {
      logger.error('Erro ao logar ban:', error);
    }
  },
};
