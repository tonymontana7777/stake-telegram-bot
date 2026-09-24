import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { BotConfig, LeaderboardItem, BroadcastLog } from './src/types.ts';
import {
  DEFAULT_CONFIG,
  INITIAL_LEADERBOARD,
  buildTelegramMessage,
  getFormattedDateInTz,
  maskUsername,
} from './src/utils/formatters.ts';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
// Render persistent disk support or local data directory
const DATA_DIR = fs.existsSync('/var/data')
  ? '/var/data'
  : path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'bot-data.json');

interface StoredData {
  config: BotConfig;
  items: LeaderboardItem[];
  logs: BroadcastLog[];
  lastRunDate: string | null;
}

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState(): StoredData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      return {
        config: { ...DEFAULT_CONFIG, ...(parsed.config || {}) },
        items: parsed.items && parsed.items.length > 0 ? parsed.items : INITIAL_LEADERBOARD,
        logs: parsed.logs || [],
        lastRunDate: parsed.lastRunDate || null,
      };
    }
  } catch (err) {
    console.error('Failed to load state, using defaults:', err);
  }
  return {
    config: { ...DEFAULT_CONFIG },
    items: INITIAL_LEADERBOARD,
    logs: [],
    lastRunDate: null,
  };
}

let state: StoredData = loadState();

state.config = {
  ...state.config,
  botToken: process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || state.config.botToken,
  chatId: process.env.TELEGRAM_CHAT_ID || state.config.chatId,
  spreadsheetId:
    process.env.GOOGLE_SHEET_ID ||
    state.config.spreadsheetId ||
    '1TECdVKOeytYv4a2zkXTOJ79nHP9umzc41gyO0KHMKSk',
  sheetGid: process.env.GOOGLE_SHEET_GID || state.config.sheetGid || '235680015',
  sheetRange: process.env.GOOGLE_SHEET_RANGE || state.config.sheetRange || 'A1:Z1000',
  sheetsSyncEnabled: true,
  timezone: process.env.TIMEZONE || state.config.timezone || 'Europe/Istanbul',
};

function saveState() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}

// Telegram API helper
async function callTelegramApi(token: string, method: string, payload: Record<string, unknown> = {}) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  return data;
}

function requireAdmin(req: any, res: any, next: any) {
  const expected = process.env.ADMIN_API_KEY?.trim();
  if (!expected) {
    return res.status(403).json({
      error: 'Yönetim API kapalı. Gerekirse Render üzerinde ADMIN_API_KEY tanımlayın.',
    });
  }

  const provided = String(req.header('x-admin-key') || req.query?.admin_key || '').trim();
  if (provided !== expected) {
    return res.status(401).json({ error: 'Yetkisiz erişim.' });
  }

  return next();
}

// Helper function to fetch Google Sheets data on the server
async function fetchServerSheetData(spreadsheetId: string, range: string, accessToken?: string, gid?: string): Promise<any[][]> {
  const cleanId = spreadsheetId.trim().match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || spreadsheetId.trim();
  const cleanRange = range ? range.trim() : 'A1:E50';

  if (accessToken && accessToken.trim()) {
    try {
      const encodedRange = encodeURIComponent(cleanRange);
      const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodedRange}`;
      const res = await fetch(sheetUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.values && json.values.length > 0) {
          return json.values;
        }
      }
    } catch (e) {
      console.warn('[Google Sheets API] Bearer token ile okunamadı, doğrudan link ile deneniyor:', e);
    }
  }

  // Fallback / Direct Link: CSV export via Google Docs URL with cache busting
  const timestamp = Date.now();
  let sheetName = '';
  if (cleanRange.includes('!')) {
    sheetName = cleanRange.split('!')[0].trim();
  }
  const csvUrl = sheetName
    ? `https://docs.google.com/spreadsheets/d/${cleanId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&tq=&_t=${timestamp}`
    : gid
      ? `https://docs.google.com/spreadsheets/d/${cleanId}/export?format=csv&gid=${encodeURIComponent(gid)}&_t=${timestamp}`
      : `https://docs.google.com/spreadsheets/d/${cleanId}/export?format=csv&id=${cleanId}&_t=${timestamp}`;

  const csvRes = await fetch(csvUrl, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
  if (!csvRes.ok) {
    throw new Error(`Google E-Tablo okunamadı (${csvRes.status}). Lütfen tablonun Paylaşım ayarlarından "Bağlantıya sahip olan herkes görüntüleyebilir" açık olduğundan emin olun.`);
  }

  const csvText = await csvRes.text();
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
          i++;
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
    if (row.length > 0) rows.push(row);
  }
  return rows;
}

// Function to sync items from Google Sheets
async function syncGoogleSheetsData(): Promise<boolean> {
  if (!state.config.sheetsSyncEnabled || !state.config.spreadsheetId) {
    return false;
  }

  try {
    const rows = await fetchServerSheetData(
      state.config.spreadsheetId,
      state.config.sheetRange || 'A1:Z1000',
      state.config.googleAccessToken,
      state.config.sheetGid
    );

    if (rows && rows.length > 0) {
      let startIndex = 0;
      let userCol = -1;
      let wagerCol = -1;
      let prizeCol = -1;

      for (let r = 0; r < Math.min(5, rows.length); r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;
        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] || '').toLowerCase().trim();
          if (val.includes('kullanıcı') || val.includes('user_name') || val.includes('username') || val.includes('user') || val.includes('oyuncu') || val === 'isim' || val === 'name') {
            userCol = c;
            startIndex = Math.max(startIndex, r + 1);
          } else if (val.includes('wager') || val.includes('çevrim') || val.includes('turnover') || val.includes('bet') || val.includes('tutar') || val.includes('amount')) {
            wagerCol = c;
            startIndex = Math.max(startIndex, r + 1);
          } else if (val.includes('ödül') || val.includes('prize') || val.includes('reward')) {
            prizeCol = c;
          }
        }
        if (userCol !== -1 && wagerCol !== -1) break;
      }

      if (userCol === -1 || wagerCol === -1) {
        const sampleRow = rows[startIndex] || rows[0];
        if (sampleRow) {
          for (let c = 0; c < sampleRow.length; c++) {
            const val = String(sampleRow[c] || '').trim();
            const lower = val.toLowerCase();
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

      if (userCol === -1) userCol = 0;
      if (wagerCol === -1) wagerCol = userCol === 0 ? 1 : 0;

      const isExcluded = (name: string) => {
        const lower = name.toLowerCase().trim();
        return (
          !lower ||
          lower === 'mayamax' ||
          lower === 'maya max' ||
          lower.startsWith('mayamax') ||
          lower === 'toplam' ||
          lower === 'total' ||
          lower === 'affiliate' ||
          lower === 'affiliate_name' ||
          lower === 'campaign' ||
          lower === 'campaign_code' ||
          lower === 'kampanya' ||
          lower === 'user' ||
          lower === 'user_name' ||
          lower === 'username' ||
          lower === 'kullanıcı' ||
          lower === 'kullanıcı adı'
        );
      };

      const parsedItems: LeaderboardItem[] = [];
      const DEFAULT_PRIZES = [800, 500, 400, 350, 300, 250, 200, 100, 75, 25];
      let rankCounter = 1;

      for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        let rawUsername = '';
        if (userCol !== -1 && row[userCol] !== undefined) {
          rawUsername = String(row[userCol]).trim();
        }

        if (isExcluded(rawUsername)) {
          for (let c = 0; c < row.length; c++) {
            const candidate = String(row[c] || '').trim();
            if (c !== wagerCol && !isExcluded(candidate) && !/^[\$€₺]?\s*[\d,]+(\.\d+)?\s*[\$€₺]?$/.test(candidate) && !/^\d+$/.test(candidate)) {
              rawUsername = candidate;
              break;
            }
          }
        }

        if (isExcluded(rawUsername)) continue;

        let rawWagerStr = '';
        if (wagerCol !== -1 && row[wagerCol] !== undefined) {
          rawWagerStr = String(row[wagerCol]);
        } else {
          for (let c = 0; c < row.length; c++) {
            const candidate = String(row[c] || '').trim();
            if (/^[\$€₺]?\s*[\d,]+(\.\d+)?\s*[\$€₺]?$/.test(candidate)) {
              rawWagerStr = candidate;
              break;
            }
          }
        }

        const rawWager = rawWagerStr.replace(/[^0-9.]/g, '');
        const wager = parseFloat(rawWager) || 0;

        let prize = 0;
        if (prizeCol !== -1 && row[prizeCol] !== undefined && String(row[prizeCol]).trim() !== '') {
          prize = parseFloat(String(row[prizeCol]).replace(/[^0-9.]/g, '')) || 0;
        } else {
          prize = 0;
        }

        parsedItems.push({
          id: Math.random().toString(36).substring(2, 9),
          rank: rankCounter,
          username: state.config.autoMask ? maskUsername(rawUsername) : rawUsername,
          wager,
          prize,
        });
        rankCounter++;
      }

      if (parsedItems.length > 0) {
        if (parsedItems.some((r) => r.wager > 0)) {
          parsedItems.sort((a, b) => b.wager - a.wager);
        }

        parsedItems.forEach((item, idx) => {
          item.rank = idx + 1;
          if (prizeCol === -1) {
            item.prize = DEFAULT_PRIZES[idx] ?? 0;
          }
        });

        state.items = parsedItems.slice(0, 10);
        saveState();
        console.log(`[Google Sheets Arka Plan Senkronizasyonu] ${state.items.length} kayıt otomatik güncellendi.`);
        return true;
      }
    }
  } catch (sheetErr) {
    console.error('[Google Sheets Senkronizasyon Hatası]:', sheetErr);
  }
  return false;
}

function isStakeCommand(text: string): boolean {
  const trimmed = text.trim();
  return /^!stake$/i.test(trimmed) || /^\/stake(?:@[A-Za-z0-9_]+)?$/i.test(trimmed);
}

async function sendStakeCommandResponse(chatId: string | number, replyToMessageId?: number) {
  const token = state.config.botToken;
  if (!token) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN eksik.' };
  }

  const synced = await syncGoogleSheetsData();
  if (!synced) {
    const errorText =
      '⚠️ Google Sheets verisi şu anda okunamadı. Tablo paylaşımını ve Sheet ayarlarını kontrol edin.';
    const telegramRes = await callTelegramApi(token, 'sendMessage', {
      chat_id: chatId,
      text: errorText,
      ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
    });
    return {
      success: Boolean(telegramRes.ok),
      error: telegramRes.ok ? 'Google Sheets sync failed' : telegramRes.description,
    };
  }

  const todayStr = getFormattedDateInTz(state.config.timezone);
  const messageContent = buildTelegramMessage(
    state.config,
    state.items.slice(0, 10),
    todayStr
  );

  const telegramRes = await callTelegramApi(token, 'sendMessage', {
    chat_id: chatId,
    text: messageContent,
    disable_web_page_preview: true,
    ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
  });

  return {
    success: Boolean(telegramRes.ok),
    error: telegramRes.ok ? undefined : telegramRes.description,
  };
}

async function configureTelegramWebhook() {
  const token = state.config.botToken;
  const publicUrl = (process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || '').replace(/\/$/, '');

  if (!token) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN tanımlı değil; webhook kurulmadı.');
    return;
  }

  if (!publicUrl) {
    console.warn('[Telegram] Public URL bulunamadı; webhook otomatik kurulamadı.');
    return;
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const payload: Record<string, unknown> = {
    url: `${publicUrl}/telegram/webhook`,
    allowed_updates: ['message'],
    drop_pending_updates: false,
  };

  if (secret) {
    payload.secret_token = secret;
  }

  const result = await callTelegramApi(token, 'setWebhook', payload);
  if (!result.ok) {
    console.error('[Telegram] Webhook kurulamadı:', result.description || result);
    return;
  }

  console.log(`[Telegram] Webhook aktif: ${publicUrl}/telegram/webhook`);
}

// Function to broadcast message
async function executeBroadcast(triggeredBy: 'scheduler' | 'manual'): Promise<{
  success: boolean;
  messageId?: number;
  error?: string;
  messageContent: string;
}> {
  // Always fetch fresh items from Google Sheets before broadcasting
  await syncGoogleSheetsData();

  const { botToken, chatId } = state.config;

  const todayStr = getFormattedDateInTz(state.config.timezone);
  const messageContent = buildTelegramMessage(state.config, state.items.slice(0, 10), todayStr);

  if (!botToken || !chatId) {
    const errorMsg = !botToken
      ? 'Bot Token girilmemiş. Lütfen Telegram Bot Ayarlarından token ekleyin.'
      : 'Hedef Chat / Kanal ID girilmemiş. Lütfen hedef kanal/grup ID ekleyin.';

    const logEntry: BroadcastLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      dateStr: todayStr,
      status: 'error',
      chatId: chatId || 'Tanımsız',
      messageContent,
      error: errorMsg,
      triggeredBy,
    };
    state.logs.unshift(logEntry);
    if (state.logs.length > 50) state.logs = state.logs.slice(0, 50);
    saveState();

    return { success: false, error: errorMsg, messageContent };
  }

  try {
    const telegramRes = await callTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text: messageContent,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    if (telegramRes.ok) {
      const messageId = telegramRes.result?.message_id;
      const logEntry: BroadcastLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        dateStr: todayStr,
        status: 'success',
        chatId,
        messageContent,
        messageId,
        triggeredBy,
      };
      state.logs.unshift(logEntry);
      if (state.logs.length > 50) state.logs = state.logs.slice(0, 50);
      state.lastRunDate = todayStr;
      saveState();

      return { success: true, messageId, messageContent };
    } else {
      const errorMsg = telegramRes.description || 'Telegram API bilinmeyen hata döndürdü';
      const logEntry: BroadcastLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        dateStr: todayStr,
        status: 'error',
        chatId,
        messageContent,
        error: errorMsg,
        triggeredBy,
      };
      state.logs.unshift(logEntry);
      if (state.logs.length > 50) state.logs = state.logs.slice(0, 50);
      saveState();

      return { success: false, error: errorMsg, messageContent };
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const logEntry: BroadcastLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      dateStr: todayStr,
      status: 'error',
      chatId,
      messageContent,
      error: errorMsg,
      triggeredBy,
    };
    state.logs.unshift(logEntry);
    if (state.logs.length > 50) state.logs = state.logs.slice(0, 50);
    saveState();

    return { success: false, error: errorMsg, messageContent };
  }
}

// Background Cron-style scheduler
// Checks every 15 seconds if current HH:mm matches scheduleTime
// And syncs Google Sheets data every 10 minutes continuously
function startScheduler() {
  console.log('Stake Telegram Bot Zamanlayıcı başlatıldı.');

  // Perform an immediate sync on server start if enabled
  if (state.config.sheetsSyncEnabled && state.config.spreadsheetId) {
    syncGoogleSheetsData().catch((err) =>
      console.error('[Başlangıç E-Tablo Senkronizasyon Hatası]:', err)
    );
  }

  // Periodic Google Sheets auto-sync every 10 minutes (600,000 ms)
  setInterval(async () => {
    if (state.config.sheetsSyncEnabled && state.config.spreadsheetId) {
      console.log('[Periyodik Kontrol] Google Sheets tablosundan güncel veriler çekiliyor...');
      await syncGoogleSheetsData();
    }
  }, 10 * 60 * 1000);

  setInterval(async () => {
    if (!state.config.enabled) return;

    try {
      const now = new Date();
      // Format current time in configured timezone as HH:mm
      const timeFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: state.config.timezone || 'Europe/Istanbul',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const currentHHmm = timeFormatter.format(now);
      const todayDateStr = getFormattedDateInTz(state.config.timezone, now);

      const targetHHmm = state.config.scheduleTime || '21:00';

      // Check if time matches and we haven't already sent today
      if (currentHHmm === targetHHmm && state.lastRunDate !== todayDateStr) {
        console.log(`[ZAMANLAYICI TETİKLENDİ] Saat: ${currentHHmm}, Tarih: ${todayDateStr}. Telegram gönderimi yapılıyor...`);
        await executeBroadcast('scheduler');
      }
    } catch (e) {
      console.error('Scheduler check error:', e);
    }
  }, 15000);
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  app.post('/telegram/webhook', async (req, res) => {
    try {
      const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
      const receivedSecret = req.header('x-telegram-bot-api-secret-token');

      if (expectedSecret && receivedSecret !== expectedSecret) {
        return res.status(403).json({ ok: false });
      }

      const update = req.body || {};
      const message = update.message || update.edited_message || update.channel_post;
      const text = String(message?.text || '');

      if (message?.chat?.id && isStakeCommand(text)) {
        const result = await sendStakeCommandResponse(message.chat.id, message.message_id);
        if (!result.success) {
          console.error('[Telegram] !stake yanıtı gönderilemedi:', result.error);
        }
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[Telegram Webhook Error]:', err);
      return res.status(200).json({ ok: true });
    }
  });

  app.get('/api/state', (req, res) => {
    const tz = state.config.timezone || 'Europe/Istanbul';
    const now = new Date();
    const timeFormatter = new Intl.DateTimeFormat('tr-TR', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const currentTimeStr = timeFormatter.format(now);
    const currentDateStr = getFormattedDateInTz(tz, now);

    const publicConfig = {
      ...state.config,
      botToken: state.config.botToken ? '***configured***' : '',
      googleAccessToken: state.config.googleAccessToken ? '***configured***' : '',
    };

    res.json({
      config: publicConfig,
      items: state.items,
      logs: state.logs,
      lastRunDate: state.lastRunDate,
      serverTime: {
        currentTimeStr,
        currentDateStr,
        timezone: tz,
      },
    });
  });

  app.post('/api/config', requireAdmin, (req, res) => {
    state.config = { ...state.config, ...req.body };
    saveState();
    res.json({ success: true, config: state.config });
  });

  app.post('/api/list', requireAdmin, (req, res) => {
    if (Array.isArray(req.body.items)) {
      state.items = req.body.items;
      saveState();
      res.json({ success: true, items: state.items });
    } else {
      res.status(400).json({ error: 'Geçersiz liste verisi' });
    }
  });

  app.post('/api/test-telegram', requireAdmin, async (req, res) => {
    const token = req.body.botToken || state.config.botToken;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Telegram Bot Token girilmedi.' });
    }

    try {
      const data = await callTelegramApi(token, 'getMe');
      if (data.ok) {
        return res.json({
          success: true,
          bot: data.result,
        });
      } else {
        return res.status(400).json({
          success: false,
          error: data.description || 'Bot token geçersiz veya Telegram API reddetti.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: `Bağlantı hatası: ${msg}` });
    }
  });

  app.post('/api/test-message', requireAdmin, async (req, res) => {
    const token = req.body.botToken || state.config.botToken;
    const chatId = req.body.chatId || state.config.chatId;

    if (!token || !chatId) {
      return res.status(400).json({
        success: false,
        error: !token ? 'Telegram Bot Token eksik.' : 'Hedef Chat / Grup / Kanal ID eksik.',
      });
    }

    try {
      const nowStr = new Date().toLocaleTimeString('tr-TR', { timeZone: state.config.timezone || 'Europe/Istanbul' });
      const testMsg = `🔔 <b>Test Bildirimi</b>\n\nStake Telegram Botu başarıyla bağlandı ve kanala mesaj gönderebiliyor!\n⏱ Sunucu Saati: <code>${nowStr}</code>\n✅ Durum: <b>Aktif & Hazır</b>`;
      
      const sendRes = await callTelegramApi(token, 'sendMessage', {
        chat_id: chatId,
        text: testMsg,
        parse_mode: 'HTML',
      });

      if (sendRes.ok) {
        return res.json({
          success: true,
          messageId: sendRes.result?.message_id,
          text: 'Test mesajı başarıyla Telegram kanalınıza/grubunuza iletildi!',
        });
      } else {
        return res.status(400).json({
          success: false,
          error: sendRes.description || 'Telegram API mesaj gönderimini reddetti.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: `Mesaj gönderilemedi: ${msg}` });
    }
  });

  app.post('/api/send-now', requireAdmin, async (req, res) => {
    const result = await executeBroadcast('manual');
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  });

  app.post('/api/clear-logs', requireAdmin, (req, res) => {
    state.logs = [];
    saveState();
    res.json({ success: true });
  });

  // Start background automation
  startScheduler();

  // Vite Integration
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Stake Telegram Bot sunucusu port ${PORT} üzerinde hazır!`);
    configureTelegramWebhook().catch((err) =>
      console.error('[Telegram] Webhook başlangıç hatası:', err)
    );
  });
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
});
