import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, Role, MessageFlags } from 'discord.js';
import { Command } from '../../types/command';
import { guildSettingsRepo } from '../../database/repositories/guildSettings';
import { successEmbed } from '../../utils/embeds';

const autoroleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Configura o cargo automático para novos membros.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Define o cargo que será dado aos novos membros.')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Cargo automático.')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a configuração do cargo automático.')),
        
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (subcommand === 'set') {
      const role = interaction.options.getRole('role') as Role;

      await guildSettingsRepo.setAutorole(guildId, role.id);
      
      await interaction.reply({
        embeds: [successEmbed('Autorole configurado', `Novos membros receberão o cargo ${role} automaticamente ao entrar no servidor.`)],
        flags: MessageFlags.Ephemeral
      });
    } else if (subcommand === 'remove') {
      await guildSettingsRepo.setAutorole(guildId, null);
      
      await interaction.reply({
        embeds: [successEmbed('Autorole removido', 'O sistema de cargo automático foi desativado.')],
        flags: MessageFlags.Ephemeral
      });
    }
  },
};

export default autoroleCommand;
