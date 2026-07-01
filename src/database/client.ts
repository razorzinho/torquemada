import { Pool } from 'pg';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;

    if (!url) {
      throw new Error('DATABASE_URL deve estar definida no .env');
    }

    const min = process.env.DATABASE_POOL_MIN_SIZE ? parseInt(process.env.DATABASE_POOL_MIN_SIZE, 10) : 1;
    const max = process.env.DATABASE_POOL_MAX_SIZE ? parseInt(process.env.DATABASE_POOL_MAX_SIZE, 10) : 5;

    pool = new Pool({
      connectionString: url,
      min,
      max,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
      maxUses: 7500,
    });

    pool.on('error', (err) => {
      logger.error('Erro inesperado no cliente PostgreSQL', err);
    });
  }

  return pool;
}
