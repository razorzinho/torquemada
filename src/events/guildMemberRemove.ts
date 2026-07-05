import { Events, GuildMember, TextChannel, PartialGuildMember } from 'discord.js';
import { TorquemadaClient } from '../client';
import { guildSettingsRepo } from '../database/repositories/guildSettings';
import { logEmbed, Colors } from '../utils/embeds';
import { sendLogEmbed } from '../utils/sendLogEmbed';
import { logger } from '../utils/logger';

export default {
  name: Events.GuildMemberRemove,
  once: false,

  async execute(member: GuildMember | PartialGuildMember, client: TorquemadaClient) {
    const guild = member.guild;
    const guildId = guild.id;

    try {
      const settings = await guildSettingsRepo.getSettings(guildId);
      
      if (!settings) return;

      // Farewell message
      if (settings.farewell_enabled && settings.farewell_channel) {
        const channel = guild.channels.cache.get(settings.farewell_channel) as TextChannel;
        if (channel && channel.isTextBased()) {
          const farewellMsg = (settings.farewell_message || '{username} saiu do servidor.')
            .replace(/{user}/g, `<@${member.id}>`)
            .replace(/{username}/g, member.user?.username ?? 'Desconhecido')
            .replace(/{server}/g, guild.name)
            .replace(/{membercount}/g, guild.memberCount.toString());
            
          await channel.send(farewellMsg).catch(() => {});
        }
      }

      // Logging
      const roles = member.roles.cache.filter(r => r.id !== guild.id).map(r => r.name).join(', ') || 'Nenhum';
      const embed = logEmbed('Membro Saiu', `**Membro:** <@${member.id}> (\`${member.id}\`)\n**Cargos:** ${roles}`)
        .setColor(Colors.MUTED)
        .setThumbnail(member.user?.displayAvatarURL() ?? null);

      await sendLogEmbed({ client, guildId, eventType: 'member_leave', embed });

    } catch (error) {
      logger.error('Erro no evento guildMemberRemove:', error);
    }
  },
};
