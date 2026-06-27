import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import path from 'path';

// Carregar fontes
const fontsDir = path.join(__dirname, '..', '..', 'assets', 'fonts');
GlobalFonts.registerFromPath(path.join(fontsDir, 'Inter-Regular.otf'), 'Inter');
GlobalFonts.registerFromPath(path.join(fontsDir, 'Inter-Medium.otf'), 'InterMedium');

interface RenderOptions {
  avatarUrl: string;
  username: string;
  roleColor: string;
  timestamp: string;
  content: string;
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
  const { avatarUrl, username, roleColor, timestamp, content } = options;

  // Configurações base
  const WIDTH = 600;
  const PADDING_LEFT = 72; // 16px margem + 40px avatar + 16px margem interna
  const PADDING_RIGHT = 16;
  const MAX_TEXT_WIDTH = WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const LINE_HEIGHT = 22;

  // Criar um canvas temporário apenas para medir o texto
  const tempCanvas = createCanvas(WIDTH, 100);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = '16px Inter';

  // Medir o texto e calcular a altura
  const lines = wrapText(tempCtx, content || '*Mensagem vazia ou apenas anexos*', MAX_TEXT_WIDTH);
  
  // Altura base = 2px top padding + 22px (header username) + texto + 16px bottom padding
  const textHeight = lines.length * LINE_HEIGHT;
  const minHeight = 48; // Altura mínima de uma mensagem com apenas 1 linha
  const totalHeight = Math.max(minHeight, 2 + 22 + textHeight + 16);

  // Criar o canvas real
  const canvas = createCanvas(WIDTH, totalHeight);
  const ctx = canvas.getContext('2d');

  // Desenhar Background (Discord Dark Mode)
  ctx.fillStyle = '#313338';
  ctx.fillRect(0, 0, WIDTH, totalHeight);

  // Carregar e desenhar o Avatar
  try {
    const avatar = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(16 + 20, 2 + 20, 20, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 16, 2, 40, 40);
    ctx.restore();
  } catch (err) {
    // Se falhar o download do avatar, desenhar um círculo cinza
    ctx.fillStyle = '#5865F2';
    ctx.beginPath();
    ctx.arc(16 + 20, 2 + 20, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  // Desenhar Username
  ctx.font = '16px InterMedium';
  ctx.fillStyle = roleColor === '#000000' ? '#F2F3F5' : roleColor;
  ctx.fillText(username, PADDING_LEFT, 18);

  const usernameWidth = ctx.measureText(username).width;

  // Desenhar Timestamp
  ctx.font = '12px Inter';
  ctx.fillStyle = '#949BA4';
  ctx.fillText(timestamp, PADDING_LEFT + usernameWidth + 8, 18);

  // Desenhar Conteúdo da Mensagem
  ctx.font = '16px Inter';
  ctx.fillStyle = '#DBDEE1';
  
  let currentY = 40; // Posição Y da primeira linha de texto
  for (const line of lines) {
    ctx.fillText(line, PADDING_LEFT, currentY);
    currentY += LINE_HEIGHT;
  }

  // Converter para buffer e retornar como Attachment
  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'message_mockup.png' });
}
