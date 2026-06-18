import { Events, Client, ActivityType } from 'discord.js';
import { logger } from '../utils/logger';

export default {
  name: Events.ClientReady,
  once: true,

  execute(client: Client) {
    logger.success(`Bot iniciado como ${client.user?.tag}`);
    const guildCount = client.guilds.cache.size;
    
    client.user?.setActivity({
      name: `over ${guildCount} servers`,
      type: ActivityType.Watching,
    });
  },
};
