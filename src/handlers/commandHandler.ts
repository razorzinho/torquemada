import * as fs from 'fs';
import * as path from 'path';
import { TorquemadaClient } from '../client';
import { Command } from '../types/command';
import { logger } from '../utils/logger';

export async function loadCommands(client: TorquemadaClient): Promise<void> {
  const commandsPath = path.join(__dirname, '..', 'commands');

  if (!fs.existsSync(commandsPath)) {
    logger.warn('Pasta de comandos não encontrada.');
    return;
  }

  const commandFolders = fs.readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    const stat = fs.statSync(folderPath);

    if (!stat.isDirectory()) continue;

    const commandFiles = fs.readdirSync(folderPath).filter(
      file => file.endsWith('.js') || file.endsWith('.ts'),
    );

    for (const file of commandFiles) {
      // Ignora arquivos .d.ts (declarações TypeScript)
      if (file.endsWith('.d.ts')) continue;

      const filePath = path.join(folderPath, file);

      try {
        const commandModule = require(filePath);
        const command = commandModule.default ?? commandModule;

        if (command && command.data && typeof command.execute === 'function') {
          client.commands.set(command.data.name, command as Command);
          logger.info(`Comando carregado: /${command.data.name}`);
        } else {
          logger.warn(`Comando em ${filePath} não tem 'data' ou 'execute'.`);
        }
      } catch (error) {
        logger.error(`Erro ao carregar comando ${filePath}:`, error);
      }
    }
  }

  logger.success(`${client.commands.size} comandos carregados.`);
}
