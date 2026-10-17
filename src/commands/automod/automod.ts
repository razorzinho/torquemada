import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  TextChannel,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import {
  automodRepo,
  BADWORD_PUNISHMENT_DESCRIPTIONS,
  BADWORD_PUNISHMENT_SHORT_LABELS,
} from '../../database/repositories/automod';
import { guildSettingsRepo } from '../../database/repositories/guildSettings';
import { BadwordPunishment } from '../../types/database';
import { DEFAULT_BADWORDS_PRESET, isSevereBadword } from '../../utils/textNormalizer';
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
        .setName('logchannel')
        .setDescription('Define ou remove o canal de logs exclusivo do AutoMod')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Canal de texto para logs do AutoMod (deixe vazio para usar o padrão do /setlog)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
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
        .setDescription('Gerencia a lista de palavras/expressões proibidas e punições por nível')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Ação a realizar')
            .setRequired(true)
            .addChoices(
              { name: 'Adicionar', value: 'add' },
              { name: 'Remover', value: 'remove' },
              { name: 'Listar', value: 'list' },
              { name: 'Configurar Punição do Nível (Tier)', value: 'config' },
              { name: 'Carregar Preset Padrão', value: 'preset' },
            ),
        )
        .addStringOption(option =>
          option
            .setName('word')
            .setDescription('Palavra(s) ou frase(s) separadas por vírgula (suporta * no fim para prefixos)')
            .setRequired(false),
        )
        .addStringOption(option =>
          option
            .setName('tier')
            .setDescription('Nível de severidade (Tier) para adicionar a palavra ou configurar a punição')
            .setRequired(false)
            .addChoices(
              { name: 'Nível 1 — Ofensas Graves', value: 'severe' },
              { name: 'Nível 2 — Termos Restritos, Debates e Memes', value: 'moderate' },
            ),
        )
        .addStringOption(option =>
          option
            .setName('punishment')
            .setDescription('Severidade da punição para o nível selecionado')
            .setRequired(false)
            .addChoices(
              { name: 'Apenas Deletar Mensagem', value: 'delete' },
              { name: 'Deletar + Avisar no Chat', value: 'warn' },
              { name: 'Deletar + Timeout (1 min)', value: 'timeout' },
              { name: 'Deletar + Expulsar (Kick)', value: 'kick' },
              { name: 'Deletar + Banir (Ban)', value: 'ban' },
            ),
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
        case 'logchannel':
          await handleLogchannel(interaction, guildId);
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

async function handleLogchannel(interaction: ChatInputCommandInteraction, guildId: string) {
  const channel = interaction.options.getChannel('channel') as TextChannel | null;

  const result = await automodRepo.setLogChannel(guildId, channel?.id ?? null);
  if (!result) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Não foi possível salvar o canal de logs do AutoMod.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (channel) {
    await interaction.reply({
      embeds: [
        successEmbed(
          'Canal de Logs do AutoMod Configurado',
          `Os alertas de mensagens flagadas pelo AutoMod agora serão enviados em ${channel}.`,
        ),
      ],
    });
  } else {
    const fallbackLog = await guildSettingsRepo.getLogChannel(guildId);
    const fallbackText = fallbackLog?.log_channel
      ? `<#${fallbackLog.log_channel}> (configurado via \`/setlog\`)`
      : '_Nenhum canal configurado em `/setlog`_';

    await interaction.reply({
      embeds: [
        infoEmbed(
          '📋 Canal Exclusivo do AutoMod Removido',
          `O canal exclusivo do AutoMod foi desvinculado.\n**Canal utilizado atualmente (fallback):** ${fallbackText}`,
        ),
      ],
    });
  }
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
  const wordInput = interaction.options.getString('word');
  const tierOption = interaction.options.getString('tier') as 'severe' | 'moderate' | null;
  const punishment = interaction.options.getString('punishment') as BadwordPunishment | null;

  if (action === 'config') {
    if (!tierOption || !punishment) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Parâmetros Obrigatórios',
            'Para configurar a punição de um nível, informe tanto **`tier`** (Nível 1 ou Nível 2) quanto **`punishment`** (a severidade da punição).',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const updated = await automodRepo.setTierPunishment(guildId, tierOption, punishment);
    if (!updated) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Não foi possível salvar a configuração de punição do nível.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const tierName =
      tierOption === 'severe'
        ? '🔇 Nível 1 — Ofensas Graves'
        : '⚠️ Nível 2 — Termos Restritos, Debates e Memes';

    await interaction.reply({
      embeds: [
        successEmbed(
          'Punição do Nível Atualizada',
          `**Nível:** ${tierName}\n` +
            `**Nova Punição:** ${BADWORD_PUNISHMENT_SHORT_LABELS[punishment]}\n` +
            `**Descrição:** *${BADWORD_PUNISHMENT_DESCRIPTIONS[punishment]}*`,
        ),
      ],
    });
    return;
  }

  if (action === 'list') {
    // Se o moderador passou tier + punishment junto com o Listar, já atualiza antes de listar
    if (tierOption && punishment) {
      await automodRepo.setTierPunishment(guildId, tierOption, punishment);
    }

    const config = await automodRepo.getConfig(guildId);
    const words = config?.badwords ?? DEFAULT_BADWORDS_PRESET;
    const severePunishment: BadwordPunishment = config?.badwords_severe_action ?? 'timeout';
    const moderatePunishment: BadwordPunishment = config?.badwords_action ?? 'warn';

    if (words.length === 0) {
      await interaction.reply({
        embeds: [
          infoEmbed(
            '📝 Palavras Proibidas',
            'Nenhuma palavra proibida cadastrada.\n\nUse `/automod badwords action:add word:<palavra>` ou `/automod badwords action:preset` para carregar a lista padrão.',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const severeList = words
      .filter(w => isSevereBadword(w))
      .map(w => w.replace(/^!+/, ''))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map(w => `\`${w}\``);

    const moderateList = words
      .filter(w => !isSevereBadword(w))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map(w => `\`${w}\``);

    const truncateText = (items: string[], maxLen = 3700) => {
      if (items.length === 0) return '*Nenhuma palavra cadastrada neste nível.*';
      const joined = items.join(', ');
      return joined.length > maxLen ? joined.slice(0, maxLen) + '...' : joined;
    };

    const severeEmbed = infoEmbed(
      `🔇 Nível 1 — Ofensas Graves (${severeList.length})`,
      `**Ação Configurada:** ${BADWORD_PUNISHMENT_SHORT_LABELS[severePunishment]} — *${BADWORD_PUNISHMENT_DESCRIPTIONS[severePunishment]}*\n\n` +
        truncateText(severeList),
    );

    const moderateEmbed = infoEmbed(
      `⚠️ Nível 2 — Termos Restritos, Debates e Memes (${moderateList.length})`,
      `**Ação Configurada:** ${BADWORD_PUNISHMENT_SHORT_LABELS[moderatePunishment]} — *${BADWORD_PUNISHMENT_DESCRIPTIONS[moderatePunishment]}*\n\n` +
        truncateText(moderateList),
    );

    const fallbackLog = !config?.log_channel_id
      ? await guildSettingsRepo.getLogChannel(guildId)
      : null;
    const logChannelInfo = config?.log_channel_id
      ? `<#${config.log_channel_id}> *(exclusivo do AutoMod)*`
      : fallbackLog?.log_channel
        ? `<#${fallbackLog.log_channel}> *(padrão do \`/setlog\`)*`
        : '*Nenhum configurado (use `/automod logchannel`)*';

    await interaction.reply({
      content:
        `📋 **Total de regras ativas no detector:** \`${words.length}\` *(palavras com \`*\` no fim capturam qualquer sufixo)*\n` +
        `📢 **Canal de Logs do AutoMod:** ${logChannelInfo}`,
      embeds: [severeEmbed, moderateEmbed],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'preset') {
    const result = await automodRepo.addBadwords(
      guildId,
      DEFAULT_BADWORDS_PRESET,
      punishment ?? undefined,
      tierOption ?? undefined,
    );
    if (!result) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Não foi possível carregar o preset de palavras proibidas.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        successEmbed(
          'Preset Carregado',
          `Foram carregadas **${DEFAULT_BADWORDS_PRESET.length}** raízes e expressões no filtro inteligente do AutoMod (total atual: **${result.badwords.length}**).`,
        ),
      ],
    });
    return;
  }

  if (!wordInput) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Você precisa especificar ao menos uma palavra (ou várias separadas por vírgula).')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const parsedWords = wordInput
    .split(',')
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 0);

  if (parsedWords.length === 0) {
    await interaction.reply({
      embeds: [errorEmbed('Erro', 'Nenhuma palavra válida informada.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'add') {
    const targetTier: 'severe' | 'moderate' =
      tierOption ??
      (punishment === 'timeout' || punishment === 'kick' || punishment === 'ban'
        ? 'severe'
        : 'moderate');

    const wordsToSave = parsedWords.map(w => {
      const clean = w.replace(/^!+/, '');
      if (targetTier === 'severe' && !isSevereBadword(clean)) {
        return `!${clean}`;
      }
      return clean;
    });

    const result = await automodRepo.addBadwords(
      guildId,
      wordsToSave,
      punishment ?? undefined,
      targetTier,
    );
    if (!result) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Não foi possível adicionar as palavras.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const activePunishment: BadwordPunishment =
      targetTier === 'severe'
        ? (result.badwords_severe_action ?? 'timeout')
        : (result.badwords_action ?? 'warn');

    const tierLabel =
      targetTier === 'severe'
        ? `Nível 1 — Ofensas Graves (${BADWORD_PUNISHMENT_DESCRIPTIONS[activePunishment]})`
        : `Nível 2 — Termos Restritos (${BADWORD_PUNISHMENT_DESCRIPTIONS[activePunishment]})`;

    const listStr = parsedWords.map(w => `\`${w.replace(/^!+/, '')}\``).join(', ');
    await interaction.reply({
      embeds: [
        successEmbed(
          parsedWords.length > 1 ? 'Palavras Adicionadas' : 'Palavra Adicionada',
          `${listStr} adicionada(s) em **${tierLabel}** (total: **${result.badwords.length}**).`,
        ),
      ],
    });
  } else if (action === 'remove') {
    const result = await automodRepo.removeBadwords(guildId, parsedWords);
    if (!result) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Não foi possível remover as palavras.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const listStr = parsedWords.map(w => `\`${w}\``).join(', ');
    await interaction.reply({
      embeds: [
        successEmbed(
          parsedWords.length > 1 ? 'Palavras Removidas' : 'Palavra Removida',
          `${listStr} removida(s) da lista de palavras proibidas (total: **${result.badwords.length}**).`,
        ),
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
