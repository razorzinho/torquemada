import { ActivityType, Client } from 'discord.js';

/**
 * Status padrão da persona do bot.
 */
const DEFAULT_STATUSES = [
  { name: 'hereges na fogueira', type: ActivityType.Watching },
  { name: 'o Malleus Maleficarum', type: ActivityType.Playing },
  { name: 'confissões de bruxaria', type: ActivityType.Listening },
  { name: 'julgamentos da Inquisição', type: ActivityType.Watching },
];

export class StatusManager {
  private static client: Client | null = null;
  private static interval: NodeJS.Timeout | null = null;
  private static currentTempStatusTimeout: NodeJS.Timeout | null = null;
  private static defaultIndex = 0;

  static init(client: Client) {
    this.client = client;
    this.startRotation();
  }

  private static startRotation() {
    if (this.interval) clearInterval(this.interval);

    // Rotate every 15 minutes
    this.interval = setInterval(() => {
      this.rotateDefaultStatus();
    }, 15 * 60 * 1000);

    this.rotateDefaultStatus();
  }

  private static rotateDefaultStatus() {
    if (!this.client) return;
    
    // Don't rotate if a temporary status is active
    if (this.currentTempStatusTimeout) return;

    const status = DEFAULT_STATUSES[this.defaultIndex];
    this.defaultIndex = (this.defaultIndex + 1) % DEFAULT_STATUSES.length;

    this.client.user?.setActivity(status.name, { type: status.type });
  }

  /**
   * Define um status temporário por um período, antes de voltar ao padrão.
   * @param name O texto do status
   * @param type O tipo de atividade
   * @param durationMs Duração em milissegundos (padrão: 1 minuto)
   */
  static setTempStatus(name: string, type: ActivityType, durationMs: number = 60000) {
    if (!this.client) return;

    // Cancela o timeout atual se houver
    if (this.currentTempStatusTimeout) {
      clearTimeout(this.currentTempStatusTimeout);
    }

    this.client.user?.setActivity(name, { type });

    // Restaura o status padrão após o tempo
    this.currentTempStatusTimeout = setTimeout(() => {
      this.currentTempStatusTimeout = null;
      this.rotateDefaultStatus();
    }, durationMs);
  }
}
