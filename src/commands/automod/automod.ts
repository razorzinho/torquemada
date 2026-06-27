import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { automodRepo } from '../../database/repositories/automod';
import { successEmbed, errorEmbed, infoEmbed } from '../../utils/embeds';
import { logger } from '../../utils/logger';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configurações de automoderação do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('toggle')
        .setDescription('Ativa ou desativa o automod')
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Ativar ou desativar o automod')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('antispam')
        .setDescription('Configura a proteção anti-spam')
        .addIntegerOption(option =>
          option
            .setName('threshold')
            .setDescription('Número máximo de mensagens em 5 segundos')
            .setMinValue(3)
            .setMaxValue(20)
            .setRequired(true),
        )
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Ação a tomar quando o limite é atingido')
            .setRequired(true)
            .addChoices(
              { name: 'Timeout', value: 'timeout' },
              { name: 'Kick', value: 'kick' },
              { name: 'Ban', value: 'ban' },
            ),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('antilink')
        .setDescription('Configura a proteção anti-link')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Ação a tomar quando um link é detectado')
            .setRequired(true)
            .addChoices(
              { name: 'Deletar', value: 'delete' },
              { name: 'Avisar', value: 'warn' },
              { name: 'Timeout', value: 'timeout' },
            ),
        )
        .addStringOption(option =>
          option
            .setName('allow')
            .setDescription('Domínios permitidos (separados por vírgula)')
            .setRequired(false),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('badwords')
        .setDescription('Gerencia a lista de palavras proibidas')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Ação a realizar')
            .setRequired(true)
            .addChoices(
              { name: 'Adicionar', value: 'add' },
              { name: 'Remover', value: 'remove' },
              { name: 'Listar', value: 'list' },
            ),
        )
        .addStringOption(option =>
          option
            .setName('word')
            .setDescription('Palavra para adicionar ou remover')
            .setRequired(false),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('maxmentions')
        .setDescription('Configura o limite máximo de menções por mensagem')
        .addIntegerOption(option =>
          option
            .setName('limit')
            .setDescription('Número máximo de menções permitidas')
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(true),
        )
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Ação a tomar quando o limite é excedido')
            .setRequired(true)
            .addChoices(
              { name: 'Deletar', value: 'delete' },
              { name: 'Avisar', value: 'warn' },
              { name: 'Timeout', value: 'timeout' },
            ),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: TorquemadaClient) {
    const guildId = interaction.guildId!;
    const subcommand = interaction.options.getSubcommand();
    logger.command(`automod ${subcommand}`, interaction.user.id, guildId);

    try {
      switch (subcommand) {
        case 'toggle':
          await handleToggle(interaction, guildId);
          break;
        case 'antispam':
          await handleAntispam(interaction, guildId);
          break;
        case 'antilink':
          await handleAntilink(interaction, guildId);
          break;
        case 'badwords':
          await handleBadwords(interaction, guildId);
          break;
        case 'maxmentions':
          await handleMaxmentions(interaction, guildId);
          break;
      }
    } catch (error) {
      logger.error(`Erro ao executar automod ${subcommand}:`, error);
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao executar o comando de automod.')],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

async function handleToggle(interaction: ChatInputCommandInteraction, guildId: string) {
  const enabled = interaction.options.getBoolean('enabled', true);

  const result = await automodRepo.toggle(guildId, enabled);
  if (!result) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Não foi possível atualizar o automod.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    embeds: [
      successEmbed(
        'AutoMod Atualizado',
        `O automod foi **${enabled ? 'ativado' : 'desativado'}** com sucesso.`,
      ),
    ],
  });
}

async function handleAntispam(interaction: ChatInputCommandInteraction, guildId: string) {
  const threshold = interaction.options.getInteger('threshold', true);
  const action = interaction.options.getString('action', true) as 'timeout' | 'kick' | 'ban';

  const result = await automodRepo.upsertConfig(guildId, {
    antispam_enabled: true,
    antispam_threshold: threshold,
    antispam_action: action,
  });

  if (!result) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Não foi possível salvar a configuração anti-spam.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const actionLabels: Record<string, string> = {
    timeout: 'Timeout',
    kick: 'Kick',
    ban: 'Ban',
  };

  await interaction.reply({
    embeds: [
      successEmbed(
        'Anti-Spam Configurado',
        `**Limite:** ${threshold} mensagens em 5 segundos\n**Ação:** ${actionLabels[action]}`,
      ),
    ],
  });
}

async function handleAntilink(interaction: ChatInputCommandInteraction, guildId: string) {
  const action = interaction.options.getString('action', true) as 'delete' | 'warn' | 'timeout';
  const allowInput = interaction.options.getString('allow');

  const whitelist = allowInput
    ? allowInput.split(',').map(d => d.trim().toLowerCase()).filter(d => d.length > 0)
    : [];

  const updateData: Record<string, unknown> = {
    antilink_enabled: true,
    antilink_action: action,
  };

  if (whitelist.length > 0) {
    updateData.antilink_whitelist = whitelist;
  }

  const result = await automodRepo.upsertConfig(guildId, updateData);

  if (!result) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Não foi possível salvar a configuração anti-link.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const actionLabels: Record<string, string> = {
    delete: 'Deletar mensagem',
    warn: 'Avisar usuário',
    timeout: 'Timeout',
  };

  let description = `**Ação:** ${actionLabels[action]}`;
  if (whitelist.length > 0) {
    description += `\n**Domínios permitidos:** ${whitelist.map(d => `\`${d}\``).join(', ')}`;
  }

  await interaction.reply({
    embeds: [successEmbed('Anti-Link Configurado', description)],
  });
}

async function handleBadwords(interaction: ChatInputCommandInteraction, guildId: string) {
  const action = interaction.options.getString('action', true);
  const word = interaction.options.getString('word');

  if (action === 'list') {
    const words = await automodRepo.getBadwords(guildId);

    if (words.length === 0) {
      await interaction.reply({
        embeds: [
          infoEmbed(
            '📝 Palavras Proibidas',
            'Nenhuma palavra proibida cadastrada.\n\nUse `/automod badwords action:add word:<palavra>` para adicionar.',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        infoEmbed(
          `📝 Palavras Proibidas (${words.length})`,
          words.map((w, i) => `${i + 1}. \`${w}\``).join('\n'),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!word) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Você precisa especificar uma palavra para adicionar ou remover.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'add') {
    const result = await automodRepo.addBadword(guildId, word);
    if (!result) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Não foi possível adicionar a palavra.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        successEmbed('Palavra Adicionada', `A palavra \`${word.toLowerCase()}\` foi adicionada à lista de palavras proibidas.`),
      ],
    });
  } else if (action === 'remove') {
    const result = await automodRepo.removeBadword(guildId, word);
    if (!result) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Não foi possível remover a palavra.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        successEmbed('Palavra Removida', `A palavra \`${word.toLowerCase()}\` foi removida da lista de palavras proibidas.`),
      ],
    });
  }
}

async function handleMaxmentions(interaction: ChatInputCommandInteraction, guildId: string) {
  const limit = interaction.options.getInteger('limit', true);
  const action = interaction.options.getString('action', true) as 'delete' | 'warn' | 'timeout';

  const result = await automodRepo.upsertConfig(guildId, {
    max_mentions: limit,
    max_mentions_action: action,
  });

  if (!result) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Não foi possível salvar a configuração de menções.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const actionLabels: Record<string, string> = {
    delete: 'Deletar mensagem',
    warn: 'Avisar usuário',
    timeout: 'Timeout',
  };

  await interaction.reply({
    embeds: [
      successEmbed(
        'Limite de Menções Configurado',
        `**Limite:** ${limit} menções por mensagem\n**Ação:** ${actionLabels[action]}`,
      ),
    ],
  });
}

export default command;
