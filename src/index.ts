import 'dotenv/config';
import { TorquemadaClient } from './client';
import { loadCommands } from './handlers/commandHandler';
import { loadEvents } from './handlers/eventHandler';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  const client = new TorquemadaClient();

  // Carregar comandos e eventos
  await loadCommands(client);
  await loadEvents(client);

  // Login
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    logger.error('DISCORD_TOKEN não encontrado no .env');
    process.exit(1);
  }

  await client.login(token);
}

main().catch(error => {
  logger.error('Erro fatal ao iniciar o bot:', error);
  process.exit(1);
});
