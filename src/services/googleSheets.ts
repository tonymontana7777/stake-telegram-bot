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
  const timestamp = Date.now();
  let sheetName = '';
  if (cleanRange.includes('!')) {
    sheetName = cleanRange.split('!')[0].trim();
  }
  const csvUrl = sheetName
    ? `https://docs.google.com/spreadsheets/d/${cleanId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&tq=&_t=${timestamp}`
    : `https://docs.google.com/spreadsheets/d/${cleanId}/export?format=csv&id=${cleanId}&_t=${timestamp}`;

  const csvResponse = await fetch(csvUrl, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
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
  let userCol = -1;
  let wagerCol = -1;
  let prizeCol = -1;
  let rankCol = -1;

  // Inspect the first 5 rows to locate header columns
  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').toLowerCase().trim();
      if (!val) continue;

      if (val.includes('kullanıcı') || val.includes('username') || val.includes('user') || val.includes('oyuncu') || val === 'isim' || val === 'name') {
        userCol = c;
        startIndex = Math.max(startIndex, r + 1);
      } else if (val.includes('wager') || val.includes('çevrim') || val.includes('turnover') || val.includes('bet') || val.includes('tutar') || val.includes('amount')) {
        wagerCol = c;
        startIndex = Math.max(startIndex, r + 1);
      } else if (val.includes('ödül') || val.includes('prize') || val.includes('reward')) {
        prizeCol = c;
      } else if (val.includes('sıra') || val.includes('rank') || val === 'no' || val === '#') {
        rankCol = c;
      }
    }
    if (userCol !== -1 && wagerCol !== -1) {
      break;
    }
  }

  // Fallback column detection if no explicit headers found
  if (userCol === -1 || wagerCol === -1) {
    // Scan rows to find which column looks like usernames and which looks like numbers/currency
    const sampleRow = rows[startIndex] || rows[0];
    if (sampleRow) {
      for (let c = 0; c < sampleRow.length; c++) {
        const val = String(sampleRow[c] || '').trim();
        const lower = val.toLowerCase();
        // Skip mayamax campaign/affiliate column
        if (lower.includes('mayamax') || lower.includes('maya max')) continue;

        const isNumeric = /^[\$€₺]?\s*[\d,]+(\.\d+)?\s*[\$€₺]?$/.test(val);
        if (isNumeric && wagerCol === -1) {
          wagerCol = c;
        } else if (!isNumeric && userCol === -1 && val.length > 0 && !/^\d+$/.test(val)) {
          userCol = c;
        }
      }
    }
  }

  // Ultimate defaults if still not found
  if (userCol === -1) userCol = 0;
  if (wagerCol === -1) wagerCol = userCol === 0 ? 1 : 0;

  let rankCounter = 1;

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // Filter empty rows
    const nonEmpties = row.filter((c) => c !== undefined && c !== null && String(c).trim() !== '');
    if (nonEmpties.length === 0) continue;

    // Find actual username in the row
    let rawUsername = '';
    let rawWagerStr = '';
    let rawPrizeStr = '';

    // If explicit userCol is set
    if (userCol !== -1 && row[userCol] !== undefined) {
      rawUsername = String(row[userCol]).trim();
    }

    // Check if rawUsername is "mayamax", campaign name, or empty -> search other columns
    const isExcluded = (name: string) => {
      const lower = name.toLowerCase().trim();
      return (
        !lower ||
        lower.includes('mayamax') ||
        lower.includes('maya max') ||
        lower.includes('toplam') ||
        lower.includes('total') ||
        lower.includes('affiliate') ||
        lower.includes('campaign') ||
        lower.includes('kampanya') ||
        lower === 'user' ||
        lower === 'username' ||
        lower === 'kullanıcı adı'
      );
    };

    if (isExcluded(rawUsername)) {
      // Look for another column that has an actual username (string that isn't mayamax and isn't pure numeric)
      for (let c = 0; c < row.length; c++) {
        const candidate = String(row[c] || '').trim();
        if (c !== wagerCol && !isExcluded(candidate) && !/^[\$€₺]?\s*[\d,]+(\.\d+)?\s*[\$€₺]?$/.test(candidate) && !/^\d+$/.test(candidate)) {
          rawUsername = candidate;
          break;
        }
      }
    }

    // If still excluded or empty, skip this row entirely!
    if (isExcluded(rawUsername)) {
      continue;
    }

    // Get wager
    if (wagerCol !== -1 && row[wagerCol] !== undefined) {
      rawWagerStr = String(row[wagerCol]);
    } else {
      // Find numeric cell
      for (let c = 0; c < row.length; c++) {
        const candidate = String(row[c] || '').trim();
        if (/^[\$€₺]?\s*[\d,]+(\.\d+)?\s*[\$€₺]?$/.test(candidate)) {
          rawWagerStr = candidate;
          break;
        }
      }
    }

    const wager = parseFloat(rawWagerStr.replace(/[^0-9.]/g, '')) || 0;

    // Get prize
    let prize = 0;
    if (prizeCol !== -1 && row[prizeCol] !== undefined && String(row[prizeCol]).trim() !== '') {
      prize = parseFloat(String(row[prizeCol]).replace(/[^0-9.]/g, '')) || 0;
    } else {
      prize = DEFAULT_PRIZE_DISTRIBUTION[rankCounter - 1] ?? 0;
    }

    const username = autoMask ? maskUsername(rawUsername) : rawUsername;

    results.push({
      id: Math.random().toString(36).substring(2, 9),
      rank: rankCounter,
      username,
      wager,
      prize,
    });

    rankCounter++;
  }

  // Sort by wager descending (highest wager on top)
  if (results.some((r) => r.wager > 0)) {
    results.sort((a, b) => b.wager - a.wager);
    results.forEach((item, idx) => {
      item.rank = idx + 1;
    });
  }

  return results;
}
