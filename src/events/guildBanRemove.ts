import { Events, AuditLogEvent, EmbedBuilder } from 'discord.js';
import { TorquemadaClient } from '../client';
import { sendLogEmbed } from '../utils/sendLogEmbed';
import { Colors } from '../utils/embeds';
import { logger } from '../utils/logger';

export default {
  name: Events.GuildBanRemove,
  once: false,

  async execute(ban: any, client: TorquemadaClient) {
    try {
      if (!ban.guild) return;

      const guildId = ban.guild.id;
      const user = ban.user;

      let executor = 'Desconhecido';

      try {
        const auditLogs = await ban.guild.fetchAuditLogs({
          type: AuditLogEvent.MemberBanRemove,
          limit: 5,
        });

        const entry = auditLogs.entries.find((e: any) => {
          const timeDiff = Date.now() - e.createdTimestamp;
          return timeDiff < 10000 && e.target?.id === user.id;
        });

        if (entry) {
          executor = `<@${entry.executor?.id}>`;
        }
      } catch {
        // Sem permissão para audit log
      }

      const embed = new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle('🔓 Membro Desbanido')
        .addFields(
          { name: '👤 Usuário', value: `<@${user.id}> (\`${user.id}\`)`, inline: true },
          { name: '🛡️ Desbanido por', value: executor, inline: true },
        )
        .setThumbnail(user.displayAvatarURL({ extension: 'png', size: 128 }))
        .setFooter({ text: `ID: ${user.id}` })
        .setTimestamp();

      await sendLogEmbed({ client, guildId, eventType: 'member_unban', embed });
    } catch (error) {
      logger.error('Erro ao logar unban:', error);
    }
  },
};
