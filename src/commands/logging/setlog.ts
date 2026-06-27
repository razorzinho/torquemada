import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  MessageFlags,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { guildSettingsRepo } from '../../database/repositories/guildSettings';
import { successEmbed, errorEmbed } from '../../utils/embeds';
import { logger } from '../../utils/logger';

const VALID_EVENTS = [
  'message_delete',
  'message_edit',
  'member_join',
  'member_leave',
  'member_ban',
  'member_unban',
  'role_update',
  'channel_create',
  'channel_delete',
  'voice_join',
  'voice_leave',
  'voice_move',
  'mod_action',
  'nickname_change',
  'avatar_change',
];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setlog')
    .setDescription('Configura o canal e os eventos de log do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Canal de texto para enviar os logs')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName('events')
        .setDescription('Eventos para logar (separados por vírgula, ou "all" para todos)')
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: TorquemadaClient) {
    const guildId = interaction.guildId!;
    logger.command('setlog', interaction.user.id, guildId);

    const channel = interaction.options.getChannel('channel', true) as TextChannel;
    const eventsInput = interaction.options.getString('events', true).toLowerCase().trim();

    // Parse events
    let events: string[];
    if (eventsInput === 'all') {
      events = [...VALID_EVENTS];
    } else {
      events = eventsInput
        .split(',')
        .map(e => e.trim())
        .filter(e => e.length > 0);

      // Validate events
      const invalidEvents = events.filter(e => !VALID_EVENTS.includes(e));
      if (invalidEvents.length > 0) {
        await interaction.reply({
          embeds: [
            errorEmbed(
              'Eventos Inválidos',
              `Os seguintes eventos não são válidos: ${invalidEvents.map(e => `\`${e}\``).join(', ')}\n\n` +
              `**Eventos válidos:**\n${VALID_EVENTS.map(e => `\`${e}\``).join(', ')}\n\n` +
              `Use \`all\` para habilitar todos.`,
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    try {
      const result = await guildSettingsRepo.setLogChannel(guildId, channel.id, events);

      if (!result) {
        await interaction.reply({
          embeds: [errorEmbed('Erro', 'Não foi possível salvar as configurações de log.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        embeds: [
          successEmbed(
            'Logs Configurados',
            `**Canal:** ${channel}\n` +
            `**Eventos habilitados (${events.length}):**\n${events.map(e => `• \`${e}\``).join('\n')}`,
          ),
        ],
      });
    } catch (error) {
      logger.error('Erro ao configurar logs:', error);
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao configurar os logs.')],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default command;
