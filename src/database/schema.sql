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

-- Painéis de tickets (mensagem fixada com botão)
CREATE TABLE IF NOT EXISTS torquemada.ticket_panels (
  id                 SERIAL PRIMARY KEY,
  guild_id           TEXT        NOT NULL,
  panel_channel_id   TEXT        NOT NULL,
  panel_message_id   TEXT        NOT NULL,
  target_channel_id  TEXT        NOT NULL,
  title              TEXT        NOT NULL,
  description        TEXT,
  button_label       TEXT        NOT NULL DEFAULT '🎫 Abrir Ticket',
  button_style       TEXT        DEFAULT 'primary',
  button_emoji       TEXT,
  mode               TEXT        DEFAULT 'interactive',  -- 'interactive' ou 'analysis'
  thread_prefix      TEXT,                                -- Prefixo do nome da thread (ex: 'denúncia')
  collision_group    TEXT,                                -- Grupo de colisão (painéis com mesmo valor colidem)
  welcome_title      TEXT,                                -- Título customizado do embed dentro da thread
  welcome_message    TEXT,                                -- Mensagem customizada (corpo do embed) de boas vindas
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- Campos do formulário de ticket (perguntas do Modal)
CREATE TABLE IF NOT EXISTS torquemada.ticket_form_fields (
  id          SERIAL PRIMARY KEY,
  panel_id    INTEGER REFERENCES torquemada.ticket_panels(id) ON DELETE CASCADE,
  label       TEXT    NOT NULL,
  placeholder TEXT,
  style       TEXT    DEFAULT 'short',    -- 'short' ou 'paragraph'
  required    BOOLEAN DEFAULT true,
  position    INTEGER DEFAULT 0
);

-- Tickets individuais (sessões de atendimento)
CREATE TABLE IF NOT EXISTS torquemada.tickets (
  id          SERIAL PRIMARY KEY,
  guild_id    TEXT        NOT NULL,
  user_id     TEXT        NOT NULL,
  thread_id   TEXT        UNIQUE NOT NULL,
  panel_id    INTEGER     REFERENCES torquemada.ticket_panels(id) ON DELETE SET NULL,
  status      TEXT        DEFAULT 'open',
  created_at  TIMESTAMPTZ DEFAULT now(),
  closed_at   TIMESTAMPTZ,
  closed_by   TEXT
);

-- Índice parcial para busca rápida de tickets ativos por usuário
CREATE INDEX IF NOT EXISTS idx_ticket_panels_channel_message
  ON torquemada.ticket_panels(panel_channel_id, panel_message_id);

-- Filtros de Apelidos (Nickname Observer)
CREATE TABLE IF NOT EXISTS torquemada.nickname_filters (
  guild_id    TEXT NOT NULL,
  keyword     TEXT NOT NULL,
  added_by    TEXT NOT NULL,
  added_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (guild_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_tickets_user_active
  ON torquemada.tickets(guild_id, user_id) WHERE status = 'open';

-- Tabela para guardar estado das permissões de canais trancados
CREATE TABLE IF NOT EXISTS torquemada.locked_channels (
  channel_id          TEXT PRIMARY KEY,
  guild_id            TEXT NOT NULL,
  original_overwrites JSONB NOT NULL,
  locked_by           TEXT NOT NULL,
  locked_at           TIMESTAMPTZ DEFAULT now()
);

-- Grants para service_role (garante acesso completo)
GRANT USAGE ON SCHEMA torquemada TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA torquemada TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA torquemada TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA torquemada GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA torquemada GRANT ALL ON SEQUENCES TO service_role;
