export interface GuildSettings {
  guild_id: string;
  log_channel: string | null;
  log_events: string[];
  welcome_channel: string | null;
  welcome_message: string | null;
  welcome_enabled: boolean;
  farewell_channel: string | null;
  farewell_message: string | null;
  farewell_enabled: boolean;
  autorole_id: string | null;
  created_at: string;
}

export interface Warning {
  id: number;
  guild_id: string;
  user_id: string;
  moderator_id: string;
  reason: string;
  created_at: string;
}

export interface RolePanel {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string;
  title: string;
  description: string | null;
  created_at: string;
}

export interface RolePanelButton {
  id: number;
  panel_id: number;
  role_id: string;
  label: string;
  emoji: string | null;
  style: 'primary' | 'secondary' | 'success' | 'danger';
  position: number;
}

export interface AutomodConfig {
  guild_id: string;
  enabled: boolean;
  antispam_enabled: boolean;
  antispam_threshold: number;
  antispam_action: 'timeout' | 'kick' | 'ban';
  antilink_enabled: boolean;
  antilink_whitelist: string[];
  antilink_action: 'delete' | 'warn' | 'timeout';
  badwords: string[];
  badwords_action: 'delete' | 'warn' | 'timeout';
  max_mentions: number;
  max_mentions_action: 'delete' | 'warn' | 'timeout';
}

export interface TicketPanel {
  id: number;
  guild_id: string;
  panel_channel_id: string;
  panel_message_id: string;
  target_channel_id: string;
  title: string;
  description: string | null;
  button_label: string;
  button_style: 'primary' | 'secondary' | 'success' | 'danger';
  button_emoji: string | null;
  mode: 'interactive' | 'analysis';
  thread_prefix: string | null;
  collision_group: string | null;
  created_at: string;
}

export interface TicketFormField {
  id: number;
  panel_id: number;
  label: string;
  placeholder: string | null;
  style: 'short' | 'paragraph';
  required: boolean;
  position: number;
}

export interface Ticket {
  id: number;
  guild_id: string;
  user_id: string;
  thread_id: string;
  panel_id: number | null;
  status: 'open' | 'closed';
  created_at: string;
  closed_at: string | null;
  closed_by: string | null;
}

