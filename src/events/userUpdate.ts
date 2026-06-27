import {
  Events,
  User,
  PartialUser,
  TextChannel,
} from 'discord.js';
import { TorquemadaClient } from '../client';
import { guildSettingsRepo } from '../database/repositories/guildSettings';
import { downloadAsAttachment } from '../utils/mediaDownloader';
import { logEmbed } from '../utils/embeds';
import { logger } from '../utils/logger';

export default {
  name: Events.UserUpdate,
  once: false,

  async execute(oldUser: User | PartialUser, newUser: User, client: TorquemadaClient) {
    try {
      // Detectar troca de avatar global
      if (oldUser.avatar === newUser.avatar) return;

      // Percorrer guilds compartilhadas para logar em cada uma
      const guilds = client.guilds.cache.filter(g => g.members.cache.has(newUser.id));

      for (const [guildId, guild] of guilds) {
        const logConfig = await guildSettingsRepo.getLogChannel(guildId);
        if (!logConfig?.log_channel || !logConfig.log_events?.includes('avatar_change')) continue;

        const logChannel = await client.channels.fetch(logConfig.log_channel).catch(() => null) as TextChannel | null;
        if (!logChannel) continue;

        const embed = logEmbed('Avatar Global Alterado')
          .addFields(
            { name: '👤 Usuário', value: `${newUser.tag} (${newUser.id})`, inline: true },
          );

        const attachments = [];

        // Avatar antigo — persistir com download
        if (oldUser.avatar) {
          const oldUrl = oldUser.displayAvatarURL({ size: 512, extension: 'png' });
          const oldAtt = await downloadAsAttachment(oldUrl, `avatar_antigo_${newUser.id}.png`);
          if (oldAtt) {
            attachments.push(oldAtt);
            embed.setThumbnail(`attachment://avatar_antigo_${newUser.id}.png`);
            embed.addFields({ name: '🖼️ Avatar Anterior', value: 'Thumbnail ↗', inline: true });
          } else {
            embed.addFields({ name: '🖼️ Avatar Anterior', value: `[Link](${oldUrl}) _(pode expirar)_`, inline: true });
          }
        } else {
          embed.addFields({ name: '🖼️ Avatar Anterior', value: '_Avatar padrão do Discord_', inline: true });
        }

        // Avatar novo — persistir com download
        if (newUser.avatar) {
          const newUrl = newUser.displayAvatarURL({ size: 512, extension: 'png' });
          const newAtt = await downloadAsAttachment(newUrl, `avatar_novo_${newUser.id}.png`);
          if (newAtt) {
            attachments.push(newAtt);
            embed.setImage(`attachment://avatar_novo_${newUser.id}.png`);
            embed.addFields({ name: '🖼️ Avatar Novo', value: 'Imagem ↓', inline: true });
          } else {
            embed.addFields({ name: '🖼️ Avatar Novo', value: `[Link](${newUrl})`, inline: true });
          }
        } else {
          embed.addFields({ name: '🖼️ Avatar Novo', value: '_Avatar padrão do Discord_', inline: true });
        }

        await logChannel.send({ embeds: [embed], files: attachments });
      }
    } catch (error) {
      logger.error('Erro no evento userUpdate:', error);
    }
  },
};
