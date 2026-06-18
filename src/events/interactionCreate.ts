import { Events, Interaction } from 'discord.js';
import { TorquemadaClient } from '../client';
import { logger } from '../utils/logger';

export default {
  name: Events.InteractionCreate,
  once: false,

  async execute(interaction: Interaction, client: TorquemadaClient) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        logger.warn(`Nenhum comando correspondente para /${interaction.commandName} foi encontrado.`);
        return;
      }

      try {
        await command.execute(interaction, client);
      } catch (error) {
        logger.error(`Erro ao executar comando /${interaction.commandName}:`, error);
        
        const errorReply = {
          content: 'Ocorreu um erro inesperado ao executar este comando!',
          ephemeral: true,
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorReply);
        } else {
          await interaction.reply(errorReply);
        }
      }
    } else if (interaction.isButton()) {
      // O tratamento do clique do botão do painel de roles pode ser feito aqui ou na própria classe do comando, mas por simplicidade e centralização faremos aqui caso inicie com 'rolepanel:'.
      if (interaction.customId.startsWith('rolepanel:')) {
        try {
          const parts = interaction.customId.split(':');
          // Formato: rolepanel:panelId:roleId
          if (parts.length < 3) return;
          const roleId = parts[2];
          const member = interaction.guild?.members.cache.get(interaction.user.id) || await interaction.guild?.members.fetch(interaction.user.id);
          
          if (!member) {
            await interaction.reply({ content: 'Não foi possível encontrar o membro.', ephemeral: true });
            return;
          }

          const role = interaction.guild?.roles.cache.get(roleId);
          if (!role) {
            await interaction.reply({ content: 'Este cargo não existe mais no servidor.', ephemeral: true });
            return;
          }

          if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId);
            await interaction.reply({ content: `O cargo **${role.name}** foi removido de você.`, ephemeral: true });
          } else {
            await member.roles.add(roleId);
            await interaction.reply({ content: `O cargo **${role.name}** foi adicionado a você.`, ephemeral: true });
          }
        } catch (error) {
          logger.error('Erro ao interagir com botão do painel de roles:', error);
          await interaction.reply({ content: 'Não foi possível gerenciar este cargo (provavelmente por causa da hierarquia de cargos ou permissões).', ephemeral: true });
        }
      }
    }
  },
};
