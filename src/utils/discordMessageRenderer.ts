import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import path from 'path';

// Carregar fontes globais com precisão
const fontsDir = path.join(__dirname, '..', '..', 'assets', 'fonts');
// O @napi-rs/canvas funde as fontes com a mesma familia, então usaremos o nome verdadeiro
GlobalFonts.registerFromPath(path.join(fontsDir, 'Inter-Regular.otf'), 'Inter');
GlobalFonts.registerFromPath(path.join(fontsDir, 'Inter-Medium.otf'), 'Inter'); // É registrada como a variante bold/medium da Inter

interface RenderOptions {
  avatarUrl: string;
  username: string;
  roleColor: string;
  timestamp: string;
  content: string;
  guildName: string;
  channelName: string;
}

/**
 * Quebra o texto em múltiplas linhas respeitando a largura máxima.
 */
function wrapText(ctx: any, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }

    const words = paragraph.split(' ');
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + ' ' + word).width;
      
      if (width < maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
  }

  return lines;
}

export async function renderDiscordMessage(options: RenderOptions): Promise<AttachmentBuilder> {
  const { avatarUrl, username, roleColor, timestamp, content, guildName, channelName } = options;

  // Medidas oficiais do UI do Discord
  const WIDTH = 800; // Mais largo para "respirar"
  const PADDING_LEFT = 72; // 16px margem esquerda + 40px avatar + 16px margem direita do avatar
  const PADDING_RIGHT = 16;
  const MAX_TEXT_WIDTH = WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const LINE_HEIGHT = 22; // Altura de linha do texto principal
  
  const HEADER_HEIGHT = 50; // Altura da faixa escura de contexto
  const AVATAR_SIZE = 40;
  const MESSAGE_TOP_PADDING = 16; // Distância do topo do container da mensagem até a foto
  const MESSAGE_BOTTOM_PADDING = 24; // Distância extra no final da mensagem para respirar

  // Criar um canvas temporário para medir o texto principal e header
  const tempCanvas = createCanvas(WIDTH, 100);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = '16px "Inter"';

  const lines = wrapText(tempCtx, content || '*Mensagem vazia ou apenas anexos*', MAX_TEXT_WIDTH);
  const textHeight = lines.length * LINE_HEIGHT;
  
  // Altura total: Faixa escura + padding superior + altura do título(22) + altura do texto + padding inferior
  const messageBoxHeight = Math.max(AVATAR_SIZE + MESSAGE_BOTTOM_PADDING, 22 + textHeight + MESSAGE_BOTTOM_PADDING);
  const totalHeight = HEADER_HEIGHT + MESSAGE_TOP_PADDING + messageBoxHeight;

  // Criar o canvas real
  const canvas = createCanvas(WIDTH, totalHeight);
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top'; // Mais fácil para alinhar Y

  // 1. Desenhar o background principal
  ctx.fillStyle = '#313338';
  ctx.fillRect(0, HEADER_HEIGHT, WIDTH, totalHeight - HEADER_HEIGHT);

  // 2. Desenhar o Header Escuro superior (como Loritta)
  ctx.fillStyle = '#2b2d31'; // Cor mais escura
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT);

  // Ícone decorativo e texto do header
  ctx.font = '14px "Inter"';
  ctx.fillStyle = '#B5BAC1';
  const headerText = `Mensagem enviada no servidor `;
  ctx.fillText(headerText, 16, 17);
  let currentX = 16 + ctx.measureText(headerText).width;

  ctx.fillStyle = '#F2F3F5';
  ctx.font = 'bold 14px "Inter"';
  ctx.fillText(guildName, currentX, 17);
  currentX += ctx.measureText(guildName).width;

  ctx.fillStyle = '#B5BAC1';
  ctx.font = '14px "Inter"';
  ctx.fillText(' no canal ', currentX, 17);
  currentX += ctx.measureText(' no canal ').width;

  // Tag do canal com background sutil
  const channelText = `# ${channelName}`;
  ctx.font = '14px "Inter"';
  const channelTextWidth = ctx.measureText(channelText).width;
  ctx.fillStyle = '#3b3d44'; // bg do channel tag
  ctx.roundRect(currentX, 12, channelTextWidth + 12, 26, 4);
  ctx.fill();
  
  ctx.fillStyle = '#c9cdfb'; // cor da fonte do canal (discord blurple claro)
  ctx.fillText(channelText, currentX + 6, 17);

  // --- Fim do Header ---

  // 3. Desenhar o Avatar Redondo
  const avatarY = HEADER_HEIGHT + MESSAGE_TOP_PADDING;
  try {
    const avatar = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(16 + (AVATAR_SIZE/2), avatarY + (AVATAR_SIZE/2), AVATAR_SIZE/2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 16, avatarY, AVATAR_SIZE, AVATAR_SIZE);
    ctx.restore();
  } catch (err) {
    ctx.fillStyle = '#5865F2';
    ctx.beginPath();
    ctx.arc(16 + (AVATAR_SIZE/2), avatarY + (AVATAR_SIZE/2), AVATAR_SIZE/2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Desenhar Nome do Usuário
  const textStartY = avatarY - 2; // O texto do Discord fica levamente alinhado acima do topo do avatar
  ctx.font = 'bold 16px "Inter"'; // Utilizando o fallback/weight nativo para o medium/bold
  ctx.fillStyle = roleColor === '#000000' ? '#F2F3F5' : roleColor;
  ctx.fillText(username, PADDING_LEFT, textStartY);
  const usernameWidth = ctx.measureText(username).width;

  // 5. Desenhar Timestamp
  ctx.font = '12px "Inter"';
  ctx.fillStyle = '#949BA4';
  const timeY = textStartY + 4; // Timestamp tem fonte menor, desce um pouquinho para alinhar com o username
  ctx.fillText(timestamp, PADDING_LEFT + usernameWidth + 8, timeY);

  // 6. Desenhar Conteúdo da Mensagem
  ctx.font = '16px "Inter"';
  ctx.fillStyle = '#DBDEE1';
  let currentContentY = textStartY + 24; // Posição Y da primeira linha (username height + gap)
  
  for (const line of lines) {
    ctx.fillText(line, PADDING_LEFT, currentContentY);
    currentContentY += LINE_HEIGHT;
  }

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'message_mockup.png' });
}
