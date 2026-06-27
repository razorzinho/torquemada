import { AttachmentBuilder } from 'discord.js';
import { logger } from './logger';

/**
 * Baixa uma imagem de uma URL e retorna um AttachmentBuilder para re-upload no Discord.
 * Se falhar, retorna null.
 * 
 * @TODO Implementar compressão/limite de tamanho para anexos pesados (>25MB).
 */
export async function downloadAsAttachment(
  url: string,
  filename: string,
): Promise<AttachmentBuilder | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());

    // @TODO: Ignorar arquivos maiores que 8MB por ora para evitar problemas de upload
    // Retornar a este ponto e implementar compressão ou storage externo
    if (buffer.byteLength > 8 * 1024 * 1024) {
      logger.warn(`Arquivo muito grande para re-upload (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB): ${filename}`);
      return null;
    }

    return new AttachmentBuilder(buffer, { name: filename });
  } catch (error) {
    logger.error(`Erro ao baixar mídia ${url}:`, error);
    return null;
  }
}

/**
 * Baixa múltiplos anexos e retorna os que foram bem-sucedidos.
 * Limita a 10 anexos por mensagem (limite do Discord).
 * 
 * @TODO Rever estratégia de persistência para anexos pesados.
 */
export async function downloadAttachments(
  attachments: { url: string; name: string }[],
): Promise<AttachmentBuilder[]> {
  const results: AttachmentBuilder[] = [];
  const limit = Math.min(attachments.length, 10);

  for (let i = 0; i < limit; i++) {
    const att = await downloadAsAttachment(attachments[i].url, attachments[i].name);
    if (att) results.push(att);
  }

  return results;
}
