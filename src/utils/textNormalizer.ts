/**
 * Motor inteligente de normalização e detecção de palavras/frases proibidas.
 *
 * Combina anti-ofuscação pesada (leet speak, separadores como pontos/espaços,
 * letras repetidas, homóglifos cirílicos/gregos, caracteres invisíveis e fontes Unicode)
 * com proteção estrita contra falsos positivos (fronteiras de palavras e sufixos controlados).
 */

// Mapa de homóglifos visuais (Cirílico, Grego, Símbolos) para ASCII
const HOMOGLYPH_MAP: Record<string, string> = {
  // Cirílico / Grego / Variantes Latinas
  'а': 'a', 'ɑ': 'a', 'α': 'a', '∆': 'a', 'ª': 'a', 'ä': 'a', 'å': 'a', 'æ': 'ae',
  'в': 'b', 'ß': 'b', 'ь': 'b',
  'с': 'c', '¢': 'c', '©': 'c',
  'е': 'e', 'є': 'e', 'ë': 'e', '€': 'e', '£': 'e',
  'і': 'i', 'ї': 'i', '¡': 'i', 'ı': 'i', 'ï': 'i',
  'к': 'k', 'ĸ': 'k',
  'м': 'm',
  'н': 'h',
  'ñ': 'n', 'и': 'n', 'й': 'n',
  'о': 'o', 'ο': 'o', 'ø': 'o', 'ö': 'o', 'º': 'o', '°': 'o', '¤': 'o',
  'р': 'p', 'þ': 'p', 'ρ': 'p',
  'ѕ': 's', '§': 's', 'š': 's',
  'т': 't', '†': 't',
  'υ': 'u', 'µ': 'u', 'ü': 'u',
  'ν': 'v',
  'у': 'y', '¥': 'y', 'ÿ': 'y',
  'х': 'x', '×': 'x',
  'ž': 'z',
};

// Mapa direto de Leet Speak (usado na normalização bruta de apelidos)
const LEET_MAP: Record<string, string> = {
  ...HOMOGLYPH_MAP,
  '@': 'a', '4': 'a',
  '8': 'b',
  'ç': 'c',
  '3': 'e',
  '6': 'g', '9': 'g',
  '1': 'i', '!': 'i', '|': 'i',
  '0': 'o',
  '$': 's', '5': 's',
  '7': 't', '+': 't',
  '2': 'z',
};

// Palavras curtas ou siglas onde não se deve aplicar sufixos amplos nem divisão livre por espaços
const STRICT_EXACT_WORDS = new Set([
  'cum',
  'cu',
  'anus',
  'dh',
  'cvi',
  'cvii',
  'spx',
  'fspx',
  'sspx',
  'chad',
  'aura',
  'yag',
  'crl',
  'crlh',
  'krl',
  'fdp',
  'fds',
  'pnc',
  'pqp',
  'prr',
  'tmc',
  'tnc',
  'vsf',
  'vsfd',
  'vtmnc',
  'wtf',
  '67',
]);

// Palavras curtíssimas onde NÃO se aceita espaço entre as letras (evita colidir com iniciais soltas em frases)
const NO_SPACE_SHORT_WORDS = new Set([
  'cum',
  'cu',
  'dh',
  'fds',
  'prr',
  'tmc',
  'tnc',
  'pnc',
]);

// Palavras onde a separação por espaços deve exigir letras isoladas (ex: "g a y", "v i a d o")
// para não colidir com sequências reais do português (ex: "segunda via do boleto")
const SINGLE_LETTER_SPACE_ONLY = new Set([
  'gay',
  'yag',
  'cum',
  'cu',
  'anus',
  'viado',
  'veado',
  'pinto',
  'bunda',
  'puta',
  'puto',
  'porra',
  'corno',
  'bosta',
  'merda',
  'foda',
  'fode',
  'foder',
  'fodi',
  'aura',
  'chad',
  'based',
  'furry',
  'econe',
  'spx',
  'fspx',
  'sspx',
  'cvi',
  'cvii',
  'crl',
  'crlh',
  'krl',
  'fdp',
  'fds',
  'pnc',
  'pqp',
  'prr',
  'tmc',
  'tnc',
  'vsf',
  'vsfd',
  'vtmnc',
  'wtf',
]);

/**
 * Nível 1: Ofensas Graves (Racismo, Nazismo, Crimes, Homofobia, Discurso de Ódio e Palavrões Pesados).
 * Ação automática no Torquemada: Deleta a mensagem + Aplica Timeout (castigo) + Avisa no chat.
 */
export const SEVERE_BADWORDS: string[] = [
  // 1. Racismo, Nazismo, Antissemitismo e Discurso de Ódio
  'macaco',
  'seu macaco',
  'macaco preto',
  'preto macaco',
  'mutambo',
  'crioulo',
  'criolo',
  'negrinho',
  'ne gro',
  'nigg*',
  'hitler',
  'adolf hitler',
  'hail hitler',
  'nazis*',
  'sou nazista',
  'sou antissemita',
  'sou homofobico',
  'decapitar',
  'odeio gay',
  'odeio mulher',
  'odeio mulheres',
  'odeio negro',
  'odeio negros',
  'odeio judeu',
  'odeio judeus',
  'lugar de mulher',

  // 2. Palavrões Pesados, Obscenidades, Anatomia Explícita e Crimes
  'arrombado',
  'arrombada',
  'babaca',
  'bosta',
  'buceta',
  'punheta',
  'caralho',
  'caralinho',
  'crl',
  'crlh',
  'krl',
  'cacete',
  'chupa meu pau',
  'corno',
  'cu',
  'cuzao',
  'cuzinho',
  'desgraç*',
  'fdp',
  'filho da puta',
  'filha da puta',
  'foda',
  'foda-se',
  'fodase',
  'fode',
  'foder',
  'fodi',
  'fodido',
  'fodida',
  'merda',
  'piranha',
  'pnc',
  'porra',
  'que porra e essa',
  'pqp',
  'prr',
  'puta',
  'puto',
  'puta que pariu',
  'vai pra puta que pariu',
  'vai se foder',
  'vai tomar no cu',
  'tmc',
  'tnc',
  'vsf',
  'vsfd',
  'vtmnc',
  'transar',
  'transei',
  'penis',
  'vagina',
  'anus',
  'testiculo',
  'pinto',
  'bunda',
  'cum',
  'pedofil*',
  'zoofil*',
  'viado',
  'veado',
  'gay',
  'yag',
  'idiota',
  'otario',
  'tua mae',
];

/**
 * Nível 2: Termos Restritos, Debates Eclesiásticos (Cisma/FSSPX/CVII) e Memes/Gírias.
 * Ação automática no Torquemada: Deleta a mensagem + Envia aviso rápido no chat (sem timeout).
 */
export const MODERATE_BADWORDS: string[] = [
  // 3. Gírias, Memes, Siglas Leves e Trolls Internos
  '20+20+20+7',
  '67',
  'meia sete',
  'seis sete',
  'six seven',
  'sahur*',
  'tralal*',
  'tung*',
  'fds',
  'wtf',
  'beijoq*',
  'bejoqueiro',
  'mambo',
  'aura',
  'farmar aura',
  'farmou aura',
  'based',
  'baseadus',
  'chad',
  'moggado',
  'mogged',
  'mongar',
  'maxxing',
  'furry',
  'comando vermelho',
  'dh',

  // 4. Termos de Cisma / Debates Eclesiásticos Restritos
  'a fraternidade',
  'fraternidade',
  'lefeb*',
  'dom marcel',
  'marcel lefebvre',
  'fsspx',
  'sspx',
  'fspx',
  'spx',
  'econe',
  'cisma',
  'cismatico',
  'cismando',
  'cismaram',
  'cismarao',
  'cismarem',
  'cismou',
  'cisme',
  'concilio vaticano',
  'concilio segundo',
  'concilio ii',
  'vaticano ii',
  'vaticano 2',
  'vaticano dois',
  'vaticano segundo',
  'vatecano',
  'cevesegundo',
  'cvii',
  'cv ii',
  'cvi',
  'cv i',
  'conciliares',
  'papa conciliar',
  'papas conciliares',
  'padres conciliares',
  'documentos conciliares',
  'nostra aetate',
  'cardeal tucho',
  'tucho',
  'excomun*',
  'escomun*',
  'ixcomun*',
  'exkomun*',
  'modernis*',
  'moderninho',
  'maçon*',
  'massonaria',
  'maçom',
  'maçons',
  'malçon',
  'mason',
  'sagraç*',
  'mandato episcopal',
  'sedevacan*',
  'vacante',
  'herege',
  'heregis',
];

const SEVERE_BADWORDS_SET = new Set(SEVERE_BADWORDS.map(w => w.toLowerCase().trim()));

/**
 * Lista padrão unificada (Ofensas Graves primeiro para terem prioridade na punição, seguidas dos Termos Restritos).
 */
export const DEFAULT_BADWORDS_PRESET: string[] = [
  ...SEVERE_BADWORDS,
  ...MODERATE_BADWORDS,
];

/**
 * Verifica se uma regra pertence à lista de ofensas graves (que exigem Timeout).
 * Palavras adicionadas manualmente com prefixo "!" (ex: "!palavra") também são tratadas como graves.
 */
export function isSevereBadword(rule: string): boolean {
  const clean = rule.trim().toLowerCase();
  return clean.startsWith('!') || SEVERE_BADWORDS_SET.has(clean);
}

/**
 * Converte emojis de indicadores regionais (🇦-🇿) e caracteres circulados para letras ASCII.
 */
function convertUnicodeSymbolsToAscii(input: string): string {
  let result = '';
  for (const char of input) {
    const code = char.codePointAt(0)!;
    // Regional Indicator Symbols 🇦 (0x1F1E6) a 🇿 (0x1F1FF)
    if (code >= 0x1f1e6 && code <= 0x1f1ff) {
      result += String.fromCharCode(97 + (code - 0x1f1e6)) + ' ';
      continue;
    }
    // Enclosed Alphanumerics 🅰 (0x1F170) a 🆉 (0x1F189)
    if (code >= 0x1f170 && code <= 0x1f189) {
      result += String.fromCharCode(97 + (code - 0x1f170));
      continue;
    }
    // Circled Latin ⓐ (0x24D0) a ⓩ (0x24E9)
    if (code >= 0x24d0 && code <= 0x24e9) {
      result += String.fromCharCode(97 + (code - 0x24d0));
      continue;
    }
    // Circled Latin Capital Ⓐ (0x24B6) a Ⓩ (0x24CF)
    if (code >= 0x24b6 && code <= 0x24cf) {
      result += String.fromCharCode(97 + (code - 0x24b6));
      continue;
    }
    result += char;
  }
  return result;
}

interface CharSpan {
  start: number;
  end: number;
}

/**
 * Pré-processa o texto de uma mensagem e mantém um mapa de posições (índices UTF-16)
 * para conseguir extrair o trecho exato original da mensagem que disparou a regra.
 */
export function preprocessMessageTextWithMap(input: string): {
  text: string;
  spans: CharSpan[];
} {
  // 1. Mascarar URLs e menções/emojis customizados do Discord com espaços do mesmo comprimento
  const masked = input
    .replace(/https?:\/\/\S+/gi, m => ' '.repeat(m.length))
    .replace(/<(?:@!?|@&|#|a?:\w+:)\d+>/g, m => ' '.repeat(m.length));

  let out = '';
  const spans: CharSpan[] = [];

  let i = 0;
  while (i < masked.length) {
    const code = masked.codePointAt(i)!;
    const charLen = code > 0xffff ? 2 : 1;
    const rawChar = masked.slice(i, i + charLen);
    const start = i;
    const end = i + charLen;
    i = end;

    // Ignorar caracteres zero-width e invisíveis
    if (/^[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD]$/.test(rawChar)) {
      continue;
    }

    let converted = '';
    if (code >= 0x1f1e6 && code <= 0x1f1ff) {
      converted = String.fromCharCode(97 + (code - 0x1f1e6)) + ' ';
    } else if (code >= 0x1f170 && code <= 0x1f189) {
      converted = String.fromCharCode(97 + (code - 0x1f170));
    } else if (code >= 0x24d0 && code <= 0x24e9) {
      converted = String.fromCharCode(97 + (code - 0x24d0));
    } else if (code >= 0x24b6 && code <= 0x24cf) {
      converted = String.fromCharCode(97 + (code - 0x24b6));
    } else {
      const nfkd = rawChar.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      for (const ch of nfkd) {
        converted += HOMOGLYPH_MAP[ch] ?? ch;
      }
    }

    for (const outCh of converted) {
      out += outCh;
      spans.push({ start, end });
    }
  }

  return { text: out, spans };
}

/**
 * Pré-processa o texto de uma mensagem preservando espaços e pontuações para análise contextual,
 * mas limpando links, menções, caracteres invisíveis, acentos, fontes Unicode e homóglifos.
 */
export function preprocessMessageText(input: string): string {
  return preprocessMessageTextWithMap(input).text;
}

/**
 * Normaliza uma string de forma agressiva (sem espaços/símbolos) — ideal para apelidos (nicknames).
 */
export function normalizeText(input: string): string {
  let normalized = convertUnicodeSymbolsToAscii(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  normalized = [...normalized]
    .map(char => LEET_MAP[char] ?? char)
    .join('');

  normalized = normalized.replace(/[^a-z0-9]/g, '');
  return normalized;
}

/**
 * Retorna a classe de expressão regular anti-leet/repetição para uma letra base.
 */
function getCharRegexPattern(char: string, nextChar?: string, hadCedilla?: boolean): string {
  if (hadCedilla) {
    return '(?:[ckçs5$]+|lc)';
  }

  switch (char) {
    case 'a':
      return '[a4@ª]+';
    case 'b':
      return '[b8]+';
    case 'c':
      // Antes de a, o, u ou consoantes, "c" frequentemente é trocado por "k" (ex: makako, karalho, exkomungado)
      if (!nextChar || 'aoulr'.includes(nextChar)) {
        return '[ck]+';
      }
      return '[cçs5$]+';
    case 'd':
      return 'd+';
    case 'e':
      return '[e3€&]+';
    case 'f':
      return 'f+';
    case 'g':
      return '[g69]+';
    case 'h':
      return 'h+';
    case 'i':
      return '[i1!|l]+';
    case 'j':
      return 'j+';
    case 'k':
      return '[kc]+';
    case 'l':
      return '[l1!|i]+';
    case 'm':
      return 'm+';
    case 'n':
      return 'n+';
    case 'o':
      return '[o0°º]+';
    case 'p':
      return 'p+';
    case 'q':
      return '[qk]+';
    case 'r':
      return 'r+';
    case 's':
      return '[s5$z]+';
    case 't':
      return '[t7+]+';
    case 'u':
      return 'u+';
    case 'v':
      return 'v+';
    case 'w':
      return 'w+';
    case 'x':
      return '(?:x+|ks)';
    case 'y':
      return '[y]+';
    case 'z':
      return '[z2s]+';
    default:
      return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Separador não-espaço (pontos, traços, underscores, asteriscos, barras, etc.)
const PUNCT_SEP = `[.\\-_*~|/\\\\'"\`]*`;
// Separador incluindo espaços (para palavras soletradas ou sílabas separadas)
const SPACE_OR_PUNCT_SEP = `[.\\-_*~|/\\\\'"\`\\s]*`;

/**
 * Compila uma única palavra em um sub-padrão Regex anti-ofuscação.
 */
function buildSingleWordPattern(rawToken: string, isPhrasePart: boolean): string {
  const isPrefix = rawToken.endsWith('*');
  const tokenWithoutWildcard = isPrefix ? rawToken.slice(0, -1) : rawToken;

  // Identificar posições onde havia 'ç' antes de remover diacríticos
  const lowerRaw = tokenWithoutWildcard.toLowerCase();
  const cedillaIndices = new Set<number>();
  let cleanToken = '';
  for (let i = 0; i < lowerRaw.length; i++) {
    const ch = lowerRaw[i];
    if (ch === 'ç') {
      cedillaIndices.add(cleanToken.length);
      cleanToken += 'c';
    } else {
      const norm = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
      const mapped = HOMOGLYPH_MAP[norm] ?? norm;
      if (/[a-z0-9]/.test(mapped)) {
        cleanToken += mapped;
      }
    }
  }

  if (cleanToken.length === 0) return '';

  // Manter todas as letras para que palavras com letras duplas espaçadas (ex: "n i g g e r", "c v i i")
  // sejam detectadas perfeitamente
  const chars: { ch: string; hadCedilla: boolean }[] = [];
  for (let i = 0; i < cleanToken.length; i++) {
    chars.push({ ch: cleanToken[i], hadCedilla: cedillaIndices.has(i) });
  }

  const charPatterns = chars.map((item, idx) =>
    getCharRegexPattern(item.ch, chars[idx + 1]?.ch, item.hadCedilla),
  );

  const isStrict = STRICT_EXACT_WORDS.has(cleanToken) || cleanToken.length <= 2;
  const isSingleSpaceOnly =
    !isPhrasePart && (SINGLE_LETTER_SPACE_ONLY.has(cleanToken) || cleanToken.length <= 3);

  // Função auxiliar para juntar um array de padrões de letras conforme a regra de espaçamento da palavra
  const joinLetters = (patterns: string[]): string => {
    if (patterns.length === 1) return patterns[0];
    const punct = patterns.join(PUNCT_SEP);
    if (isSingleSpaceOnly) {
      if (NO_SPACE_SHORT_WORDS.has(cleanToken)) return punct;
      const allSpaced = patterns.join(`\\s+`);
      return `(?:${punct}|${allSpaced})`;
    }
    return patterns.join(SPACE_OR_PUNCT_SEP);
  };

  const corePattern = joinLetters(charPatterns);

  // 1. Raiz de prefixo (ex: excomun*, lefeb*, beijoq*, nigg*): aceita qualquer continuação
  if (isPrefix) {
    return corePattern;
  }

  // 2. Palavras estritas (ex: cum, cu, anus, dh, cvii, siglas): apenas plural 's' opcional
  if (isStrict) {
    const pluralOpt = cleanToken === 'dh' || cleanToken === '67' ? '' : `${PUNCT_SEP}[s5$]?`;
    return `${corePattern}${pluralOpt}`;
  }

  // 3. Palavras terminadas em 'o', 'a' ou 'e' (>= 4 letras): suportam plural, diminutivo (-inho) e aumentativo (-ão)
  // substituindo a vogal final (ex: viado -> viadinho, viadão; cacete -> cacetinho; bosta -> bostinha; merda -> merdinha)
  const lastChar = cleanToken[cleanToken.length - 1];
  if (cleanToken.length >= 4 && (lastChar === 'o' || lastChar === 'a' || lastChar === 'e')) {
    const stemPatterns = charPatterns.slice(0, -1);
    const inhoVowel = lastChar === 'e' ? 'o' : lastChar;

    const sep = isSingleSpaceOnly ? `[.\\-_*~|/\\\\'"\`\\s]*` : SPACE_OR_PUNCT_SEP;
    const inhoPatterns = [
      ...stemPatterns,
      getCharRegexPattern('i'),
      getCharRegexPattern('n'),
      getCharRegexPattern('h'),
      getCharRegexPattern(inhoVowel),
    ];
    const aoPatterns = [
      ...stemPatterns,
      getCharRegexPattern('a'),
      getCharRegexPattern('o'),
    ];

    const baseWithPlural = `${corePattern}${PUNCT_SEP}(?:[s5$]|z?inh[o0a4@][s5$]?|z?[a4@][o0])?`;
    const inhoForm = `${inhoPatterns.join(sep)}${PUNCT_SEP}[s5$]?`;
    const aoForm = `${aoPatterns.join(sep)}${PUNCT_SEP}[s5$]?`;

    return `(?:${baseWithPlural}|${inhoForm}|${aoForm})`;
  }

  // 4. Demais palavras (ex: gay -> gays, gayzinho, gayzão)
  const sep = SPACE_OR_PUNCT_SEP;
  const nominalSuffix = `(?:${PUNCT_SEP}[s5$]|${PUNCT_SEP}es|${sep}z?${sep}[i1!|]+${sep}n+${sep}h+${sep}[o0a4@]+${PUNCT_SEP}[s5$]?|${sep}z?${sep}[a4@]+${sep}[o0]+)?`;
  return `${corePattern}${nominalSuffix}`;
}

// Cache de expressões regulares compiladas por palavra/regra
const compiledRuleCache = new Map<string, RegExp>();

/**
 * Compila uma regra (palavra, prefixo com '*' ou frase) em um RegExp otimizado.
 */
export function compileBadwordRule(rawRule: string): RegExp | null {
  const trimmed = rawRule.trim().toLowerCase().replace(/^!+/, '').trim();
  if (!trimmed) return null;

  const cached = compiledRuleCache.get(trimmed);
  if (cached) return cached;

  let regex: RegExp;

  // Caso especial: número 67 (meme)
  if (trimmed === '67' || trimmed === '67*') {
    regex = /(?<![a-z0-9])6+[\s.\-_*]*7+(?![a-z0-9])/i;
    compiledRuleCache.set(trimmed, regex);
    return regex;
  }

  // Caso especial: expressões matemáticas / símbolos literais (ex: "20+20+20+7")
  if (/^\d+\s*[+\-*/]/.test(trimmed)) {
    const escaped = trimmed
      .replace(/\*+$/, '')
      .split(/\s*(\+|\-|\*|\/)\s*/)
      .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s*');
    regex = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i');
    compiledRuleCache.set(trimmed, regex);
    return regex;
  }

  // Caso especial: palavra dividida explicitamente na regra (ex: "ne gro")
  if (trimmed === 'ne gro' || trimmed === 'ne gro*') {
    regex = /(?<![a-z0-9])n+[e3]+[\s.\-_]+g+r+[o0a4@]+[s5$]?(?![a-z0-9])/i;
    compiledRuleCache.set(trimmed, regex);
    return regex;
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const endsWithWildcard = tokens[tokens.length - 1].endsWith('*');

  if (tokens.length === 1) {
    const pattern = buildSingleWordPattern(tokens[0], false);
    if (!pattern) return null;
    const rightBoundary = endsWithWildcard ? '' : '(?![a-z0-9])';
    regex = new RegExp(`(?<![a-z0-9])${pattern}${rightBoundary}`, 'i');
  } else {
    // Frase composta (ex: "odeio gay", "lugar de mulher", "concilio vaticano", "dom marcel")
    const tokenPatterns = tokens.map((t, idx) =>
      buildSingleWordPattern(t, idx < tokens.length - 1),
    );
    if (tokenPatterns.some(p => !p)) return null;
    const joinedPhrase = tokenPatterns.join(`[\\s.\\-_*~|/\\\\,;:!?]+`);
    const rightBoundary = endsWithWildcard ? '' : '(?![a-z0-9])';
    regex = new RegExp(`(?<![a-z0-9])${joinedPhrase}${rightBoundary}`, 'i');
  }

  compiledRuleCache.set(trimmed, regex);
  return regex;
}

export interface BlockedWordMatch {
  word: string;
  severity: 'severe' | 'moderate';
  matchedText: string;
  highlightedText: string;
}

/**
 * Verifica se o texto de uma mensagem de chat contém alguma palavra ou frase proibida,
 * priorizando ofensas graves (que exigem Timeout) antes dos termos restritos moderados,
 * e extraindo o trecho exato encontrado no texto original.
 */
export function findBlockedWordDetailed(
  text: string,
  blockedWords: string[],
): BlockedWordMatch | null {
  if (!text || !blockedWords || blockedWords.length === 0) return null;

  const { text: preprocessed, spans } = preprocessMessageTextWithMap(text);
  if (!preprocessed.trim()) return null;

  const buildMatchResult = (
    rawWord: string,
    severity: 'severe' | 'moderate',
    execMatch: RegExpExecArray,
  ): BlockedWordMatch => {
    const startIdx = execMatch.index;
    const endIdx = Math.min(spans.length - 1, execMatch.index + execMatch[0].length - 1);
    const origStart = spans[startIdx]?.start ?? 0;
    const origEnd = spans[endIdx]?.end ?? text.length;
    const matchedText = text.slice(origStart, origEnd).trim() || execMatch[0].trim();
    // Ajustar destaque no texto original
    const exactSub = text.slice(origStart, origEnd);
    const highlightedText = `${text.slice(0, origStart)}**[${exactSub}]**${text.slice(origEnd)}`;

    return {
      word: rawWord.replace(/^!+/, ''),
      severity,
      matchedText,
      highlightedText,
    };
  };

  let moderateMatch: BlockedWordMatch | null = null;

  for (const rawWord of blockedWords) {
    const regex = compileBadwordRule(rawWord);
    if (!regex) continue;

    const execMatch = regex.exec(preprocessed);
    if (execMatch) {
      if (isSevereBadword(rawWord)) {
        return buildMatchResult(rawWord, 'severe', execMatch);
      }
      if (!moderateMatch) {
        moderateMatch = buildMatchResult(rawWord, 'moderate', execMatch);
      }
    }
  }

  return moderateMatch;
}

/**
 * Verifica se o texto de uma mensagem de chat contém alguma palavra ou frase proibida,
 * aplicando detecção anti-ofuscação sem falsos positivos.
 * Retorna a regra violada ou null.
 */
export function findBlockedWordInMessage(text: string, blockedWords: string[]): string | null {
  const match = findBlockedWordDetailed(text, blockedWords);
  return match ? match.word : null;
}

/**
 * Verifica se um apelido (nickname) contém alguma das palavras bloqueadas.
 * Retorna a primeira palavra encontrada, ou null se nenhuma for detectada.
 */
export function findBlockedWord(text: string, blockedWords: string[]): string | null {
  // Primeiro tenta pelo motor inteligente de mensagens
  const smartMatch = findBlockedWordInMessage(text, blockedWords);
  if (smartMatch) return smartMatch;

  // Em apelidos curtos, também aplica a normalização contínua para palavras >= 4 caracteres
  const normalizedText = normalizeText(text);
  for (const word of blockedWords) {
    const normalizedWord = normalizeText(word);
    if (normalizedWord.length < 4) continue;

    if (normalizedText.includes(normalizedWord)) {
      return word;
    }
  }

  return null;
}
