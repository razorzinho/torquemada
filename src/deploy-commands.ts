import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './utils/logger';

async function deployCommands(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId) {
    logger.error('DISCORD_TOKEN e DISCORD_CLIENT_ID devem estar definidos no .env');
    process.exit(1);
  }

  const commands: unknown[] = [];
  const commandsPath = path.join(__dirname, 'commands');
  const commandFolders = fs.readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) continue;

    const commandFiles = fs.readdirSync(folderPath).filter(
      file => (file.endsWith('.js') || file.endsWith('.ts')) && !file.endsWith('.d.ts'),
    );

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      const commandModule = require(filePath);
      const command = commandModule.default ?? commandModule;

      if (command.data) {
        commands.push(command.data.toJSON());
        logger.info(`Comando preparado: /${command.data.name}`);
      }
    }
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    if (guildId) {
      logger.info(`Registrando ${commands.length} comandos na guilda (servidor) específica...`);
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands },
      );
      logger.success(`${commands.length} comandos de guilda registrados com sucesso!`);
    } else {
      logger.info(`Registrando ${commands.length} comandos globalmente... (Pode demorar até 1h para atualizar)`);
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands },
      );
      logger.success(`${commands.length} comandos globais registrados com sucesso!`);
    }
  } catch (error) {
    logger.error('Erro ao registrar comandos na API do Discord:', error);
    process.exit(1);
  }
}

deployCommands().catch(error => {
  logger.error('Erro ao registrar comandos:', error);
  process.exit(1);
});
