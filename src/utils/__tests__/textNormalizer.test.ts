import assert from 'node:assert/strict';
import {
  DEFAULT_BADWORDS_PRESET,
  findBlockedWordInMessage,
  findBlockedWordDetailed,
  findBlockedWord,
} from '../textNormalizer';

// Casos que DEVEM ser bloqueados pelo motor inteligente usando o DEFAULT_BADWORDS_PRESET
const SHOULD_BLOCK_CASES: [string, string][] = [
  // Obfuscações de "macaco"
  ['seu macaco', 'macaco direto'],
  ['m4c4c0', 'macaco em leet speak'],
  ['m.a.c.a.c.o', 'macaco separado por pontos'],
  ['m-a-c-a-c-o', 'macaco separado por hífens'],
  ['m_a_c_a_c_o', 'macaco separado por underscores'],
  ['m a c a c o', 'macaco soletrado com espaços'],
  ['seu ma ca co', 'macaco separado em sílabas'],
  ['m4k4k0', 'macaco com k e leet'],
  ['maaaacaaacoooo', 'macaco com letras repetidas'],
  ['𝖒𝖆𝖈𝖆𝖈𝖔', 'macaco em fonte matemática Unicode'],
  ['🇲🇦🇨🇦🇨🇴', 'macaco em emojis de indicadores regionais'],
  ['macaco preto', 'frase racista'],
  ['preto macaco', 'frase racista invertida'],

  // Homóglifos cirílicos (exatamente como enviado na lista original)
  ['A Frаtеrnidade', 'A Fraternidade com "a" e "e" cirílicos'],
  ['Fra ter ni da de', 'Fraternidade separada em sílabas em frase'],
  ['a fra ter ni da de', 'a fraternidade separada em sílabas'],

  // Racismo e Nazismo
  ['nigger', 'slur direto'],
  ['n i g g e r', 'slur espaçado'],
  ['ni g g', 'slur parcial espaçado'],
  ['n1gg4', 'slur leet'],
  ['crioulo', 'crioulo'],
  ['cr10l0', 'criolo leet'],
  ['negrinho', 'negrinho'],
  ['Ne gro', 'ne gro separado para burlar'],
  ['adolf hitler', 'adolf hitler'],
  ['h1t1er', 'hitler com 1 no i e no l'],
  ['hail hitler', 'hail hitler'],
  ['N A Z I S M O', 'nazismo espaçado'],
  ['odeio negros', 'frase de ódio'],
  ['oDEIO gAY', 'frase de ódio case misto'],
  ['odeio mulher', 'frase de ódio'],
  ['lugar de mulher é na cozinha', 'frase machista'],

  // Palavrões, Anatomia e Obscenidades
  ['buceta', 'buceta'],
  ['bu ce ta', 'buceta em sílabas'],
  ['B U C E T A', 'buceta espaçado'],
  ['b.u.c.3.t.4', 'buceta leet com pontos'],
  ['pu nhe ta', 'punheta em sílabas'],
  ['p.u.n.h.e.t.a', 'punheta com pontos'],
  ['caralho', 'caralho'],
  ['k4r4lh0', 'caralho com k e leet'],
  ['cacete', 'cacete'],
  ['foder', 'foder'],
  ['f0d1', 'fodi leet'],
  ['pe nis', 'penis separado'],
  ['pênis', 'penis com acento'],
  ['4nus', 'anus leet'],
  ['a.n.u.s', 'anus com pontos'],
  ['a n u s', 'anus espaçado'],
  ['c.u.m', 'cum com pontos'],
  ['cum', 'cum isolado'],
  ['pinto', 'pinto isolado'],
  ['p1nt0', 'pinto leet'],
  ['pintinho', 'pintinho diminutivo'],
  ['pintão', 'pintao aumentativo'],
  ['pedofilia', 'pedofilia'],
  ['pedófilo', 'pedofilo'],
  ['zoofilia', 'zoofilia'],

  // Homofobia e Xingamentos
  ['viado', 'viado'],
  ['v14d0', 'viado leet'],
  ['V I A D O', 'viado espaçado'],
  ['V I A D Ã O', 'viadão espaçado'],
  ['V I A D I N H O', 'viadinho espaçado'],
  ['viadinho', 'viadinho'],
  ['viadão', 'viadão'],
  ['veado', 'veado'],
  ['g a y', 'gay espaçado'],
  ['g4y', 'gay leet'],
  ['gayzão', 'gayzão'],
  ['gayzinho', 'gayzinho'],
  ['y a g', 'yag espaçado'],
  ['iDIOTA', 'idiota'],
  ['otário', 'otário'],
  ['0t4r10', 'otario leet'],

  // Memes e Gírias
  ['20+20+20+7', 'soma 67'],
  ['20 + 20 + 20 + 7', 'soma 67 com espaços'],
  ['b e i j o q u e i r o', 'beijoqueiro espaçado'],
  ['bejoqueiro', 'bejoqueiro'],
  ['M A M B O', 'mambo espaçado'],
  ['mam bo', 'mambo em sílabas'],
  ['Mamb o', 'mambo separado'],
  ['b a s e d', 'based espaçado'],
  ['farmar aura', 'farmar aura'],

  // Termos de Cisma / Debates Eclesiásticos
  ['c i s m a', 'cisma espaçado'],
  ['cis ma ti co', 'cismático em sílabas'],
  ['cis má ti co', 'cismático com acento em sílabas'],
  ['cismaram', 'cismaram'],
  ['e x c o m u n g a d o', 'excomungado espaçado'],
  ['E X C O M U N H Ã O', 'excomunhão espaçada'],
  ['Ex co mun ga do', 'excomungado em sílabas'],
  ['escomungado', 'escomungado com s'],
  ['ixcomungado', 'ixcomungado com ix'],
  ['exkomungado', 'exkomungado com k'],
  ['Le fe bv re', 'Lefebvre em sílabas'],
  ['lefebrve', 'Lefebvre com typo'],
  ['lefebvrista', 'lefebvrista derivado'],
  ['Dom Marcel', 'Dom Marcel'],
  ['fsspx', 'fsspx'],
  ['s s p x', 'sspx espaçado'],
  ['c v i i', 'cvii espaçado'],
  ['CV II', 'CV II'],
  ['Concílio Vaticano II', 'Concílio Vaticano II'],
  ['concílio vaticano 2', 'concílio vaticano 2'],
  ['mo der nis ta', 'modernista em sílabas'],
  ['M O D E R N I S T A', 'modernista espaçado'],
  ['maçonaria', 'maçonaria'],
  ['massonaria', 'massonaria com ss'],
  ['malçon', 'malçon'],
  ['Tu cho', 'Tucho separado'],
  ['Va can te', 'Vacante em sílabas'],
  ['sedevacantista', 'sedevacantista via prefixo sedevacan*'],

  // Nova lista de palavras e expressões adicionadas
  ['67', 'meme 67 isolado'],
  ['6 7', 'meme 67 espaçado'],
  ['meia sete', 'meia sete'],
  ['Seis sete', 'Seis sete'],
  ['Six Seven', 'Six Seven'],
  ['arrombado', 'arrombado'],
  ['arrombada', 'arrombada'],
  ['4rr0mb4d0', 'arrombado leet'],
  ['babacas', 'babacas plural'],
  ['bostinha', 'bostinha diminutivo de bosta'],
  ['bucetinha', 'bucetinha diminutivo de buceta'],
  ['cacetinho', 'cacetinho diminutivo de cacete'],
  ['caralinho', 'caralinho'],
  ['chupa meu pau', 'frase obscena'],
  ['corno', 'corno'],
  ['crl', 'sigla crl'],
  ['CRLH.', 'sigla crlh com ponto'],
  ['krl', 'sigla krl'],
  ['cu', 'cu isolado'],
  ['c.u', 'cu com ponto'],
  ['cuzão', 'cuzão'],
  ['desgraça', 'desgraça'],
  ['desgraçado', 'desgraçado'],
  ['fdp', 'sigla fdp'],
  ['F.D.P', 'sigla fdp com pontos'],
  ['fds', 'sigla fds'],
  ['filho da puta', 'filho da puta'],
  ['foda', 'foda'],
  ['foda-se', 'foda-se'],
  ['fodase', 'fodase'],
  ['fode', 'fode'],
  ['fodido', 'fodido'],
  ['merda', 'merda'],
  ['merdinha', 'merdinha'],
  ['odeio judeus', 'odeio judeus'],
  ['odeio mulheres', 'odeio mulheres'],
  ['odeio negro', 'odeio negro singular'],
  ['piranha', 'piranha'],
  ['pnc', 'sigla pnc'],
  ['porra', 'porra'],
  ['PQP', 'sigla pqp'],
  ['prr', 'sigla prr'],
  ['puta', 'puta'],
  ['puto', 'puto'],
  ['putinha', 'putinha'],
  ['puta que pariu', 'puta que pariu'],
  ['que porra é essa', 'que porra é essa'],
  ['sahur', 'brainrot sahur'],
  ['sou antissemita', 'frase antissemita'],
  ['sou homofóbico', 'frase homofóbica'],
  ['sou nazista', 'frase nazista'],
  ['tmc', 'sigla tmc'],
  ['TNC', 'sigla tnc'],
  ['tralala', 'brainrot tralala'],
  ['tralalero', 'brainrot tralalero'],
  ['tung tung', 'brainrot tung'],
  ['vai pra puta que pariu', 'vai pra puta que pariu'],
  ['vai se foder', 'vai se foder'],
  ['vai tomar no cu', 'vai tomar no cu'],
  ['VSF', 'sigla vsf'],
  ['vsfd', 'sigla vsfd'],
  ['vtmnc', 'sigla vtmnc'],
  ['wtf', 'sigla wtf'],
];

// Casos que NÃO DEVEM ser bloqueados (proteção contra falsos positivos)
const SHOULD_ALLOW_CASES: [string, string][] = [
  ['O documento oficial da Igreja foi publicado hoje.', 'documento contém "cum" e "cu"'],
  ['Precisamos cumprir os mandamentos e acumular virtudes.', 'cumprir e acumular contêm "cum"'],
  ['Chegamos ao cume da montanha.', 'cume começa com "cum"'],
  ['O curso da faculdade exige muito cuidado e cultura.', 'curso/faculdade/cuidado/cultura contêm "cu"'],
  ['O escudo escuro protegia o soldado.', 'escudo/escuro contêm "cu"'],
  ['Vou falar c um amigo meu hoje.', '"c um" abreviado não deve bater em "cum"'],
  ['O manuscrito antigo foi encontrado no mosteiro.', 'manuscrito contém "anus"'],
  ['Temos bons planos para os próximos anos.', 'planos/anos próximos a "anus"'],
  ['Peguei a segunda via do boleto ontem.', '"via do" em frase normal não deve bater em "viado"'],
  ['Isso foi resolvido pela via do diálogo.', '"via do" não deve bater em "viado"'],
  ['O pintor pintou uma bela pintura na igreja.', 'pintor/pintou/pintura não devem bater em "pinto"'],
  ['Ele pinta quadros sacros muito bem.', 'pinta não deve bater em "pinto"'],
  ['Ele joga youtube na televisão da sala.', '"joga youtube" não deve bater em "gay"'],
  ['O computador do deputado foi consertado sem disputa.', 'computador/deputado/disputa contêm "puta/puto"'],
  ['A reputação dele é impecável.', 'reputação contém "puta"'],
  ['O Marcelo e a Marcela foram à missa hoje com o Carlos.', 'Marcelo/Marcela/Carlos'],
  ['O pão assou no forno com belo adorno no retorno.', 'forno/adorno/retorno não batem em "corno"'],
  ['Tocaram a corneta no quartel.', 'corneta não bate em "corno"'],
  ['Comemos lagosta na encosta da praia.', 'lagosta/encosta não batem em "bosta"'],
  ['Fomos ao mercado depois do mergulho.', 'mercado/mergulho não batem em "merda"'],
  ['Lemos o Salmo 167 e o livro de 1967.', '167 e 1967 não batem em "67"'],
  ['Excelente explicação, exceto por um pequeno detalhe.', 'excelente/exceto não devem bater em "excomun*"'],
  ['Esse argumento é válido, não é inválido nem irregular.', 'válido/inválido/irregular permitidos'],
  ['A Guarda Suíça protege o Papa em Roma.', 'Suíça permitida'],
  ['Vou lavar a louça depois do jantar.', 'louça em contexto normal permitida'],
  ['O café está bem negro e forte, ou o Mar Negro.', 'negro em contexto normal permitido'],
  ['Bora cv no chat geral depois!', 'cv isolado para conversar permitido'],
  ['O sismógrafo registrou um terremoto.', 'sismógrafo não deve bater em cisma'],
  ['O Níger é um país da África.', 'Níger (1 g) não deve bater em nigg*'],
  ['Isso é baseado nos escritos de Santo Tomás.', 'baseado em português normal não deve bater em based'],
  ['Veja o link https://discord.com/channels/1433444059233517578/2020207', 'URLs ignoradas'],
];

console.log('🔍 Executando suíte de testes do motor anti-ofuscação do Torquemada...\n');

let passed = 0;
let failed = 0;

for (const [input, description] of SHOULD_BLOCK_CASES) {
  const matched = findBlockedWordInMessage(input, DEFAULT_BADWORDS_PRESET);
  try {
    assert.ok(matched !== null, `Deveria bloquear: "${input}" (${description})`);
    passed++;
  } catch (err: any) {
    failed++;
    console.error(`❌ FALHA (Falso Negativo): "${input}" [${description}] passou sem ser bloqueado!`);
  }
}

for (const [input, description] of SHOULD_ALLOW_CASES) {
  const matched = findBlockedWordInMessage(input, DEFAULT_BADWORDS_PRESET);
  try {
    assert.equal(matched, null, `Não deveria bloquear: "${input}" (${description}) -> bateu em "${matched}"`);
    passed++;
  } catch (err: any) {
    failed++;
    console.error(`❌ FALHA (Falso Positivo): "${input}" [${description}] foi bloqueado pela regra "${matched}"!`);
  }
}

// Teste de Nicknames
assert.ok(findBlockedWord('xX_m4c4c0_Xx', DEFAULT_BADWORDS_PRESET) !== null, 'Nickname ofuscado deve ser bloqueado');
assert.equal(findBlockedWord('Marcelo_Catolico', DEFAULT_BADWORDS_PRESET), null, 'Nickname Marcelo_Catolico deve ser permitido');
passed += 2;

// Teste de Severidade em 2 Níveis + Extração de Trecho Exato (matchedText) e Destaque (highlightedText)
const severeRes = findBlockedWordDetailed('Oi, seu m.a.c.a.c.o idiota!', DEFAULT_BADWORDS_PRESET);
assert.equal(severeRes?.severity, 'severe', 'Ofensa racista deve ter severidade "severe" (Timeout)');
assert.equal(severeRes?.matchedText, 'm.a.c.a.c.o', 'Deve extrair exatamente o trecho ofuscado da mensagem original');
assert.equal(severeRes?.highlightedText, 'Oi, seu **[m.a.c.a.c.o]** idiota!', 'Deve destacar o trecho exato na mensagem original');

const moderateRes = findBlockedWordDetailed('isso é c i s m a na certa', DEFAULT_BADWORDS_PRESET);
assert.equal(moderateRes?.severity, 'moderate', 'Termo de cisma deve ter severidade "moderate" (Warn)');
assert.equal(moderateRes?.matchedText, 'c i s m a', 'Deve extrair o trecho espaçado exato');
assert.equal(moderateRes?.highlightedText, 'isso é **[c i s m a]** na certa', 'Deve destacar o trecho espaçado');

const mixedRes = findBlockedWordDetailed('mambo e v14d0 na mesma mensagem', DEFAULT_BADWORDS_PRESET);
assert.equal(mixedRes?.severity, 'severe', 'Mensagem mista deve priorizar a punição grave ("severe")');
assert.equal(mixedRes?.matchedText, 'v14d0', 'Deve extrair o trecho da ofensa mais grave');

const regionalRes = findBlockedWordDetailed('olha isso 🇲🇦🇨🇦🇨🇴 aqui', DEFAULT_BADWORDS_PRESET);
assert.equal(regionalRes?.matchedText, '🇲🇦🇨🇦🇨🇴', 'Deve extrair emojis regionais corretamente');
assert.equal(regionalRes?.highlightedText, 'olha isso **[🇲🇦🇨🇦🇨🇴]** aqui', 'Deve destacar emojis regionais');

const customSevereRes = findBlockedWordDetailed('usando p.a.l.a.v.r.a.x proibida', ['!palavrax']);
assert.equal(customSevereRes?.severity, 'severe', 'Palavra customizada com ! deve ter severidade "severe"');
assert.equal(customSevereRes?.matchedText, 'p.a.l.a.v.r.a.x', 'Deve extrair palavra customizada ofuscada');
passed += 11;

console.log(`✅ Testes concluídos: ${passed} aprovados, ${failed} falhas.`);
if (failed > 0) {
  process.exit(1);
}
