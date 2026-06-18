import * as fs from 'fs';
import * as path from 'path';
import { TorquemadaClient } from '../client';
import { logger } from '../utils/logger';

export async function loadEvents(client: TorquemadaClient): Promise<void> {
  const eventsPath = path.join(__dirname, '..', 'events');

  if (!fs.existsSync(eventsPath)) {
    logger.warn('Pasta de eventos não encontrada.');
    return;
  }

  const eventFiles = fs.readdirSync(eventsPath).filter(
    file => file.endsWith('.js') || file.endsWith('.ts'),
  );

  let count = 0;

  for (const file of eventFiles) {
    // Ignora arquivos .d.ts (declarações TypeScript)
    if (file.endsWith('.d.ts')) continue;

    const filePath = path.join(eventsPath, file);

    try {
      const eventModule = require(filePath);
      const event = eventModule.default ?? eventModule;

      if (event.name && event.execute) {
        if (event.once) {
          client.once(event.name, (...args: unknown[]) => event.execute(...args, client));
        } else {
          client.on(event.name, (...args: unknown[]) => event.execute(...args, client));
        }
        logger.info(`Evento carregado: ${event.name}${event.once ? ' (once)' : ''}`);
        count++;
      } else {
        logger.warn(`Evento em ${filePath} não tem 'name' ou 'execute'.`);
      }
    } catch (error) {
      logger.error(`Erro ao carregar evento ${filePath}:`, error);
    }
  }

  logger.success(`${count} eventos carregados.`);
}
