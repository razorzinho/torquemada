import {
  Events,
  GuildMember,
  PartialGuildMember,
  TextChannel,
  EmbedBuilder,
} from 'discord.js';
import { TorquemadaClient } from '../client';
import { guildSettingsRepo } from '../database/repositories/guildSettings';
import { nicknameFiltersRepo } from '../database/repositories/nicknameFilters';
import { findBlockedWord } from '../utils/textNormalizer';
import { downloadAsAttachment } from '../utils/mediaDownloader';
import { logEmbed, Colors } from '../utils/embeds';
import { logger } from '../utils/logger';

export default {
  name: Events.GuildMemberUpdate,
  once: false,

  async execute(
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
    client: TorquemadaClient,
  ) {
    try {
      const guildId = newMember.guild.id;

      // ===================== NICKNAME CHANGE =====================
      const oldNick = oldMember.nickname ?? oldMember.user?.displayName ?? null;
      const newNick = newMember.nickname ?? newMember.user.displayName;

      if (oldMember.nickname !== newMember.nickname) {
        // --- Nickname Filter (Observer) ---
        if (newMember.nickname) {
          const blockedWords = await nicknameFiltersRepo.getKeywords(guildId);

          if (blockedWords.length > 0) {
            const detected = findBlockedWord(newMember.nickname, blockedWords);

            if (detected) {
              // Reverter apelido
              const previousNick = oldMember.nickname ?? null;
              try {
                await newMember.setNickname(previousNick, `Apelido bloqueado (palavra: ${detected})`);
              } catch (err) {
                logger.warn(`Não foi possível reverter o apelido de ${newMember.user.tag} (sem permissão?)`);
              }

              // Enviar DM ao usuário
              try {
                await newMember.user.send({
                  embeds: [
                    new EmbedBuilder()
                      .setColor(Colors.WARNING)
                      .setTitle('⚠️ Apelido Recusado')
                      .setDescription(
                        `Seu apelido **${newMember.nickname}** foi recusado no servidor **${newMember.guild.name}** por conter uma palavra proibida.\n\n` +
                        `Seu apelido foi revertido para: **${previousNick ?? 'nome de usuário padrão'}**`,
                      )
                      .setTimestamp(),
                  ],
                });
              } catch {
                // DMs fechadas
              }

              // Logar no canal de log
              const logConfig = await guildSettingsRepo.getLogChannel(guildId);
              if (logConfig?.log_channel && logConfig.log_events?.includes('nickname_change')) {
                const logChannel = await client.channels.fetch(logConfig.log_channel).catch(() => null) as TextChannel | null;
                if (logChannel) {
                  const embed = logEmbed('Apelido Bloqueado')
                    .setColor(Colors.ERROR)
                    .addFields(
                      { name: '👤 Usuário', value: `${newMember.user.tag} (${newMember.id})`, inline: true },
                      { name: '❌ Apelido Tentado', value: `\`${newMember.nickname}\``, inline: true },
                      { name: '🔙 Revertido Para', value: `\`${previousNick ?? 'padrão'}\``, inline: true },
                      { name: '🚫 Palavra Detectada', value: `\`${detected}\``, inline: true },
                    )
                    .setThumbnail(newMember.user.displayAvatarURL({ size: 128 }));

                  await logChannel.send({ embeds: [embed] });
                }
              }

              return; // Não logar como mudança normal
            }
          }
        }

        // --- Log Normal de Nickname Change ---
        const logConfig = await guildSettingsRepo.getLogChannel(guildId);
        if (logConfig?.log_channel && logConfig.log_events?.includes('nickname_change')) {
          const logChannel = await client.channels.fetch(logConfig.log_channel).catch(() => null) as TextChannel | null;
          if (logChannel) {
            const embed = logEmbed('Apelido Alterado')
              .addFields(
                { name: '👤 Usuário', value: `${newMember.user.tag} (${newMember.id})`, inline: true },
                { name: '📝 Anterior', value: `\`${oldNick ?? 'nenhum'}\``, inline: true },
                { name: '📝 Novo', value: `\`${newNick}\``, inline: true },
              )
              .setThumbnail(newMember.user.displayAvatarURL({ size: 128 }));

            await logChannel.send({ embeds: [embed] });
          }
        }
      }

      // ===================== SERVER AVATAR CHANGE =====================
      const oldAvatar = oldMember.avatar;
      const newAvatar = newMember.avatar;

      if (oldAvatar !== newAvatar) {
        const logConfig = await guildSettingsRepo.getLogChannel(guildId);
        if (!logConfig?.log_channel || !logConfig.log_events?.includes('avatar_change')) return;

        const logChannel = await client.channels.fetch(logConfig.log_channel).catch(() => null) as TextChannel | null;
        if (!logChannel) return;

        const embed = logEmbed('Avatar de Servidor Alterado')
          .addFields(
            { name: '👤 Usuário', value: `${newMember.user.tag} (${newMember.id})`, inline: true },
          );

        const attachments = [];

        // Avatar antigo
        if (oldAvatar) {
          const oldUrl = oldMember.displayAvatarURL({ size: 512, extension: 'png' });
          const oldAtt = await downloadAsAttachment(oldUrl, `avatar_antigo_${newMember.id}.png`);
          if (oldAtt) {
            attachments.push(oldAtt);
            embed.setThumbnail(`attachment://avatar_antigo_${newMember.id}.png`);
            embed.addFields({ name: '🖼️ Avatar Anterior', value: 'Thumbnail ↗', inline: true });
          }
        } else {
          embed.addFields({ name: '🖼️ Avatar Anterior', value: '_Nenhum (usava avatar global)_', inline: true });
        }

        // Avatar novo
        if (newAvatar) {
          const newUrl = newMember.displayAvatarURL({ size: 512, extension: 'png' });
          const newAtt = await downloadAsAttachment(newUrl, `avatar_novo_${newMember.id}.png`);
          if (newAtt) {
            attachments.push(newAtt);
            embed.setImage(`attachment://avatar_novo_${newMember.id}.png`);
            embed.addFields({ name: '🖼️ Avatar Novo', value: 'Imagem ↓', inline: true });
          }
        } else {
          embed.addFields({ name: '🖼️ Avatar Novo', value: '_Removido (usando avatar global)_', inline: true });
        }

        await logChannel.send({ embeds: [embed], files: attachments });
      }
    } catch (error) {
      logger.error('Erro no evento guildMemberUpdate:', error);
    }
  },
};
