import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { Command } from '../../types/command';
import { guildSettingsRepo } from '../../database/repositories/guildSettings';
import { successEmbed } from '../../utils/embeds';

const farewellCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('farewell')
    .setDescription('Configura o sistema de despedida do servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Define o canal e a mensagem de despedida.')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Canal onde as mensagens serão enviadas.')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('message')
            .setDescription('Mensagem (use {user}, {username}, {server}, {membercount}).')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('toggle')
        .setDescription('Ativa ou desativa o sistema de despedida.')
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Ativar (true) ou desativar (false).')
            .setRequired(true))),
        
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (subcommand === 'set') {
      const channel = interaction.options.getChannel('channel') as TextChannel;
      const message = interaction.options.getString('message')!;

      await guildSettingsRepo.setFarewell(guildId, channel.id, message, true);
      
      await interaction.reply({
        embeds: [successEmbed('Despedida configurada', `Canal definido para ${channel}\n\nMensagem:\n${message}`)],
        ephemeral: true
      });
    } else if (subcommand === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled')!;
      
      const settings = await guildSettingsRepo.getSettings(guildId);
      if (!settings?.farewell_channel && enabled) {
        await interaction.reply({
          content: 'Você precisa configurar um canal e uma mensagem usando `/farewell set` antes de ativar!',
          ephemeral: true
        });
        return;
      }

      await guildSettingsRepo.upsertSettings(guildId, { farewell_enabled: enabled });
      
      await interaction.reply({
        embeds: [successEmbed('Despedida atualizada', `O sistema de despedida foi **${enabled ? 'ativado' : 'desativado'}**.`)],
        ephemeral: true
      });
    }
  },
};

export default farewellCommand;
