/**
 * Converte uma string de duração legível em milissegundos.
 * Formatos suportados: 10s, 5m, 2h, 1d, 1w
 * Pode combinar: 1d12h, 2h30m
 */
export function parseDuration(input: string): number | null {
  const regex = /(\d+)\s*(s|m|h|d|w)/gi;
  let total = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 's': total += value * 1000; break;
      case 'm': total += value * 60 * 1000; break;
      case 'h': total += value * 60 * 60 * 1000; break;
      case 'd': total += value * 24 * 60 * 60 * 1000; break;
      case 'w': total += value * 7 * 24 * 60 * 60 * 1000; break;
    }
  }

  return total > 0 ? total : null;
}

/**
 * Formata milissegundos em uma string legível.
 * Ex: 90061000 → "1d 1h 1m 1s"
 */
export function formatDuration(ms: number): string {
  const parts: string[] = [];
  const units = [
    { label: 'd', value: 86400000 },
    { label: 'h', value: 3600000 },
    { label: 'm', value: 60000 },
    { label: 's', value: 1000 },
  ];

  let remaining = ms;
  for (const unit of units) {
    const count = Math.floor(remaining / unit.value);
    if (count > 0) {
      parts.push(`${count}${unit.label}`);
      remaining %= unit.value;
    }
  }

  return parts.join(' ') || '0s';
}

/**
 * Converte milissegundos para um timestamp Discord relativo.
 * Ex: <t:1234567890:R> → "in 5 minutes"
 */
export function discordTimestamp(date: Date, style: 'R' | 'f' | 'F' | 't' | 'T' | 'd' | 'D' = 'f'): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}
