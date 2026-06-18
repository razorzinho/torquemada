import { logger } from './logger';

/**
 * Espera um tempo adequado considerando rate limits da API do Discord.
 * Usa os headers retornados pela API quando disponíveis.
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Executa uma função com retry automático em caso de rate limit (429).
 * Lê o header Retry-After da resposta do Discord.
 */
export async function withRateLimit<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (error?.status === 429 || error?.httpStatus === 429) {
        const retryAfter = (error.retryAfter ?? error.retry_after ?? 1) * 1000;
        logger.warn(`Rate limited. Aguardando ${retryAfter}ms antes de tentar novamente (tentativa ${attempt + 1}/${maxRetries})`);
        await sleep(retryAfter + 100); // +100ms de margem
      } else {
        throw error;
      }
    }
  }

  throw new Error(`Falha após ${maxRetries} tentativas devido a rate limits`);
}

/**
 * Processa itens em lotes com delay entre cada lote.
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  delayMs: number,
  processor: (batch: T[]) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const result = await withRateLimit(() => processor(batch));
    results.push(result);

    if (i + batchSize < items.length) {
      await sleep(delayMs);
    }
  }

  return results;
}
