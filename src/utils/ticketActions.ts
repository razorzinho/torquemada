import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ticketsRepo } from '../database/repositories/tickets';

const styleMap: Record<string, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

/**
 * Builds an ActionRow containing all custom action buttons for a panel.
 * Returns null if no custom buttons are configured.
 */
export async function getActionRowForPanel(panelId: number): Promise<ActionRowBuilder<ButtonBuilder> | null> {
  const buttons = await ticketsRepo.getActionButtons(panelId);
  
  if (!buttons || buttons.length === 0) {
    return null;
  }

  const row = new ActionRowBuilder<ButtonBuilder>();

  for (const btn of buttons) {
    const builder = new ButtonBuilder()
      .setCustomId(`ticket_mod_action:${btn.id}`)
      .setLabel(btn.label)
      .setStyle(styleMap[btn.style] ?? ButtonStyle.Primary);
      
    if (btn.emoji) {
      builder.setEmoji(btn.emoji);
    }
    
    row.addComponents(builder);
  }

  return row;
}
