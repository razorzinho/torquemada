/**
 * Normaliza texto para detecção de palavras proibidas.
 * Remove acentos, leet speak, caracteres especiais e normaliza unicode.
 */

// Mapa de substituições comuns de leet speak e unicode lookalikes
const LEET_MAP: Record<string, string> = {
  '@': 'a', '4': 'a', 'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
  'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', '3': 'e',
  '1': 'i', '!': 'i', 'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
  '0': 'o', 'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
  'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
  '$': 's', '5': 's',
  '7': 't',
  'ñ': 'n',
  'ç': 'c',
  // Caracteres visuais confusíveis (unicode homoglyphs)
  'а': 'a', // Cirílico а
  'е': 'e', // Cirílico е
  'о': 'o', // Cirílico о
  'р': 'p', // Cirílico р
  'с': 'c', // Cirílico с
  'у': 'y', // Cirílico у
  'х': 'x', // Cirílico х
};

/**
 * Normaliza uma string para comparação anti-burla.
 * Remove acentos, leet speak, espaços, caracteres especiais e converte para lowercase.
 */
export function normalizeText(input: string): string {
  let normalized = input.toLowerCase();

  // Substituir caracteres do mapa
  normalized = [...normalized]
    .map(char => LEET_MAP[char] ?? char)
    .join('');

  // Remover diacríticos restantes via NFD decomposition
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Remover caracteres não-alfanuméricos (pontuação, espaços, underscores, hífens, etc)
  normalized = normalized.replace(/[^a-z0-9]/g, '');

  return normalized;
}

/**
 * Verifica se o texto contém alguma das palavras bloqueadas.
 * Retorna a primeira palavra encontrada, ou null se nenhuma for detectada.
 */
export function findBlockedWord(text: string, blockedWords: string[]): string | null {
  const normalizedText = normalizeText(text);

  for (const word of blockedWords) {
    const normalizedWord = normalizeText(word);
    if (normalizedWord.length === 0) continue;

    if (normalizedText.includes(normalizedWord)) {
      return word;
    }
  }

  return null;
}
