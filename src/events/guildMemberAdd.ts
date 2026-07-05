import { Events, GuildMember, TextChannel } from 'discord.js';
import { TorquemadaClient } from '../client';
import { guildSettingsRepo } from '../database/repositories/guildSettings';
import { logEmbed, Colors } from '../utils/embeds';
import { sendLogEmbed } from '../utils/sendLogEmbed';
import { logger } from '../utils/logger';

export default {
  name: Events.GuildMemberAdd,
  once: false,

  async execute(member: GuildMember, client: TorquemadaClient) {
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
      const embed = logEmbed('Membro Entrou', `**Membro:** <@${member.id}> (\`${member.id}\`)\n**Criou a conta em:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`)
        .setColor(Colors.SUCCESS)
        .setThumbnail(member.user.displayAvatarURL());

      await sendLogEmbed({ client, guildId, eventType: 'member_join', embed });

    } catch (error) {
      logger.error('Erro no evento guildMemberAdd:', error);
    }
  },
};
