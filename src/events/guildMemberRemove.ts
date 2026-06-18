import { Events, GuildMember, TextChannel, PartialGuildMember } from 'discord.js';
import { guildSettingsRepo } from '../database/repositories/guildSettings';
import { logEmbed } from '../utils/embeds';
import { logger } from '../utils/logger';

export default {
  name: Events.GuildMemberRemove,
  once: false,

  async execute(member: GuildMember | PartialGuildMember) {
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
            .replace(/{username}/g, member.user.username)
            .replace(/{server}/g, guild.name)
            .replace(/{membercount}/g, guild.memberCount.toString());
            
          await channel.send(farewellMsg).catch(() => {});
        }
      }

      // Logging
      if (settings.log_channel && settings.log_events.includes('member_leave')) {
        const logChannel = guild.channels.cache.get(settings.log_channel) as TextChannel;
        if (logChannel && logChannel.isTextBased()) {
          const roles = member.roles.cache.filter(r => r.id !== guild.id).map(r => r.name).join(', ') || 'Nenhum';
          const embed = logEmbed('Membro Saiu', `**Membro:** ${member.user.tag} (${member.id})\n**Cargos:** ${roles}`)
            .setColor('Red')
            .setThumbnail(member.user.displayAvatarURL());
          await logChannel.send({ embeds: [embed] }).catch(() => {});
        }
      }

    } catch (error) {
      logger.error('Erro no evento guildMemberRemove:', error);
    }
  },
};
