import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
  Message,
  Collection,
  ChannelType,
} from 'discord.js';
import { TorquemadaClient } from '../../client';
import { Command } from '../../types/command';
import { checkPermissions, checkBotPermissions } from '../../utils/permissions';
import { errorEmbed, purgeEmbed, progressEmbed } from '../../utils/embeds';
import { logger } from '../../utils/logger';
import { withRateLimit, sleep } from '../../utils/rateLimiter';

const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

/**
 * Fetches up to `amount` messages from the channel, applying an optional filter.
 * Iterates through the API in batches of 100.
 */
async function fetchMessages(
  channel: TextChannel,
  amount: number,
  filter?: (msg: Message) => boolean,
  options?: { before?: string; after?: string },
): Promise<Message[]> {
  const collected: Message[] = [];
  let lastId: string | undefined = options?.before;
  // For 'after', we fetch forward from that message
  const fetchAfter: string | undefined = options?.after;

  while (collected.length < amount) {
    const remaining = amount - collected.length;
    // We fetch more than remaining when filtering, to increase chances of getting enough
    const limit = filter ? Math.min(100, remaining * 2) : Math.min(100, remaining);

    const fetchOptions: { limit: number; before?: string; after?: string } = { limit };
    if (fetchAfter && !lastId) {
      fetchOptions.after = fetchAfter;
    } else if (lastId) {
      fetchOptions.before = lastId;
    }

    const fetched = await withRateLimit(() => channel.messages.fetch(fetchOptions));

    if (fetched.size === 0) break;

    // Sort by timestamp descending for 'before' mode, ascending for 'after' mode
    const sorted = fetchAfter && !lastId
      ? [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      : [...fetched.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    for (const msg of sorted) {
      if (collected.length >= amount) break;
      if (!filter || filter(msg)) {
        collected.push(msg);
      }
    }

    // Update lastId for pagination
    if (fetchAfter && !lastId) {
      // After fetching 'after', switch to 'before' pagination from the newest message
      lastId = sorted[sorted.length - 1]?.id;
      // If we fetched less than limit, there are no more messages
      if (fetched.size < limit) break;
      // For subsequent fetches after the first 'after', we paginate with before from the end
      // Actually for 'after', we need to keep going forward
      const newest = [...fetched.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp)[0];
      if (newest) {
        // Use after with the newest ID to keep going forward
        // Reset to use the after approach
        lastId = undefined;
        // We need a different approach: keep using 'after' with the latest ID
      }
      if (fetched.size < limit) break;
    } else {
      lastId = sorted[sorted.length - 1]?.id;
      if (fetched.size < limit) break;
    }
  }

  return collected;
}

/**
 * Fetches messages using the 'after' cursor, collecting up to `amount` matching messages.
 */
async function fetchMessagesAfter(
  channel: TextChannel,
  afterId: string,
  amount: number,
  filter?: (msg: Message) => boolean,
): Promise<Message[]> {
  const collected: Message[] = [];
  let cursor: string = afterId;

  while (collected.length < amount) {
    const limit = 100;
    const fetched = await withRateLimit(() =>
      channel.messages.fetch({ limit, after: cursor }),
    );

    if (fetched.size === 0) break;

    // Messages fetched with 'after' come newest-first, sort ascending
    const sorted = [...fetched.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp,
    );

    for (const msg of sorted) {
      if (collected.length >= amount) break;
      if (!filter || filter(msg)) {
        collected.push(msg);
      }
    }

    cursor = sorted[sorted.length - 1].id;
    if (fetched.size < limit) break;
  }

  return collected;
}

/**
 * Deletes messages, using bulk delete for recent ones and individual delete for old ones.
 * Shows progress via an editable embed.
 */
async function deleteMessages(
  interaction: ChatInputCommandInteraction,
  channel: TextChannel,
  messages: Message[],
): Promise<{ bulkDeleted: number; individualDeleted: number; failed: number }> {
  const now = Date.now();
  const recent: Message[] = [];
  const old: Message[] = [];

  for (const msg of messages) {
    if (now - msg.createdTimestamp < FOURTEEN_DAYS) {
      recent.push(msg);
    } else {
      old.push(msg);
    }
  }

  let bulkDeleted = 0;
  let individualDeleted = 0;
  let failed = 0;
  const total = messages.length;

  // Bulk delete recent messages in batches of 100
  for (let i = 0; i < recent.length; i += 100) {
    const batch = recent.slice(i, i + 100);
    try {
      const deleted = await withRateLimit(() => channel.bulkDelete(batch, true));
      bulkDeleted += deleted.size;
    } catch (error) {
      logger.error('Erro no bulkDelete:', error);
      failed += batch.length;
    }

    const progress = bulkDeleted + individualDeleted + failed;
    if (total > 100) {
      try {
        await interaction.editReply({
          embeds: [progressEmbed(progress, total, 'Limpando mensagens...')],
        });
      } catch { /* interaction may have been deleted */ }
    }
  }

  // Individually delete old messages
  for (let i = 0; i < old.length; i++) {
    try {
      await withRateLimit(() => old[i].delete());
      individualDeleted++;
    } catch (error: any) {
      // Message already deleted or unknown
      if (error?.code !== 10008) {
        logger.error('Erro ao deletar mensagem antiga:', error);
      }
      failed++;
    }

    // Update progress every 5 messages
    if ((i + 1) % 5 === 0 || i === old.length - 1) {
      const progress = bulkDeleted + individualDeleted + failed;
      try {
        await interaction.editReply({
          embeds: [progressEmbed(progress, total, 'Limpando mensagens...')],
        });
      } catch { /* interaction may have been deleted */ }
    }

    // Small delay between individual deletes to avoid rate limits
    if (i < old.length - 1) {
      await sleep(300);
    }
  }

  return { bulkDeleted, individualDeleted, failed };
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Limpa mensagens do canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
      sub
        .setName('amount')
        .setDescription('Apaga as últimas N mensagens do canal')
        .addIntegerOption(opt =>
          opt
            .setName('quantidade')
            .setDescription('Quantidade de mensagens para apagar (1-1000)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('user')
        .setDescription('Apaga as últimas N mensagens de um usuário específico')
        .addStringOption(opt =>
          opt
            .setName('user_id')
            .setDescription('ID do usuário (funciona mesmo com contas deletadas)')
            .setRequired(true),
        )
        .addIntegerOption(opt =>
          opt
            .setName('quantidade')
            .setDescription('Quantidade de mensagens para apagar (1-1000)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('bots')
        .setDescription('Apaga as últimas N mensagens de bots')
        .addIntegerOption(opt =>
          opt
            .setName('quantidade')
            .setDescription('Quantidade de mensagens para apagar (1-1000)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('contains')
        .setDescription('Apaga mensagens que contêm um texto específico')
        .addStringOption(opt =>
          opt
            .setName('texto')
            .setDescription('Texto para filtrar')
            .setRequired(true),
        )
        .addIntegerOption(opt =>
          opt
            .setName('quantidade')
            .setDescription('Quantidade de mensagens para apagar (1-1000)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('attachments')
        .setDescription('Apaga mensagens que contêm anexos')
        .addIntegerOption(opt =>
          opt
            .setName('quantidade')
            .setDescription('Quantidade de mensagens para apagar (1-1000)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('before')
        .setDescription('Apaga N mensagens antes de uma mensagem específica')
        .addStringOption(opt =>
          opt
            .setName('message_id')
            .setDescription('ID da mensagem de referência')
            .setRequired(true),
        )
        .addIntegerOption(opt =>
          opt
            .setName('quantidade')
            .setDescription('Quantidade de mensagens para apagar (1-1000)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('after')
        .setDescription('Apaga N mensagens após uma mensagem específica')
        .addStringOption(opt =>
          opt
            .setName('message_id')
            .setDescription('ID da mensagem de referência')
            .setRequired(true),
        )
        .addIntegerOption(opt =>
          opt
            .setName('quantidade')
            .setDescription('Quantidade de mensagens para apagar (1-1000)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction, client: TorquemadaClient) {
    if (!interaction.guild) return;

    logger.command('purge', interaction.user.id, interaction.guild.id);

    // Permission checks
    if (!(await checkPermissions(interaction, [PermissionFlagsBits.ManageMessages]))) return;
    if (!(await checkBotPermissions(interaction, [PermissionFlagsBits.ManageMessages]))) return;

    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        embeds: [errorEmbed('Erro', 'Este comando só pode ser usado em canais de texto.')],
        ephemeral: true,
      });
      return;
    }

    const textChannel = channel as TextChannel;
    const subcommand = interaction.options.getSubcommand();
    const amount = interaction.options.getInteger('quantidade', true);

    await interaction.deferReply({ ephemeral: true });

    try {
      let messages: Message[];
      let filterDescription: string;

      switch (subcommand) {
        case 'amount': {
          messages = await fetchMessages(textChannel, amount);
          filterDescription = 'todas';
          break;
        }

        case 'user': {
          const userId = interaction.options.getString('user_id', true).trim();
          messages = await fetchMessages(textChannel, amount, msg => msg.author?.id === userId);
          filterDescription = `do usuário \`${userId}\``;
          break;
        }

        case 'bots': {
          messages = await fetchMessages(textChannel, amount, msg => msg.author?.bot === true);
          filterDescription = 'de bots';
          break;
        }

        case 'contains': {
          const text = interaction.options.getString('texto', true).toLowerCase();
          messages = await fetchMessages(
            textChannel,
            amount,
            msg => msg.content.toLowerCase().includes(text),
          );
          filterDescription = `contendo "${text}"`;
          break;
        }

        case 'attachments': {
          messages = await fetchMessages(
            textChannel,
            amount,
            msg => msg.attachments.size > 0,
          );
          filterDescription = 'com anexos';
          break;
        }

        case 'before': {
          const messageId = interaction.options.getString('message_id', true).trim();
          messages = await fetchMessages(textChannel, amount, undefined, { before: messageId });
          filterDescription = `antes de \`${messageId}\``;
          break;
        }

        case 'after': {
          const messageId = interaction.options.getString('message_id', true).trim();
          messages = await fetchMessagesAfter(textChannel, messageId, amount);
          filterDescription = `após \`${messageId}\``;
          break;
        }

        default:
          return;
      }

      if (messages.length === 0) {
        await interaction.editReply({
          embeds: [errorEmbed('Nenhuma mensagem encontrada', 'Não foram encontradas mensagens com os critérios especificados.')],
        });
        return;
      }

      // Show initial progress
      await interaction.editReply({
        embeds: [progressEmbed(0, messages.length, 'Limpando mensagens...')],
      });

      const result = await deleteMessages(interaction, textChannel, messages);
      const totalDeleted = result.bulkDeleted + result.individualDeleted;

      // Build result description
      const parts: string[] = [
        `**${totalDeleted}** mensagens apagadas (${filterDescription})`,
      ];
      if (result.bulkDeleted > 0) {
        parts.push(`📦 Bulk delete: **${result.bulkDeleted}**`);
      }
      if (result.individualDeleted > 0) {
        parts.push(`🔨 Delete individual: **${result.individualDeleted}**`);
      }
      if (result.failed > 0) {
        parts.push(`⚠️ Falhas: **${result.failed}**`);
      }

      await interaction.editReply({
        embeds: [purgeEmbed('Limpeza Concluída', parts.join('\n'))],
      });

      logger.success(
        `Purge: ${totalDeleted} mensagens apagadas em #${textChannel.name} (${interaction.guild.name})`,
      );
    } catch (error) {
      logger.error('Erro no comando purge:', error);
      await interaction.editReply({
        embeds: [errorEmbed('Erro', 'Ocorreu um erro ao tentar limpar as mensagens.')],
      });
    }
  },
};

export default command;
