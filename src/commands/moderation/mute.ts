import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  GuildMember,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { checkPermissions, checkBotPermissions, canModerate } from '../../utils/permissions';
import { errorEmbed, successEmbed, moderationEmbed } from '../../utils/embeds';
import { modAction } from '../../utils/modAction';
import { guildSettingsRepo } from '../../database/repositories/guildSettings';
import { parseDuration, formatDuration } from '../../utils/duration';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Gerencia mute por cargo no servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Aplica mute em um usuário via cargo')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Usuário para mutar').setRequired(true),
        )
        .addStringOption(opt =>
          opt.setName('motivo').setDescription('Motivo do mute').setRequired(false),
        )
        .addStringOption(opt =>
          opt
            .setName('duração')
            .setDescription('Duração (ex: 1h, 7d). Se omitido, permanente')
            .setRequired(false),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove o mute de um usuário')
        .addUserOption(opt =>
          opt.setName('user').setDescription('Usuário para desmutar').setRequired(true),
        )
        .addStringOption(opt =>
          opt.setName('motivo').setDescription('Motivo').setRequired(false),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('setup')
        .setDescription('Cria/atualiza o cargo de Muted e configura permissões em todos os canais'),
    ),

  async execute(interaction: ChatInputCommandInteraction, client: TorquemadaClient) {
    if (!interaction.guild) return;

    const subcommand = interaction.options.getSubcommand();
    logger.command(`mute ${subcommand}`, interaction.user.id, interaction.guild.id);

    if (!(await checkPermissions(interaction, [PermissionFlagsBits.ManageRoles]))) return;
    if (!(await checkBotPermissions(interaction, [PermissionFlagsBits.ManageRoles]))) return;

    const guildId = interaction.guild.id;

    switch (subcommand) {
      case 'set':
        return handleMuteSet(interaction, client, guildId);
      case 'remove':
        return handleMuteRemove(interaction, client, guildId);
      case 'setup':
        return handleMuteSetup(interaction, client, guildId);
    }
  },
};

async function getMuteRole(interaction: ChatInputCommandInteraction): Promise<string | null> {
  const settings = await guildSettingsRepo.getSettings(interaction.guildId!);
  return settings?.mute_role_id ?? null;
}

async function handleMuteSet(
  interaction: ChatInputCommandInteraction,
  client: TorquemadaClient,
  guildId: string,
): Promise<void> {
  const targetUser = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('motivo') ?? 'Sem motivo informado';
  const durationInput = interaction.options.getString('duração');

  if (targetUser.id === interaction.user.id) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Você não pode mutar a si mesmo.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  const muteRoleId = await getMuteRole(interaction);
  if (!muteRoleId) {
    await interaction.editReply({
      embeds: [errorEmbed('Cargo não configurado', 'O cargo de Muted ainda não foi criado. Use `/mute setup` primeiro.')],
    });
    return;
  }

  const muteRole = interaction.guild!.roles.cache.get(muteRoleId);
  if (!muteRole) {
    await interaction.editReply({
      embeds: [errorEmbed('Cargo não encontrado', 'O cargo de Muted foi deletado. Use `/mute setup` para recriar.')],
    });
    return;
  }

  try {
    const targetMember = await interaction.guild!.members.fetch(targetUser.id);
    const moderator = interaction.member as GuildMember;

    if (!canModerate(moderator, targetMember)) {
      await interaction.editReply({
        embeds: [errorEmbed('Hierarquia', 'Você não pode moderar alguém com cargo igual ou superior ao seu.')],
      });
      return;
    }

    if (targetMember.roles.cache.has(muteRoleId)) {
      await interaction.editReply({
        embeds: [errorEmbed('Já Mutado', 'Este usuário já possui o cargo de Muted.')],
      });
      return;
    }

    let duration: string | undefined;
    let durationMs: number | undefined;
    if (durationInput) {
      const parsed = parseDuration(durationInput);
      if (!parsed) {
        await interaction.editReply({
          embeds: [errorEmbed('Duração Inválida', 'Use formatos como: `10m`, `1h`, `7d`, `1d12h`')],
        });
        return;
      }
      durationMs = parsed;
      duration = formatDuration(parsed);
    }

    await targetMember.roles.add(muteRoleId, `${reason} | Por: ${interaction.user.tag}`);

    await modAction({
      guild: interaction.guild!,
      target: targetUser,
      moderator: interaction.user,
      actionType: 'mute',
      reason,
      duration,
      client,
    });

    const lines = [
      `**Usuário:** ${targetUser.tag} (\`${targetUser.id}\`)`,
      `**Moderador:** ${interaction.user}`,
      `**Motivo:** ${reason}`,
      duration ? `**Duração:** ${duration}` : '**Duração:** Permanente',
    ];

    await interaction.editReply({
      embeds: [moderationEmbed('Usuário Mutado', lines.join('\n'))],
    });

    // Unmute automático por duração
    if (durationMs) {
      setTimeout(async () => {
        try {
          const member = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
          if (member?.roles.cache.has(muteRoleId)) {
            await member.roles.remove(muteRoleId, 'Mute expirado — remoção automática');
            logger.success(`Mute automático expirado: ${targetUser.tag} em ${interaction.guild!.name}`);
          }
        } catch { /* ignorar */ }
      }, durationMs);
    }

    logger.success(`Mute: ${targetUser.tag} (${targetUser.id}) em ${interaction.guild!.name}`);
  } catch (error) {
    logger.error('Erro no comando mute set:', error);
    await interaction.editReply({
      embeds: [errorEmbed('Erro', 'Ocorreu um erro ao mutar o usuário.')],
    });
  }
}

async function handleMuteRemove(
  interaction: ChatInputCommandInteraction,
  client: TorquemadaClient,
  guildId: string,
): Promise<void> {
  const targetUser = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('motivo') ?? 'Sem motivo informado';

  await interaction.deferReply();

  const muteRoleId = await getMuteRole(interaction);
  if (!muteRoleId) {
    await interaction.editReply({
      embeds: [errorEmbed('Cargo não configurado', 'O cargo de Muted não foi configurado. Use `/mute setup`.')],
    });
    return;
  }

  try {
    const targetMember = await interaction.guild!.members.fetch(targetUser.id);

    if (!targetMember.roles.cache.has(muteRoleId)) {
      await interaction.editReply({
        embeds: [errorEmbed('Não Mutado', 'Este usuário não possui o cargo de Muted.')],
      });
      return;
    }

    await targetMember.roles.remove(muteRoleId, `${reason} | Por: ${interaction.user.tag}`);

    await modAction({
      guild: interaction.guild!,
      target: targetUser,
      moderator: interaction.user,
      actionType: 'unmute',
      reason,
      client,
    });

    const embed = moderationEmbed(
      'Usuário Desmutado',
      [
        `**Usuário:** ${targetUser.tag} (\`${targetUser.id}\`)`,
        `**Moderador:** ${interaction.user}`,
        `**Motivo:** ${reason}`,
      ].join('\n'),
    );

    await interaction.editReply({ embeds: [embed] });
    logger.success(`Unmute: ${targetUser.tag} (${targetUser.id}) em ${interaction.guild!.name}`);
  } catch (error) {
    logger.error('Erro no comando mute remove:', error);
    await interaction.editReply({
      embeds: [errorEmbed('Erro', 'Ocorreu um erro ao desmutar o usuário.')],
    });
  }
}

async function handleMuteSetup(
  interaction: ChatInputCommandInteraction,
  client: TorquemadaClient,
  guildId: string,
): Promise<void> {
  await interaction.deferReply();

  try {
    // Verificar se já existe um cargo Muted
    const settings = await guildSettingsRepo.getSettings(guildId);
    let muteRole = settings?.mute_role_id
      ? interaction.guild!.roles.cache.get(settings.mute_role_id)
      : null;

    if (!muteRole) {
      // Criar o cargo
      muteRole = await interaction.guild!.roles.create({
        name: 'Muted',
        color: 0x818386,
        reason: 'Cargo de mute criado via /mute setup',
        permissions: [],
      });
    }

    // Configurar permissões em todos os canais
    let configured = 0;
    const channels = interaction.guild!.channels.cache.filter(
      c => c.type === ChannelType.GuildText ||
           c.type === ChannelType.GuildVoice ||
           c.type === ChannelType.GuildForum ||
           c.type === ChannelType.GuildStageVoice,
    );

    for (const [, channel] of channels) {
      try {
        await channel.permissionOverwrites.edit(muteRole.id, {
          SendMessages: false,
          AddReactions: false,
          Connect: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
          SendMessagesInThreads: false,
        });
        configured++;
      } catch {
        // Sem permissão neste canal — ignorar
      }
    }

    // Salvar no banco
    await guildSettingsRepo.upsertSettings(guildId, { mute_role_id: muteRole.id });

    await interaction.editReply({
      embeds: [
        successEmbed(
          'Mute Configurado',
          [
            `**Cargo:** ${muteRole} (\`${muteRole.id}\`)`,
            `**Canais configurados:** ${configured}/${channels.size}`,
            '',
            '*O cargo nega permissões de enviar mensagens, reagir e conectar em voz em todos os canais.*',
          ].join('\n'),
        ),
      ],
    });

    logger.success(`Mute setup: cargo ${muteRole.name} configurado em ${configured} canais de ${interaction.guild!.name}`);
  } catch (error) {
    logger.error('Erro no comando mute setup:', error);
    await interaction.editReply({
      embeds: [errorEmbed('Erro', 'Ocorreu um erro ao configurar o cargo de mute.')],
    });
  }
}

export default command;
