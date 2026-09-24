import { BotConfig, LeaderboardItem } from '../types.ts';

export const DEFAULT_PRIZE_DISTRIBUTION = [800, 500, 400, 350, 300, 250, 200, 100, 75, 25];

export const INITIAL_LEADERBOARD: LeaderboardItem[] = [
  { id: '1', rank: 1, username: 'De**8', wager: 63011.06, prize: 800 },
  { id: '2', rank: 2, username: 'Ah**n', wager: 52350.07, prize: 500 },
  { id: '3', rank: 3, username: 'Pu**i', wager: 47901.68, prize: 400 },
  { id: '4', rank: 4, username: 'be**5', wager: 31268.39, prize: 350 },
  { id: '5', rank: 5, username: 'Co**e', wager: 26768.60, prize: 300 },
  { id: '6', rank: 6, username: 'oz**a', wager: 17988.22, prize: 250 },
  { id: '7', rank: 7, username: 'Bu**u', wager: 13187.94, prize: 200 },
  { id: '8', rank: 8, username: 'Al**5', wager: 12554.31, prize: 100 },
  { id: '9', rank: 9, username: 'Ya**7', wager: 10870.50, prize: 75 },
  { id: '10', rank: 10, username: 'Al**2', wager: 9757.55, prize: 25 },
];

export const DEFAULT_CONFIG: BotConfig = {
  botToken: '',
  chatId: '',
  scheduleTime: '21:00',
  timezone: 'Europe/Istanbul',
  enabled: true,
  totalPrize: 3000,
  headerTemplate: 'STAKE {TARIH} {ODUL}💵 ÖDÜLLÜ GÜNCEL ÇEVRİM LİSTESİ',
  footerTemplate: '!stake',
  autoMask: true,
  dateFormat: 'DD.MM.YYYY',
};

/**
 * Masks a username so it looks like De**8 or Ah**n
 */
export function maskUsername(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '***';
  // If already contains asterisks, leave it as is
  if (trimmed.includes('*')) {
    return trimmed;
  }
  if (trimmed.length <= 2) {
    return `${trimmed[0]}*`;
  }
  if (trimmed.length === 3) {
    return `${trimmed[0]}*${trimmed[2]}`;
  }
  if (trimmed.length === 4) {
    return `${trimmed.slice(0, 2)}*${trimmed.slice(3)}`;
  }
  // 5 or more characters: keep first 2 and last 1, middle with **
  return `${trimmed.slice(0, 2)}**${trimmed.slice(-1)}`;
}

/**
 * Format currency with commas and 2 decimals e.g. 63011.06 -> $63,011.06
 */
export function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format prize e.g. 800 -> -$800
 */
export function formatPrize(prize: number): string {
  if (prize <= 0) return '$0';
  return `-$${prize.toLocaleString('en-US', {
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format date in target timezone as DD.MM.YYYY
 */
export function getFormattedDateInTz(timezone = 'Europe/Istanbul', targetDate = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    // en-GB produces DD/MM/YYYY
    const formatted = formatter.format(targetDate);
    return formatted.replace(/\//g, '.');
  } catch {
    const d = String(targetDate.getDate()).padStart(2, '0');
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const y = targetDate.getFullYear();
    return `${d}.${m}.${y}`;
  }
}

/**
 * Builds the exact Telegram message body
 */
export function buildTelegramMessage(
  config: BotConfig,
  items: LeaderboardItem[],
  customDate?: string
): string {
  const dateStr = customDate || getFormattedDateInTz(config.timezone);
  const totalPrizeStr = config.totalPrize ? `${config.totalPrize}` : '3000';

  let header = config.headerTemplate
    .replace('{TARIH}', dateStr)
    .replace('{ODUL}', totalPrizeStr);

  const lines: string[] = [];
  lines.push(header);
  lines.push(''); // Empty line after header

  // Sort items by rank or index
  const sorted = [...items].sort((a, b) => a.rank - b.rank);

  sorted.forEach((item, idx) => {
    const rank = item.rank || idx + 1;
    const name = config.autoMask ? maskUsername(item.username) : item.username;
    const wagerStr = formatCurrency(item.wager);

    // If showPrizes is explicitly set to false, only show rank, username and wager
    if (config.showPrizes === false) {
      lines.push(`${rank}. ${name} ${wagerStr}`);
    } else if (item.prize && item.prize > 0) {
      const prizeStr = formatPrize(item.prize);
      lines.push(`${rank}. ${name} ${wagerStr} ${prizeStr}`);
    } else {
      lines.push(`${rank}. ${name} ${wagerStr}`);
    }
    lines.push(''); // Telegram message in user example has an empty line between entries!
  });

  if (config.footerTemplate) {
    lines.push(config.footerTemplate);
  }

  return lines.join('\n');
}

/**
 * Parses raw pasted lines or text into leaderboard items
 */
export function parseRawInput(text: string, autoMask = true): LeaderboardItem[] {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const results: LeaderboardItem[] = [];

  let rankCounter = 1;

  for (const line of lines) {
    // Ignore header lines or footer commands like "!stake" or "STAKE" or mayamax
    const lowerLine = line.toLowerCase();
    if (
      line.startsWith('!') ||
      lowerLine.includes('ödüllü') ||
      lowerLine.includes('çevrim') ||
      lowerLine.includes('rank') ||
      lowerLine.includes('username') ||
      lowerLine.includes('mayamax') ||
      lowerLine.includes('maya max') ||
      lowerLine.includes('affiliate') ||
      lowerLine.includes('kampanya')
    ) {
      continue;
    }

    // Pattern 1: User example "1. De**8 $63,011.06 -$800" or "1. De**8 $63,011.06 - $800"
    const standardMatch = line.match(/^(\d+)[\.\)]?\s+([^\s]+)\s+\$?([0-9,\.]+)\s+(?:-?\s*\$?([0-9,\.]+))?/i);
    if (standardMatch) {
      const rank = parseInt(standardMatch[1], 10);
      const username = autoMask ? maskUsername(standardMatch[2]) : standardMatch[2];
      const wager = parseFloat(standardMatch[3].replace(/,/g, '')) || 0;
      const parsedPrize = standardMatch[4] ? parseFloat(standardMatch[4].replace(/,/g, '')) : undefined;
      const prize = parsedPrize !== undefined ? parsedPrize : (DEFAULT_PRIZE_DISTRIBUTION[rank - 1] ?? 0);

      results.push({
        id: Math.random().toString(36).substring(2, 9),
        rank,
        username,
        wager,
        prize,
      });
      rankCounter = rank + 1;
      continue;
    }

    // Pattern 2: "De**8 63,011.06" or "De**8 $63011.06"
    const simpleMatch = line.match(/^([^\s]+)\s+\$?([0-9,\.]+)(?:\s+(?:-?\s*\$?([0-9,\.]+)))?/i);
    if (simpleMatch) {
      const username = autoMask ? maskUsername(simpleMatch[1]) : simpleMatch[1];
      const wager = parseFloat(simpleMatch[2].replace(/,/g, '')) || 0;
      const parsedPrize = simpleMatch[3] ? parseFloat(simpleMatch[3].replace(/,/g, '')) : undefined;
      const prize = parsedPrize !== undefined ? parsedPrize : (DEFAULT_PRIZE_DISTRIBUTION[rankCounter - 1] ?? 0);

      results.push({
        id: Math.random().toString(36).substring(2, 9),
        rank: rankCounter,
        username,
        wager,
        prize,
      });
      rankCounter++;
      continue;
    }

    // Pattern 3: Tab or Comma separated e.g. "1, De**8, 63011.06, 800"
    const parts = line.split(/[,\t|]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      let rank = rankCounter;
      let nameIdx = 0;
      let wagerIdx = 1;
      let prizeIdx = 2;

      // If first column is a number like 1, 2, 3
      if (/^\d+$/.test(parts[0])) {
        rank = parseInt(parts[0], 10);
        nameIdx = 1;
        wagerIdx = 2;
        prizeIdx = 3;
      }

      const rawName = parts[nameIdx] || `User${rank}`;
      const username = autoMask ? maskUsername(rawName) : rawName;
      const rawWager = (parts[wagerIdx] || '').replace(/[^0-9.]/g, '');
      const wager = parseFloat(rawWager) || 0;
      const rawPrize = parts[prizeIdx] ? (parts[prizeIdx] || '').replace(/[^0-9.]/g, '') : null;
      const prize = rawPrize !== null ? (parseFloat(rawPrize) || 0) : (DEFAULT_PRIZE_DISTRIBUTION[rank - 1] ?? 0);

      results.push({
        id: Math.random().toString(36).substring(2, 9),
        rank,
        username,
        wager,
        prize,
      });
      rankCounter = rank + 1;
    }
  }

  return results;
}
