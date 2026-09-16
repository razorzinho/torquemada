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
        .setName('add')
        .setDescription('Adiciona um cargo à lista de cargos automáticos.')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Cargo para adicionar.')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove um cargo da lista de cargos automáticos.')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Cargo para remover.')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Lista os cargos automáticos configurados.')),
        
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (subcommand === 'add') {
      const role = interaction.options.getRole('role') as Role;
      await guildSettingsRepo.addAutorole(guildId, role.id);
      
      await interaction.reply({
        embeds: [successEmbed('Autorole adicionado', `Novos membros receberão o cargo ${role} automaticamente ao entrar no servidor.`)],
        flags: MessageFlags.Ephemeral
      });
    } else if (subcommand === 'remove') {
      const role = interaction.options.getRole('role') as Role;
      await guildSettingsRepo.removeAutorole(guildId, role.id);
      
      await interaction.reply({
        embeds: [successEmbed('Autorole removido', `O cargo ${role} não será mais dado automaticamente.`)],
        flags: MessageFlags.Ephemeral
      });
    } else if (subcommand === 'list') {
      const settings = await guildSettingsRepo.getSettings(guildId);
      const roles = settings?.autorole_ids || [];
      
      if (roles.length === 0) {
        await interaction.reply({
          embeds: [successEmbed('Cargos Automáticos', 'Nenhum cargo automático configurado.')],
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      
      const rolesText = roles.map(r => `<@&${r}>`).join('\n');
      await interaction.reply({
        embeds: [successEmbed('Cargos Automáticos Configurados', rolesText)],
        flags: MessageFlags.Ephemeral
      });
    }
  },
};

export default autoroleCommand;
