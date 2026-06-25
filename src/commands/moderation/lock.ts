import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
  ChannelType,
  ActivityType,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { checkPermissions, checkBotPermissions } from '../../utils/permissions';
import { errorEmbed, successEmbed, infoEmbed } from '../../utils/embeds';
import { logger } from '../../utils/logger';
import { locksRepo } from '../../database/repositories/locks';
import { StatusManager } from '../../utils/statusManager';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Gerencia o bloqueio avançado de canais')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Tranca o canal salvando as permissões originais')
        .addChannelOption(opt =>
          opt
            .setName('canal')
            .setDescription('Canal para bloquear (padrão: canal atual)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        )
        .addStringOption(opt =>
          opt
            .setName('motivo')
            .setDescription('Motivo do bloqueio')
            .setRequired(false),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Destranca o canal restaurando permissões originais')
        .addChannelOption(opt =>
          opt
            .setName('canal')
            .setDescription('Canal para desbloquear (padrão: canal atual)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction, client: TorquemadaClient) {
    if (!interaction.guild) return;

    const subcommand = interaction.options.getSubcommand();
    logger.command(`lock ${subcommand}`, interaction.user.id, interaction.guild.id);

    if (!(await checkPermissions(interaction, [PermissionFlagsBits.ManageChannels]))) return;
    if (!(await checkBotPermissions(interaction, [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles]))) return;

    const targetChannel = (interaction.options.getChannel('canal') ?? interaction.channel) as TextChannel;

    if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Este comando só pode ser usado em canais de texto.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      if (subcommand === 'set') {
        const reason = interaction.options.getString('motivo') ?? 'Sem motivo informado';

        // Check if already locked in DB
        const existingLock = await locksRepo.getLockedChannel(targetChannel.id);
        if (existingLock) {
          await interaction.editReply({
            embeds: [errorEmbed('Erro', 'Este canal já está trancado.')],
          });
          return;
        }

        // Save original overwrites
        const originalOverwrites = targetChannel.permissionOverwrites.cache.map(ow => ({
          id: ow.id,
          type: ow.type,
          allow: ow.allow.bitfield.toString(),
          deny: ow.deny.bitfield.toString(),
        }));

        // Add @everyone if not explicitly in cache
        if (!targetChannel.permissionOverwrites.cache.has(interaction.guild.id)) {
          originalOverwrites.push({
            id: interaction.guild.id,
            type: 0, // Role
            allow: '0',
            deny: '0',
          });
        }

        // Apply new lock permissions
        const newOverwrites = targetChannel.permissionOverwrites.cache.map(ow => {
          const sendMsgsDenied = ow.deny.has(PermissionFlagsBits.SendMessages);
          return {
            id: ow.id,
            allow: ow.allow.remove(PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.AddReactions),
            deny: sendMsgsDenied ? ow.deny : ow.deny.add(PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.AddReactions),
            type: ow.type,
          } as any;
        });

        // Ensure @everyone is processed
        if (!targetChannel.permissionOverwrites.cache.has(interaction.guild.id)) {
          newOverwrites.push({
            id: interaction.guild.id,
            allow: 0n as any,
            deny: PermissionFlagsBits.SendMessages | PermissionFlagsBits.CreatePublicThreads | PermissionFlagsBits.CreatePrivateThreads | PermissionFlagsBits.AddReactions as any,
            type: 0, // Role
          });
        }

        await locksRepo.saveLockedChannel(targetChannel.id, interaction.guild.id, originalOverwrites, interaction.user.id);
        
        await targetChannel.permissionOverwrites.set(newOverwrites as any, `Canal trancado por ${interaction.user.tag}: ${reason}`);

        // Check for admin roles
        const adminRoles = interaction.guild.roles.cache
          .filter(r => r.permissions.has(PermissionFlagsBits.Administrator) && !r.managed)
          .map(r => `<@&${r.id}>`);

        const embedLines = [
          `O canal ${targetChannel} foi trancado.`,
          `**Motivo:** ${reason}`,
          `**Moderador:** ${interaction.user}`,
        ];

        if (adminRoles.length > 0) {
          embedLines.push('');
          embedLines.push('⚠️ **Aviso:** Os seguintes cargos possuem `Administrador` e continuarão podendo falar:');
          embedLines.push(adminRoles.join(', '));
        }

        const embed = successEmbed('🔒 Canal Trancado', embedLines.join('\n'));
        await interaction.editReply({ embeds: [embed] });

        StatusManager.setTempStatus(`Vigiando o silêncio em #${targetChannel.name}`, ActivityType.Watching, 60000);
        logger.success(`Lock: #${targetChannel.name} bloqueado em ${interaction.guild.name}`);

      } else {
        const lockData = await locksRepo.getLockedChannel(targetChannel.id);
        
        if (!lockData) {
          await interaction.editReply({
            embeds: [errorEmbed('Erro', 'Este canal não consta como trancado pelo bot.')],
          });
          return;
        }

        // Restore original overwrites
        const overwritesToRestore = lockData.original_overwrites.map((ow: any) => ({
          id: ow.id,
          type: ow.type,
          allow: BigInt(ow.allow),
          deny: BigInt(ow.deny),
        } as any));

        await targetChannel.permissionOverwrites.set(overwritesToRestore, `Canal destrancado por ${interaction.user.tag}`);
        await locksRepo.deleteLockedChannel(targetChannel.id);

        // Identify roles/users that still cannot speak (had SendMessages explicitly denied before the lock)
        const keptDenied = overwritesToRestore.filter((ow: any) => (ow.deny & BigInt(PermissionFlagsBits.SendMessages.toString())) !== 0n);

        const embedLines = [
          `O canal ${targetChannel} foi destrancado.`,
          `**Moderador:** ${interaction.user}`,
        ];

        if (keptDenied.length > 0) {
          embedLines.push('');
          embedLines.push('ℹ️ **Nota:** Algumas entidades já estavam silenciadas antes da trava e continuam sem permissão de falar.');
        }

        const embed = successEmbed('🔓 Canal Destrancado', embedLines.join('\n'));
        await interaction.editReply({ embeds: [embed] });

        StatusManager.setTempStatus(`Liberando a voz em #${targetChannel.name}`, ActivityType.Listening, 30000);
        logger.success(`Unlock: #${targetChannel.name} desbloqueado em ${interaction.guild.name}`);
      }
    } catch (error) {
      logger.error('Erro no comando lock:', error);
      await interaction.editReply({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao tentar alterar as permissões do canal.')],
      });
    }
  },
};

export default command;
