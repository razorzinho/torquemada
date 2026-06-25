import { Events, Client, ActivityType } from 'discord.js';
import { logger } from '../utils/logger';
import { StatusManager } from '../utils/statusManager';

export default {
  name: Events.ClientReady,
  once: true,

  execute(client: Client) {
    logger.success(`Bot iniciado como ${client.user?.tag}`);
    StatusManager.init(client);
  },
};
