import { Events, GuildMember, TextChannel } from 'discord.js';
import { guildSettingsRepo } from '../database/repositories/guildSettings';
import { logEmbed } from '../utils/embeds';
import { logger } from '../utils/logger';

export default {
  name: Events.GuildMemberAdd,
  once: false,

  async execute(member: GuildMember) {
    const guild = member.guild;
    const guildId = guild.id;

    try {
      const settings = await guildSettingsRepo.getSettings(guildId);
      
      if (!settings) return;

      // Welcome message
      if (settings.welcome_enabled && settings.welcome_channel) {
        const channel = guild.channels.cache.get(settings.welcome_channel) as TextChannel;
        if (channel && channel.isTextBased()) {
          const welcomeMsg = (settings.welcome_message || 'Welcome {user} to {server}!')
            .replace(/{user}/g, member.toString())
            .replace(/{username}/g, member.user.username)
            .replace(/{server}/g, guild.name)
            .replace(/{membercount}/g, guild.memberCount.toString());
            
          await channel.send(welcomeMsg).catch(() => {});
        }
      }

      // Autorole
      if (settings.autorole_id) {
        const role = guild.roles.cache.get(settings.autorole_id);
        if (role) {
          await member.roles.add(role).catch(() => {});
        }
      }

      // Logging
      if (settings.log_channel && settings.log_events.includes('member_join')) {
        const logChannel = guild.channels.cache.get(settings.log_channel) as TextChannel;
        if (logChannel && logChannel.isTextBased()) {
          const embed = logEmbed('Membro Entrou', `**Membro:** ${member.user.tag} (${member.id})\n**Criou a conta em:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`)
            .setColor('Green')
            .setThumbnail(member.user.displayAvatarURL());
          await logChannel.send({ embeds: [embed] }).catch(() => {});
        }
      }

    } catch (error) {
      logger.error('Erro no evento guildMemberAdd:', error);
    }
  },
};
