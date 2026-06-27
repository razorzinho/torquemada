import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  GuildMember,
  Role,
  MessageFlags,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { successEmbed, errorEmbed } from '../../utils/embeds';
import { checkBotPermissions } from '../../utils/permissions';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('giverole')
    .setDescription('Atribui um cargo a um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('O membro que receberá o cargo')
        .setRequired(true),
    )
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('O cargo a ser atribuído')
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: TorquemadaClient) {
    const guildId = interaction.guildId!;
    logger.command('giverole', interaction.user.id, guildId);

    if (!(await checkBotPermissions(interaction, [PermissionFlagsBits.ManageRoles]))) return;

    const targetUser = interaction.options.getMember('user') as GuildMember | null;
    const role = interaction.options.getRole('role', true) as Role;

    if (!targetUser) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Membro não encontrado no servidor.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check role hierarchy — bot's highest role must be above the target role
    const botMember = interaction.guild!.members.me!;
    if (role.position >= botMember.roles.highest.position) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Hierarquia de Cargos',
            'O cargo está acima de minha alçada. A Inquisição tem seus limites de atuação.',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if the invoking member's highest role is above the target role
    const member = interaction.member as GuildMember;
    if (role.position >= member.roles.highest.position && interaction.guild!.ownerId !== member.id) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Hierarquia de Cargos',
            'Pretensão inválida. A Inquisição não permite que atue acima de seu próprio grau.',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if the member already has the role
    if (targetUser.roles.cache.has(role.id)) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', `${targetUser} já possui o cargo ${role}.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await targetUser.roles.add(role, `Atribuído por ${interaction.user.tag}`);

      await interaction.reply({
        embeds: [
          successEmbed(
            'Cargo Atribuído',
            `O cargo ${role} foi atribuído a ${targetUser} com sucesso.`,
          ),
        ],
      });
    } catch (error) {
      logger.error('Erro ao atribuir cargo:', error);
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Não foi possível atribuir o cargo. Verifique as permissões do bot.')],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default command;
