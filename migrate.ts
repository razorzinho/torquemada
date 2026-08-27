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

    // Add message_log_retention_days column
    await pool.query(`ALTER TABLE torquemada.guild_settings ADD COLUMN IF NOT EXISTS message_log_retention_days INTEGER DEFAULT 30;`);
    console.log('Column message_log_retention_days added');

    // Add masmorra columns
    await pool.query(`
      ALTER TABLE torquemada.guild_settings 
      ADD COLUMN IF NOT EXISTS masmorra_panel_id INTEGER,
      ADD COLUMN IF NOT EXISTS masmorra_role_id TEXT,
      ADD COLUMN IF NOT EXISTS masmorra_mention_role_id TEXT;
    `);
    console.log('Masmorra columns added');

    // Create ticket_action_buttons table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS torquemada.ticket_action_buttons (
        id           SERIAL PRIMARY KEY,
        panel_id     INTEGER REFERENCES torquemada.ticket_panels(id) ON DELETE CASCADE,
        label        TEXT    NOT NULL,
        style        TEXT    DEFAULT 'primary',
        emoji        TEXT,
        effects      JSONB   NOT NULL DEFAULT '[]',
        position     INTEGER DEFAULT 0
      );
    `);
    console.log('Table ticket_action_buttons created');

    // Creates the Masmorra sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS torquemada.masmorra_sessions (
        guild_id    TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        saved_roles TEXT[] NOT NULL DEFAULT '{}',
        created_at  TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (guild_id, user_id)
      );
    `);
    console.log('Table masmorra_sessions created');

    // Create message_cache table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS torquemada.message_cache (
        id             TEXT PRIMARY KEY,
        guild_id       TEXT NOT NULL,
        channel_id     TEXT NOT NULL,
        author_id      TEXT NOT NULL,
        author_tag     TEXT,
        author_avatar  TEXT,
        role_color     TEXT,
        content        TEXT,
        attachments    JSONB,
        created_at     TIMESTAMPTZ DEFAULT now()
      );
    `);
    console.log('Table message_cache created');

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_message_cache_guild ON torquemada.message_cache(guild_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_message_cache_created_at ON torquemada.message_cache(created_at);`);
    console.log('message_cache indexes created');

    console.log('All migrations completed successfully');
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();
