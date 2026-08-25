import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  Role,
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

      const panel = await ticketsRepo.getPanel(panelId);
      if (!panel) {
        await interaction.reply({
          embeds: [errorEmbed('Painel de tickets não encontrado.')],
          ephemeral: true,
        });
        return;
      }

      if (panel.guild_id !== guildId) {
        await interaction.reply({
          embeds: [errorEmbed('Este painel não pertence a este servidor.')],
          ephemeral: true,
        });
        return;
      }

      await guildSettingsRepo.upsertSettings(guildId, {
        masmorra_panel_id: panelId,
        masmorra_role_id: role.id,
      });

      await interaction.reply({
        embeds: [successEmbed(`Masmorra configurada com sucesso!\nPainel: **#${panelId} - ${panel.title}**\nCargo: ${role.toString()}`)],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'send') {
      const targetUser = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);

      const settings = await guildSettingsRepo.getSettings(guildId);
      if (!settings?.masmorra_panel_id || !settings?.masmorra_role_id) {
        await interaction.reply({
          embeds: [errorEmbed('A masmorra não está configurada neste servidor. Use `/masmorra setup` primeiro.')],
          ephemeral: true,
        });
        return;
      }

      const panel = await ticketsRepo.getPanel(settings.masmorra_panel_id);
      if (!panel) {
        await interaction.reply({
          embeds: [errorEmbed('O painel configurado para a masmorra não existe mais.')],
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const member = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);
      if (!member) {
        await interaction.followUp({ embeds: [errorEmbed('Usuário não encontrado no servidor.')] });
        return;
      }

      try {
        await member.roles.add(settings.masmorra_role_id, `Masmorra: ${reason}`);
      } catch (err) {
        await interaction.followUp({ embeds: [errorEmbed('Não tenho permissão para aplicar o cargo da masmorra no usuário.')] });
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
          type: 11,
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

        await thread.send({
          content: `<@${targetUser.id}>`,
          embeds: [embed],
          components: components ? [components] : []
        });

        await thread.members.add(targetUser.id).catch(() => null);

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
