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

// Helper function to fetch Google Sheets data on the server
async function fetchServerSheetData(spreadsheetId: string, range: string, accessToken?: string): Promise<any[][]> {
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

  // Fallback / Direct Link: CSV export via Google Docs URL
  let sheetName = '';
  if (cleanRange.includes('!')) {
    sheetName = cleanRange.split('!')[0].trim();
  }
  const csvUrl = sheetName
    ? `https://docs.google.com/spreadsheets/d/${cleanId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`
    : `https://docs.google.com/spreadsheets/d/${cleanId}/export?format=csv`;

  const csvRes = await fetch(csvUrl);
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

// Function to broadcast message
async function executeBroadcast(triggeredBy: 'scheduler' | 'manual'): Promise<{
  success: boolean;
  messageId?: number;
  error?: string;
  messageContent: string;
}> {
  // If Google Sheets sync is enabled and spreadsheetId is present, fetch fresh items before broadcasting
  if (state.config.sheetsSyncEnabled && state.config.spreadsheetId) {
    try {
      console.log(`[Google Sheets] Yayın öncesi güncel liste çekiliyor: ${state.config.spreadsheetId}`);
      const rows = await fetchServerSheetData(
        state.config.spreadsheetId,
        state.config.sheetRange || 'A1:E50',
        state.config.googleAccessToken
      );

      if (rows && rows.length > 0) {
        let startIndex = 0;
        const firstRowStr = rows[0].map((c: any) => String(c).toLowerCase()).join(' ');
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

        const parsedItems: LeaderboardItem[] = [];
        const DEFAULT_PRIZES = [800, 500, 400, 350, 300, 250, 200, 100, 75, 25];
        let rankCounter = 1;

        for (let i = startIndex; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;
          let rank = rankCounter;
          let nameIdx = 0;
          let wagerIdx = 1;
          let prizeIdx = 2;

          if (/^\d+$/.test(String(row[0]).trim())) {
            rank = parseInt(String(row[0]).trim(), 10);
            nameIdx = 1;
            wagerIdx = 2;
            prizeIdx = 3;
          }

          const rawName = String(row[nameIdx] || `Oyuncu${rankCounter}`).trim();
          if (!rawName) continue;

          const rawWager = String(row[wagerIdx] || '0').replace(/[^0-9.]/g, '');
          const wager = parseFloat(rawWager) || 0;

          let prize = 0;
          if (row[prizeIdx] !== undefined && row[prizeIdx] !== null && String(row[prizeIdx]).trim() !== '') {
            prize = parseFloat(String(row[prizeIdx]).replace(/[^0-9.]/g, '')) || 0;
          } else {
            prize = DEFAULT_PRIZES[rank - 1] ?? 0;
          }

          parsedItems.push({
            id: Math.random().toString(36).substring(2, 9),
            rank,
            username: rawName,
            wager,
            prize,
          });
          rankCounter = rank + 1;
        }

        if (parsedItems.length > 0) {
          state.items = parsedItems.sort((a, b) => a.rank - b.rank);
          saveState();
          console.log(`[Google Sheets] ${state.items.length} kayıt başarıyla güncellendi.`);
        }
      }
    } catch (sheetErr) {
      console.error('[Google Sheets] Senkronizasyon hatası:', sheetErr);
    }
  }

  const { botToken, chatId } = state.config;

  const todayStr = getFormattedDateInTz(state.config.timezone);
  const messageContent = buildTelegramMessage(state.config, state.items, todayStr);

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
function startScheduler() {
  console.log('Stake Telegram Bot Zamanlayıcı başlatıldı.');

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

    res.json({
      config: state.config,
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

  app.post('/api/config', (req, res) => {
    state.config = { ...state.config, ...req.body };
    saveState();
    res.json({ success: true, config: state.config });
  });

  app.post('/api/list', (req, res) => {
    if (Array.isArray(req.body.items)) {
      state.items = req.body.items;
      saveState();
      res.json({ success: true, items: state.items });
    } else {
      res.status(400).json({ error: 'Geçersiz liste verisi' });
    }
  });

  app.post('/api/test-telegram', async (req, res) => {
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

  app.post('/api/test-message', async (req, res) => {
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

  app.post('/api/send-now', async (req, res) => {
    const result = await executeBroadcast('manual');
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  });

  app.post('/api/clear-logs', (req, res) => {
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
  });
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
});
