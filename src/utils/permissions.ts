import {
  ChatInputCommandInteraction,
  GuildMember,
  PermissionsBitField,
  PermissionResolvable,
} from 'discord.js';
import { errorEmbed } from './embeds';

/**
 * Verifica se o membro que executou o comando tem as permissões necessárias.
 * Retorna true se tem permissão, false se não (e já responde com erro).
 */
export async function checkPermissions(
  interaction: ChatInputCommandInteraction,
  permissions: PermissionResolvable[],
): Promise<boolean> {
  const member = interaction.member as GuildMember;

  if (!member.permissions.has(permissions)) {
    const missing = new PermissionsBitField(permissions)
      .toArray()
      .filter(p => !member.permissions.has(p));

    await interaction.reply({
      embeds: [
        errorEmbed(
          'Permissão Insuficiente',
          `Você precisa das seguintes permissões:\n${missing.map(p => `\`${p}\``).join(', ')}`,
        ),
      ],
      ephemeral: true,
    });
    return false;
  }

  return true;
}

/**
 * Verifica se o bot tem as permissões necessárias no servidor.
 * Retorna true se tem permissão, false se não (e já responde com erro).
 */
export async function checkBotPermissions(
  interaction: ChatInputCommandInteraction,
  permissions: PermissionResolvable[],
): Promise<boolean> {
  const botMember = interaction.guild?.members.me;

  if (!botMember || !botMember.permissions.has(permissions)) {
    const missing = botMember
      ? new PermissionsBitField(permissions)
          .toArray()
          .filter(p => !botMember.permissions.has(p))
      : ['Desconhecido'];

    await interaction.reply({
      embeds: [
        errorEmbed(
          'Permissão do Bot Insuficiente',
          `O bot precisa das seguintes permissões:\n${missing.map(p => `\`${p}\``).join(', ')}`,
        ),
      ],
      ephemeral: true,
    });
    return false;
  }

  return true;
}

/**
 * Verifica a hierarquia de roles — o bot/membro pode moderar o alvo?
 */
export function canModerate(
  moderator: GuildMember,
  target: GuildMember,
): boolean {
  return moderator.roles.highest.position > target.roles.highest.position;
}
