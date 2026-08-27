import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  Role,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { Command } from '../../types/command';
import { guildSettingsRepo } from '../../database/repositories/guildSettings';
import { ticketsRepo } from '../../database/repositories/tickets';
import { successEmbed, errorEmbed, Colors } from '../../utils/embeds';
import { modAction } from '../../utils/modAction';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('masmorra')
    .setDescription('Sistema de isolamento e investigação de usuários')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(sub =>
      sub
        .setName('setup')
        .setDescription('Configura o painel e o cargo da masmorra')
        .addIntegerOption(opt =>
          opt
            .setName('panel_id')
            .setDescription('ID do painel de tickets a ser usado')
            .setRequired(true)
        )
        .addRoleOption(opt =>
          opt
            .setName('role')
            .setDescription('Cargo (Investigado) a ser aplicado')
            .setRequired(true)
        )
        .addRoleOption(opt =>
          opt
            .setName('mention_role')
            .setDescription('Cargo a ser marcado quando alguém for enviado à masmorra')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('send')
        .setDescription('Envia um usuário para a masmorra')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('Usuário a ser investigado')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('reason')
            .setDescription('Motivo da investigação')
            .setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (subcommand === 'setup') {
      const panelId = interaction.options.getInteger('panel_id', true);
      const role = interaction.options.getRole('role', true) as Role;
      const mentionRole = interaction.options.getRole('mention_role', false) as Role | null;

      const panel = await ticketsRepo.getPanel(panelId);
      if (!panel) {
        await interaction.reply({
          embeds: [errorEmbed('Painel de tickets não encontrado.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (panel.guild_id !== guildId) {
        await interaction.reply({
          embeds: [errorEmbed('Este painel não pertence a este servidor.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await guildSettingsRepo.upsertSettings(guildId, {
        masmorra_panel_id: panelId,
        masmorra_role_id: role.id,
        masmorra_mention_role_id: mentionRole ? mentionRole.id : null,
      });

      const embed = successEmbed('Configuração da masmorra salva com sucesso.')
        .addFields(
          { name: 'Painel', value: `ID: ${panelId}`, inline: true },
          { name: 'Cargo', value: `<@&${role.id}>`, inline: true },
          { name: 'Menção Automática', value: mentionRole ? `<@&${mentionRole.id}>` : 'Nenhum', inline: false }
        );

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'send') {
      const targetUser = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);

      if (targetUser.id === interaction.user.id) {
        await interaction.reply({ embeds: [errorEmbed('Você não pode mandar a si mesmo para a masmorra.')], flags: MessageFlags.Ephemeral });
        return;
      }

      const settings = await guildSettingsRepo.getSettings(guildId);
      if (!settings || !settings.masmorra_panel_id || !settings.masmorra_role_id) {
        await interaction.reply({ embeds: [errorEmbed('A masmorra não está configurada neste servidor. Use `/masmorra setup` primeiro.')], flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const panel = await ticketsRepo.getPanel(settings.masmorra_panel_id);
      if (!panel) {
        await interaction.followUp({
          embeds: [errorEmbed('O painel configurado para a masmorra não existe mais.')]
        });
        return;
      }

      const member = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);
      if (!member) {
        await interaction.followUp({ embeds: [errorEmbed('Usuário não encontrado no servidor.')] });
        return;
      }

      const masmorraRole = interaction.guild?.roles.cache.get(settings.masmorra_role_id);
      if (!masmorraRole) {
        await interaction.followUp({ embeds: [errorEmbed('O cargo configurado para a masmorra não existe no servidor.')] });
        return;
      }

      // 1. Identificar cargos acima do cargo da masmorra
      const rolesToRemove: string[] = [];
      for (const [roleId, role] of member.roles.cache.entries()) {
        // Ignora o @everyone e cargos do bot ou de integração que não podem ser removidos,
        // mas tentaremos remover os que pudermos.
        if (roleId !== guildId && role.position > masmorraRole.position && !role.managed) {
          rolesToRemove.push(roleId);
        }
      }

      try {
        if (rolesToRemove.length > 0) {
          await member.roles.remove(rolesToRemove, `Masmorra: ${reason} (salvando cargos superiores)`);
        }
        await member.roles.add(settings.masmorra_role_id, `Masmorra: ${reason}`);
        
        const { masmorraRepo } = await import('../../database/repositories/masmorra');
        await masmorraRepo.saveSession(guildId, targetUser.id, rolesToRemove);
      } catch (err) {
        await interaction.followUp({ embeds: [errorEmbed('Não tenho permissão para alterar os cargos do usuário. O meu cargo precisa estar acima do cargo do usuário.')] });
        return;
      }

      const targetChannel = interaction.guild?.channels.cache.get(panel.target_channel_id);
      if (!targetChannel || !targetChannel.isTextBased() || targetChannel.isThread()) {
        await interaction.followUp({ embeds: [errorEmbed('Canal de destino do painel de tickets inválido.')] });
        return;
      }

      try {
        const threadName = `${panel.thread_prefix ? panel.thread_prefix + '-' : ''}${targetUser.username}`;
        
        const thread = await (targetChannel as any).threads.create({
          name: threadName,
          autoArchiveDuration: 10080,
          reason: `Masmorra: ${reason}`,
          type: ChannelType.PrivateThread,
        });

        await ticketsRepo.openTicket(guildId, targetUser.id, thread.id, panel.id);

        const embed = new EmbedBuilder()
          .setColor(Colors.WARNING)
          .setTitle(panel.welcome_title || 'Investigação Aberta')
          .setDescription((panel.welcome_message || 'Um moderador abriu esta investigação.').replace('{user}', `<@${targetUser.id}>`))
          .addFields({ name: 'Motivo', value: reason })
          .setTimestamp();

        const { getActionRowForPanel } = await import('../../utils/ticketActions');
        const components = await getActionRowForPanel(panel.id);

        const masmorraRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`masmorra_release:${targetUser.id}`)
            .setLabel('Liberar membro')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`masmorra_kick:${targetUser.id}`)
            .setLabel('Expulsar membro')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`masmorra_ban:${targetUser.id}`)
            .setLabel('Banir membro')
            .setStyle(ButtonStyle.Danger)
        );

        const finalComponents = components ? [components, masmorraRow] : [masmorraRow];

        let content = `<@${targetUser.id}>`;
        if (settings.masmorra_mention_role_id) {
          content += ` <@&${settings.masmorra_mention_role_id}>`;
        }

        await thread.send({
          content,
          embeds: [embed],
          components: finalComponents
        });

        await thread.members.add(targetUser.id).catch(() => null);
        await thread.members.add(interaction.user.id).catch(() => null);

        // ModAction log
        await modAction({
          guild: interaction.guild!,
          target: targetUser,
          moderator: interaction.user,
          actionType: 'masmorra',
          reason,
          client: interaction.client as any,
          skipDm: true,
        });

        await interaction.followUp({ embeds: [successEmbed(`Usuário isolado na masmorra com sucesso: <#${thread.id}>`)] });
      } catch (err) {
        console.error(err);
        await interaction.followUp({ embeds: [errorEmbed('Erro ao tentar criar a thread da masmorra.')] });
      }
    }
  },
};

export default command;
