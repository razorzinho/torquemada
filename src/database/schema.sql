-- ============================================================
-- Torquemada Bot — Database Schema
-- Execute este SQL no Supabase SQL Editor
-- ============================================================

-- IMPORTANTE: Após executar, vá em Settings > API > Exposed schemas
-- e adicione "torquemada" à lista para que o PostgREST consiga acessar.

CREATE SCHEMA IF NOT EXISTS torquemada;

-- Configurações por servidor
CREATE TABLE IF NOT EXISTS torquemada.guild_settings (
  guild_id         TEXT PRIMARY KEY,
  log_channel      TEXT,
  log_events       TEXT[]      DEFAULT '{}',
  welcome_channel  TEXT,
  welcome_message  TEXT,
  welcome_enabled  BOOLEAN     DEFAULT false,
  farewell_channel TEXT,
  farewell_message TEXT,
  farewell_enabled BOOLEAN     DEFAULT false,
  autorole_id      TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Avisos de moderação
CREATE TABLE IF NOT EXISTS torquemada.warnings (
  id             SERIAL PRIMARY KEY,
  guild_id       TEXT        NOT NULL,
  user_id        TEXT        NOT NULL,
  moderator_id   TEXT        NOT NULL,
  reason         TEXT        NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_warnings_guild_user
  ON torquemada.warnings(guild_id, user_id);

-- Painéis de roles
CREATE TABLE IF NOT EXISTS torquemada.role_panels (
  id           SERIAL PRIMARY KEY,
  guild_id     TEXT        NOT NULL,
  channel_id   TEXT        NOT NULL,
  message_id   TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Botões dos painéis (roles mapeados)
CREATE TABLE IF NOT EXISTS torquemada.role_panel_buttons (
  id         SERIAL  PRIMARY KEY,
  panel_id   INTEGER REFERENCES torquemada.role_panels(id) ON DELETE CASCADE,
  role_id    TEXT    NOT NULL,
  label      TEXT    NOT NULL,
  emoji      TEXT,
  style      TEXT    DEFAULT 'primary',
  position   INTEGER DEFAULT 0
);

-- Configuração de auto-moderação
CREATE TABLE IF NOT EXISTS torquemada.automod_config (
  guild_id             TEXT PRIMARY KEY,
  enabled              BOOLEAN DEFAULT false,
  antispam_enabled     BOOLEAN DEFAULT false,
  antispam_threshold   INTEGER DEFAULT 5,
  antispam_action      TEXT    DEFAULT 'timeout',
  antilink_enabled     BOOLEAN DEFAULT false,
  antilink_whitelist   TEXT[]  DEFAULT '{}',
  antilink_action      TEXT    DEFAULT 'delete',
  badwords             TEXT[]  DEFAULT '{}',
  badwords_action      TEXT    DEFAULT 'delete',
  max_mentions         INTEGER DEFAULT 10,
  max_mentions_action  TEXT    DEFAULT 'delete'
);

-- Grants para service_role (garante acesso completo)
GRANT USAGE ON SCHEMA torquemada TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA torquemada TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA torquemada TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA torquemada GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA torquemada GRANT ALL ON SEQUENCES TO service_role;
