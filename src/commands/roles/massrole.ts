import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  GuildMember,
  Role,
  Collection,
  MessageFlags,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { successEmbed, errorEmbed, progressEmbed } from '../../utils/embeds';
import { checkBotPermissions } from '../../utils/permissions';
import { logger } from '../../utils/logger';
import { sleep } from '../../utils/rateLimiter';

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('massrole')
    .setDescription('Adiciona ou remove um cargo em massa para múltiplos membros')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles | PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('Ação a ser realizada')
        .setRequired(true)
        .addChoices(
          { name: 'Adicionar', value: 'add' },
          { name: 'Remover', value: 'remove' },
        ),
    )
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('O cargo a ser adicionado ou removido')
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName('filter')
        .setDescription('Filtro de membros alvo')
        .setRequired(true)
        .addChoices(
          { name: 'Todos', value: 'all' },
          { name: 'Humanos', value: 'humans' },
          { name: 'Bots', value: 'bots' },
          { name: 'Membros com um cargo específico', value: 'role' },
        ),
    )
    .addRoleOption(option =>
      option
        .setName('filter_role')
        .setDescription('Cargo de filtro (obrigatório quando o filtro é "cargo específico")')
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: TorquemadaClient) {
    const guildId = interaction.guildId!;
    logger.command('massrole', interaction.user.id, guildId);

    if (!(await checkBotPermissions(interaction, [PermissionFlagsBits.ManageRoles]))) return;

    const action = interaction.options.getString('action', true) as 'add' | 'remove';
    const role = interaction.options.getRole('role', true) as Role;
    const filter = interaction.options.getString('filter', true);
    const filterRole = interaction.options.getRole('filter_role') as Role | null;

    // Validate filter_role requirement
    if (filter === 'role' && !filterRole) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Parâmetro Obrigatório',
            'Quando o filtro é "cargo específico", você deve informar o `filter_role`.',
          ),
        ],
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
            'O cargo selecionado está acima ou igual ao cargo mais alto do bot.',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check invoking member's hierarchy
    const member = interaction.member as GuildMember;
    if (role.position >= member.roles.highest.position && interaction.guild!.ownerId !== member.id) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Hierarquia de Cargos',
            'O cargo selecionado está acima ou igual ao seu cargo mais alto.',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Defer since this is a slow operation
    await interaction.deferReply();

    try {
      // Fetch all members
      const allMembers = await interaction.guild!.members.fetch();

      // Filter members based on the selected filter
      let targetMembers: Collection<string, GuildMember>;
      switch (filter) {
        case 'humans':
          targetMembers = allMembers.filter(m => !m.user.bot);
          break;
        case 'bots':
          targetMembers = allMembers.filter(m => m.user.bot);
          break;
        case 'role':
          targetMembers = allMembers.filter(m => m.roles.cache.has(filterRole!.id));
          break;
        default: // 'all'
          targetMembers = allMembers;
          break;
      }

      // Further filter: only members who need the change
      let membersToProcess: GuildMember[];
      if (action === 'add') {
        membersToProcess = targetMembers.filter(m => !m.roles.cache.has(role.id)).map(m => m);
      } else {
        membersToProcess = targetMembers.filter(m => m.roles.cache.has(role.id)).map(m => m);
      }

      if (membersToProcess.length === 0) {
        await interaction.editReply({
          embeds: [
            successEmbed(
              'Nenhuma Alteração Necessária',
              action === 'add'
                ? 'Todos os membros filtrados já possuem o cargo.'
                : 'Nenhum dos membros filtrados possui o cargo.',
            ),
          ],
        });
        return;
      }

      const total = membersToProcess.length;
      const actionLabel = action === 'add' ? 'Adicionando' : 'Removendo';
      let processed = 0;
      let failed = 0;

      // Show initial progress
      await interaction.editReply({
        embeds: [progressEmbed(0, total, `${actionLabel} cargo ${role.name}`)],
      });

      // Process in batches
      for (let i = 0; i < membersToProcess.length; i += BATCH_SIZE) {
        const batch = membersToProcess.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async (m) => {
            try {
              if (action === 'add') {
                await m.roles.add(role, `Massrole por ${interaction.user.tag}`);
              } else {
                await m.roles.remove(role, `Massrole por ${interaction.user.tag}`);
              }
              processed++;
            } catch {
              failed++;
            }
          }),
        );

        // Update progress every batch
        if (i + BATCH_SIZE < membersToProcess.length) {
          try {
            await interaction.editReply({
              embeds: [progressEmbed(processed + failed, total, `${actionLabel} cargo ${role.name}`)],
            });
          } catch {
            // Ignore edit errors during progress updates
          }
          await sleep(BATCH_DELAY_MS);
        }
      }

      // Final result
      const actionPast = action === 'add' ? 'adicionado a' : 'removido de';
      let description = `O cargo ${role} foi ${actionPast} **${processed}** membro(s).`;
      if (failed > 0) {
        description += `\n⚠️ Falhou em **${failed}** membro(s).`;
      }

      await interaction.editReply({
        embeds: [successEmbed('Massrole Concluído', description)],
      });
    } catch (error) {
      logger.error('Erro ao executar massrole:', error);
      await interaction.editReply({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao executar o massrole.')],
      });
    }
  },
};

export default command;
