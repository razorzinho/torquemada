import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { successEmbed, errorEmbed, infoEmbed } from '../../utils/embeds';
import { checkPermissions } from '../../utils/permissions';
import { nicknameFiltersRepo } from '../../database/repositories/nicknameFilters';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('nickname')
    .setDescription('Gerencia filtros de apelido do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addSubcommandGroup(group =>
      group
        .setName('filter')
        .setDescription('Gerencia palavras bloqueadas em apelidos')
        .addSubcommand(sub =>
          sub
            .setName('add')
            .setDescription('Adiciona uma palavra bloqueada')
            .addStringOption(opt =>
              opt
                .setName('palavra')
                .setDescription('Palavra a ser bloqueada em apelidos')
                .setRequired(true),
            ),
        )
        .addSubcommand(sub =>
          sub
            .setName('remove')
            .setDescription('Remove uma palavra bloqueada')
            .addStringOption(opt =>
              opt
                .setName('palavra')
                .setDescription('Palavra a ser desbloqueada')
                .setRequired(true),
            ),
        )
        .addSubcommand(sub =>
          sub
            .setName('list')
            .setDescription('Lista todas as palavras bloqueadas'),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: TorquemadaClient) {
    const guildId = interaction.guildId!;
    const group = interaction.options.getSubcommandGroup(true);
    const subcommand = interaction.options.getSubcommand(true);

    logger.command(`nickname ${group} ${subcommand}`, interaction.user.id, guildId);

    if (!(await checkPermissions(interaction, [PermissionFlagsBits.ManageNicknames]))) return;

    if (group === 'filter') {
      switch (subcommand) {
        case 'add': {
          const palavra = interaction.options.getString('palavra', true).trim();

          if (palavra.length < 2) {
            await interaction.reply({
              embeds: [errorEmbed('Erro', 'A palavra deve ter pelo menos 2 caracteres.')],
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const result = await nicknameFiltersRepo.addKeyword(guildId, palavra, interaction.user.id);

          if (!result) {
            await interaction.reply({
              embeds: [errorEmbed('Erro', `A palavra \`${palavra}\` já está na lista ou ocorreu um erro.`)],
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await interaction.reply({
            embeds: [
              successEmbed(
                'Palavra Bloqueada',
                `A palavra \`${palavra}\` foi adicionada ao filtro de apelidos.\n\nApelidos contendo essa palavra (ou variações) serão revertidos automaticamente.`,
              ),
            ],
          });
          break;
        }

        case 'remove': {
          const palavra = interaction.options.getString('palavra', true).trim();
          const removed = await nicknameFiltersRepo.removeKeyword(guildId, palavra);

          if (!removed) {
            await interaction.reply({
              embeds: [errorEmbed('Erro', `A palavra \`${palavra}\` não estava na lista.`)],
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await interaction.reply({
            embeds: [
              successEmbed(
                'Palavra Desbloqueada',
                `A palavra \`${palavra}\` foi removida do filtro de apelidos.`,
              ),
            ],
          });
          break;
        }

        case 'list': {
          const keywords = await nicknameFiltersRepo.getKeywords(guildId);

          if (keywords.length === 0) {
            await interaction.reply({
              embeds: [infoEmbed('Filtro de Apelidos', 'Nenhuma palavra bloqueada configurada.')],
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const list = keywords.map((k, i) => `\`${i + 1}.\` ${k}`).join('\n');
          await interaction.reply({
            embeds: [
              infoEmbed(
                `Filtro de Apelidos (${keywords.length})`,
                list,
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
          break;
        }
      }
    }
  },
};

export default command;
