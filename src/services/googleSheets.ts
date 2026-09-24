import { LeaderboardItem } from '../types.ts';
import { maskUsername, DEFAULT_PRIZE_DISTRIBUTION } from '../utils/formatters.ts';

/**
 * Extracts spreadsheetId from URL or raw ID
 * Example: https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0
 */
export function extractSpreadsheetId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return trimmed;
}

/**
 * Fetches values from Google Sheets API using access token
 */
export async function fetchGoogleSheetData(
  spreadsheetId: string,
  range: string,
  accessToken?: string | null
): Promise<any[][]> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const cleanRange = range ? range.trim() : 'A1:E50';

  // If accessToken is provided, use Google Sheets REST API
  if (accessToken && accessToken.trim()) {
    const encodedRange = encodeURIComponent(cleanRange);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodedRange}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      return data.values || [];
    }
  }

  // Fallback: Fetch directly via Google Sheets CSV export (works for 'anyone with link' or public sheets without token)
  let sheetName = '';
  if (cleanRange.includes('!')) {
    sheetName = cleanRange.split('!')[0].trim();
  }
  const csvUrl = sheetName
    ? `https://docs.google.com/spreadsheets/d/${cleanId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`
    : `https://docs.google.com/spreadsheets/d/${cleanId}/export?format=csv`;

  const csvResponse = await fetch(csvUrl);
  if (!csvResponse.ok) {
    throw new Error(
      `Google E-Tablo okunamadı (${csvResponse.status}). Lütfen tablonun Paylaşım ayarlarından "Bağlantıya sahip olan herkes görüntüleyebilir" seçeneğinin açık olduğundan veya Google ile giriş yapıldığından emin olun.`
    );
  }

  const csvText = await csvResponse.text();
  return parseCsvToRows(csvText);
}

/**
 * Robust CSV parser handling quotes and commas
 */
export function parseCsvToRows(csvText: string): string[][] {
  const rows: string[][] = [];
  const lines = csvText.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;
    const row: string[] = [];
    let insideQuote = false;
    let entry = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuote && line[i + 1] === '"') {
          entry += '"';
          i++; // skip escaped quote
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        row.push(entry.trim());
        entry = '';
      } else {
        entry += char;
      }
    }
    row.push(entry.trim());
    if (row.length > 0) {
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Parses raw 2D array of rows from Google Sheets into LeaderboardItem array
 */
export function parseSheetRowsToLeaderboard(
  rows: any[][],
  autoMask = true
): LeaderboardItem[] {
  if (!rows || rows.length === 0) return [];

  const results: LeaderboardItem[] = [];
  let startIndex = 0;

  // Check if first row is header (e.g. contains "name", "rank", "wager", "çevrim", "kullanıcı")
  const firstRowStr = rows[0].map((cell) => String(cell).toLowerCase()).join(' ');
  if (
    firstRowStr.includes('rank') ||
    firstRowStr.includes('sıra') ||
    firstRowStr.includes('user') ||
    firstRowStr.includes('kullanıcı') ||
    firstRowStr.includes('wager') ||
    firstRowStr.includes('çevrim') ||
    firstRowStr.includes('ödül') ||
    firstRowStr.includes('isim')
  ) {
    startIndex = 1;
  }

  let rankCounter = 1;

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // Filter empty cells
    const nonEmpties = row.filter((c) => c !== undefined && c !== null && String(c).trim() !== '');
    if (nonEmpties.length === 0) continue;

    let rank = rankCounter;
    let nameIdx = 0;
    let wagerIdx = 1;
    let prizeIdx = 2;

    // Detect column pattern
    // Case 1: Col 0 is rank number e.g. [1, "De**8", "$63,011.06", "$800"]
    if (/^\d+$/.test(String(row[0]).trim())) {
      rank = parseInt(String(row[0]).trim(), 10);
      nameIdx = 1;
      wagerIdx = 2;
      prizeIdx = 3;
    }

    const rawUsername = String(row[nameIdx] || `Oyuncu${rankCounter}`).trim();
    if (!rawUsername) continue;

    // EXCLUDE "mayamax" or affiliate owner / header labels
    const lowerName = rawUsername.toLowerCase();
    if (
      lowerName.includes('mayamax') ||
      lowerName.includes('maya max') ||
      lowerName.includes('toplam') ||
      lowerName.includes('total') ||
      lowerName.includes('affiliate') ||
      lowerName.includes('campaign') ||
      lowerName.includes('kampanya')
    ) {
      continue;
    }

    const username = autoMask ? maskUsername(rawUsername) : rawUsername;

    // Parse wager
    const rawWager = String(row[wagerIdx] || '0').replace(/[^0-9.]/g, '');
    const wager = parseFloat(rawWager) || 0;

    // Parse prize (if not in sheet, auto assign from prize pool or default distribution)
    let prize = 0;
    if (row[prizeIdx] !== undefined && row[prizeIdx] !== null && String(row[prizeIdx]).trim() !== '') {
      const rawPrize = String(row[prizeIdx]).replace(/[^0-9.]/g, '');
      prize = parseFloat(rawPrize) || 0;
    } else {
      prize = DEFAULT_PRIZE_DISTRIBUTION[rankCounter - 1] ?? 0;
    }

    results.push({
      id: Math.random().toString(36).substring(2, 9),
      rank: rankCounter,
      username,
      wager,
      prize,
    });

    rankCounter++;
  }

  // Sort by wager descending or rank ascending
  return results.sort((a, b) => a.rank - b.rank);
}
