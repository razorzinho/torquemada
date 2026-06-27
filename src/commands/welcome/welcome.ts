import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, TextChannel, MessageFlags } from 'discord.js';
import { Command } from '../../types/command';
import { guildSettingsRepo } from '../../database/repositories/guildSettings';
import { successEmbed } from '../../utils/embeds';

const welcomeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configura o sistema de boas-vindas do servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Define o canal e a mensagem de boas-vindas.')
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
        .setDescription('Ativa ou desativa o sistema de boas-vindas.')
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Ativar (true) ou desativar (false).')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('test')
        .setDescription('Envia uma mensagem de teste de boas-vindas no canal configurado.')),
        
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (subcommand === 'set') {
      const channel = interaction.options.getChannel('channel') as TextChannel;
      const message = interaction.options.getString('message')!;

      await guildSettingsRepo.setWelcome(guildId, channel.id, message, true);
      
      await interaction.reply({
        embeds: [successEmbed('Boas-vindas configurado', `Canal definido para ${channel}\n\nMensagem:\n${message}`)],
        flags: MessageFlags.Ephemeral
      });
    } else if (subcommand === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled')!;
      
      const settings = await guildSettingsRepo.getSettings(guildId);
      if (!settings?.welcome_channel && enabled) {
        await interaction.reply({
          content: 'Você precisa configurar um canal e uma mensagem usando `/welcome set` antes de ativar!',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await guildSettingsRepo.upsertSettings(guildId, { welcome_enabled: enabled });
      
      await interaction.reply({
        embeds: [successEmbed('Boas-vindas atualizado', `O sistema de boas-vindas foi **${enabled ? 'ativado' : 'desativado'}**.`)],
        flags: MessageFlags.Ephemeral
      });
    } else if (subcommand === 'test') {
      const settings = await guildSettingsRepo.getSettings(guildId);
      
      if (!settings?.welcome_channel || !settings.welcome_enabled) {
        await interaction.reply({
          content: 'O sistema de boas-vindas não está ativado ou não possui canal configurado.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const channel = interaction.guild?.channels.cache.get(settings.welcome_channel) as TextChannel;
      if (!channel) {
        await interaction.reply({
          content: 'O canal configurado não foi encontrado.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const welcomeMsg = (settings.welcome_message || 'Welcome {user} to {server}!')
        .replace(/{user}/g, interaction.user.toString())
        .replace(/{username}/g, interaction.user.username)
        .replace(/{server}/g, interaction.guild!.name)
        .replace(/{membercount}/g, interaction.guild!.memberCount.toString());

      await channel.send(welcomeMsg);
      await interaction.reply({ content: 'Mensagem de teste enviada!', flags: MessageFlags.Ephemeral });
    }
  },
};

export default welcomeCommand;
