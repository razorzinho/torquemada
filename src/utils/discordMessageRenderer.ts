import { createCanvas, loadImage, GlobalFonts, CanvasRenderingContext2D } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import path from 'path';

const fontsDir = path.join(__dirname, '..', '..', 'assets', 'fonts');
GlobalFonts.registerFromPath(path.join(fontsDir, 'Inter-Regular.otf'), 'Inter');
GlobalFonts.registerFromPath(path.join(fontsDir, 'Inter-Medium.otf'), 'Inter');

export interface RenderOptions {
  avatarUrl: string;
  username: string;
  roleColor: string;
  timestamp: string;
  content: string;
  guildName: string;
  guildIconUrl: string | null;
  channelName: string;
  channelId: string;
  guildId: string;
  userId: string;
  messageId: string;
  headerPrefix?: string;
}

interface Token {
  type: 'text' | 'mention';
  content: string; 
  id?: string; 
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const regex = /\[\[([@#].+?)\|(\d+)\]\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: text.substring(lastIndex, match.index) });
    }
    tokens.push({ type: 'mention', content: match[1], id: match[2] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', content: text.substring(lastIndex) });
  }

  return tokens;
}

interface LineSegment {
  type: 'text' | 'mention';
  content: string;
  id?: string;
  width: number;
}

interface RenderLine {
  segments: LineSegment[];
  width: number;
}

function wrapTokens(ctx: CanvasRenderingContext2D, tokens: Token[], maxWidth: number): RenderLine[] {
  const lines: RenderLine[] = [];
  let currentLine: RenderLine = { segments: [], width: 0 };

  for (const token of tokens) {
    if (token.type === 'text') {
      const paragraphs = token.content.split('\n');
      for (let p = 0; p < paragraphs.length; p++) {
        if (p > 0) {
          lines.push(currentLine);
          currentLine = { segments: [], width: 0 };
        }
        
        const words = paragraphs[p].split(' ');
        for (let w = 0; w < words.length; w++) {
          const word = words[w] + (w < words.length - 1 ? ' ' : '');
          if (!word) continue;
          
          const wordWidth = ctx.measureText(word).width;
          
          if (currentLine.width + wordWidth > maxWidth && currentLine.width > 0) {
            lines.push(currentLine);
            currentLine = { segments: [{ type: 'text', content: word, width: wordWidth }], width: wordWidth };
          } else {
            if (currentLine.segments.length > 0 && currentLine.segments[currentLine.segments.length - 1].type === 'text') {
              const last = currentLine.segments[currentLine.segments.length - 1];
              last.content += word;
              last.width = ctx.measureText(last.content).width;
              currentLine.width = currentLine.segments.reduce((acc, s) => acc + s.width, 0);
            } else {
              currentLine.segments.push({ type: 'text', content: word, width: wordWidth });
              currentLine.width += wordWidth;
            }
          }
        }
      }
    } else if (token.type === 'mention') {
      const nameWidth = ctx.measureText(token.content).width;
      const pillWidth = nameWidth + 8;
      const suffix = ` (${token.content.startsWith('#') ? '<#' : '<@'}${token.id}>) `;
      const suffixWidth = ctx.measureText(suffix).width;
      const totalWidth = pillWidth + suffixWidth;

      if (currentLine.width + totalWidth > maxWidth && currentLine.width > 0) {
        lines.push(currentLine);
        currentLine = { segments: [{ type: 'mention', content: token.content, id: token.id, width: totalWidth }], width: totalWidth };
      } else {
        currentLine.segments.push({ type: 'mention', content: token.content, id: token.id, width: totalWidth });
        currentLine.width += totalWidth;
      }
    }
  }

  if (currentLine.segments.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

export async function renderDiscordMessage(options: RenderOptions): Promise<AttachmentBuilder> {
  const { avatarUrl, username, roleColor, timestamp, content, guildName, guildIconUrl, channelName, guildId, channelId, userId, messageId, headerPrefix } = options;

  const WIDTH = 800;
  const PADDING_LEFT = 72;
  const PADDING_RIGHT = 16;
  const MAX_TEXT_WIDTH = WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const LINE_HEIGHT = 22;
  
  const HEADER_HEIGHT = 50;
  const AVATAR_SIZE = 40;
  const MESSAGE_TOP_PADDING = 16;
  const MESSAGE_BOTTOM_PADDING = 24;
  
  const FOOTER_HEIGHT = 100;

  const tempCanvas = createCanvas(WIDTH, 100);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = '16px "Inter"';

  const tokens = tokenize(content || '*Mensagem vazia ou apenas anexos*');
  const lines = wrapTokens(tempCtx, tokens, MAX_TEXT_WIDTH);
  const textHeight = lines.length * LINE_HEIGHT;
  
  const messageBoxHeight = Math.max(AVATAR_SIZE + MESSAGE_BOTTOM_PADDING, 22 + textHeight + MESSAGE_BOTTOM_PADDING);
  const totalHeight = HEADER_HEIGHT + MESSAGE_TOP_PADDING + messageBoxHeight + FOOTER_HEIGHT;

  const canvas = createCanvas(WIDTH, totalHeight);
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';

  ctx.fillStyle = '#313338';
  ctx.fillRect(0, HEADER_HEIGHT, WIDTH, totalHeight - HEADER_HEIGHT);

  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT);

  ctx.font = '14px "Inter"';
  let currentX = 16;
  
  if (guildIconUrl) {
    try {
      const gIcon = await loadImage(guildIconUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(currentX + 12, 13 + 12, 12, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(gIcon, currentX, 13, 24, 24);
      ctx.restore();
      currentX += 32;
    } catch {}
  }

  ctx.fillStyle = '#B5BAC1';
  const headerText = headerPrefix || `Mensagem enviada no servidor `;
  ctx.fillText(headerText, currentX, 17);
  currentX += ctx.measureText(headerText).width;

  ctx.fillStyle = '#F2F3F5';
  ctx.font = 'bold 14px "Inter"';
  ctx.fillText(guildName, currentX, 17);
  currentX += ctx.measureText(guildName).width;

  ctx.fillStyle = '#B5BAC1';
  ctx.font = '14px "Inter"';
  ctx.fillText(' no canal ', currentX, 17);
  currentX += ctx.measureText(' no canal ').width;

  const channelText = `#${channelName}`;
  const chTextWidth = ctx.measureText(channelText).width;
  ctx.fillStyle = '#3c4270'; 
  ctx.roundRect(currentX, 12, chTextWidth + 8, 24, 4);
  ctx.fill();
  ctx.fillStyle = '#c9cdfb'; 
  ctx.fillText(channelText, currentX + 4, 17);
  currentX += chTextWidth + 12;

  ctx.fillStyle = '#B5BAC1';
  const chIdText = ` (<#${channelId}>)`;
  ctx.fillText(chIdText, currentX, 17);

  const avatarY = HEADER_HEIGHT + MESSAGE_TOP_PADDING;
  try {
    const avatar = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(16 + (AVATAR_SIZE/2), avatarY + (AVATAR_SIZE/2), AVATAR_SIZE/2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 16, avatarY, AVATAR_SIZE, AVATAR_SIZE);
    ctx.restore();
  } catch {
    ctx.fillStyle = '#5865F2';
    ctx.beginPath();
    ctx.arc(16 + (AVATAR_SIZE/2), avatarY + (AVATAR_SIZE/2), AVATAR_SIZE/2, 0, Math.PI * 2);
    ctx.fill();
  }

  const textStartY = avatarY - 2;
  ctx.font = 'bold 16px "Inter"';
  ctx.fillStyle = roleColor === '#000000' ? '#F2F3F5' : roleColor;
  ctx.fillText(username, PADDING_LEFT, textStartY);
  const usernameWidth = ctx.measureText(username).width;

  ctx.font = '12px "Inter"';
  ctx.fillStyle = '#949BA4';
  const timeY = textStartY + 4;
  ctx.fillText(timestamp, PADDING_LEFT + usernameWidth + 8, timeY);

  let currentContentY = textStartY + 24;
  ctx.font = '16px "Inter"';
  
  for (const line of lines) {
    let lineX = PADDING_LEFT;
    
    for (const seg of line.segments) {
      if (seg.type === 'text') {
        ctx.fillStyle = '#DBDEE1';
        ctx.fillText(seg.content, lineX, currentContentY);
        lineX += seg.width;
      } else if (seg.type === 'mention') {
        const nameWidth = ctx.measureText(seg.content).width;
        
        ctx.fillStyle = '#3c4270';
        ctx.roundRect(lineX, currentContentY - 2, nameWidth + 8, 20, 4);
        ctx.fill();
        
        ctx.fillStyle = '#c9cdfb';
        ctx.fillText(seg.content, lineX + 4, currentContentY);
        lineX += nameWidth + 8;
        
        const suffix = ` (${seg.content.startsWith('#') ? '<#' : '<@'}${seg.id}>) `;
        ctx.fillStyle = '#949BA4';
        ctx.fillText(suffix, lineX, currentContentY);
        lineX += ctx.measureText(suffix).width;
      }
    }
    currentContentY += LINE_HEIGHT;
  }

  const footerY = HEADER_HEIGHT + MESSAGE_TOP_PADDING + messageBoxHeight;
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, footerY, WIDTH, FOOTER_HEIGHT);

  ctx.font = 'bold 12px "Inter"';
  ctx.fillStyle = '#F2F3F5';
  
  ctx.fillText('ID do usuário', 16, footerY + 16);
  ctx.fillText('ID do servidor', 16, footerY + 56);
  
  ctx.fillText('ID do canal', 250, footerY + 16);
  ctx.fillText('ID da mensagem', 250, footerY + 56);

  ctx.font = '14px "Inter"';
  ctx.fillStyle = '#DBDEE1';
  
  ctx.fillText(userId, 16, footerY + 32);
  ctx.fillText(guildId, 16, footerY + 72);
  
  ctx.fillText(channelId, 250, footerY + 32);
  ctx.fillText(messageId, 250, footerY + 72);

  ctx.fillStyle = '#B5BAC1';
  ctx.font = 'italic 16px "Inter"';
  const sign = 'Log gerado por Torquemada';
  ctx.fillText(sign, WIDTH - ctx.measureText(sign).width - 16, footerY + 42);

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'message_mockup.png' });
}
