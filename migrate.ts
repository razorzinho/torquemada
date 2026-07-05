require('dotenv').config();
import { getDbPool } from './src/database/client';

async function run() {
  const pool = getDbPool();
  try {
    // Create mod_actions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS torquemada.mod_actions (
        id            SERIAL PRIMARY KEY,
        guild_id      TEXT        NOT NULL,
        user_id       TEXT        NOT NULL,
        moderator_id  TEXT        NOT NULL,
        action_type   TEXT        NOT NULL,
        reason        TEXT,
        duration      TEXT,
        details       JSONB,
        created_at    TIMESTAMPTZ DEFAULT now()
      );
    `);
    console.log('Table mod_actions created');

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mod_actions_guild_user ON torquemada.mod_actions(guild_id, user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mod_actions_guild ON torquemada.mod_actions(guild_id);`);
    console.log('Indexes created');

    // Add mute_role_id column
    await pool.query(`ALTER TABLE torquemada.guild_settings ADD COLUMN IF NOT EXISTS mute_role_id TEXT;`);
    console.log('Column mute_role_id added');

    console.log('All migrations completed successfully');
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();
