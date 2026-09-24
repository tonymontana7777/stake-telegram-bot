import React, { useState } from 'react';
import { Terminal, Copy, Check, Server, Download, ShieldCheck } from 'lucide-react';
import { BotConfig, LeaderboardItem } from '../types.ts';

interface StandaloneCodeProps {
  config: BotConfig;
  items: LeaderboardItem[];
}

export const StandaloneCode: React.FC<StandaloneCodeProps> = ({ config, items }) => {
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedPm2, setCopiedPm2] = useState(false);

  const cleanItemsJson = JSON.stringify(
    items.map((it) => ({
      rank: it.rank,
      username: it.username,
      wager: it.wager,
      prize: it.prize,
    })),
    null,
    2
  );

  const standaloneScript = `/**
 * STAKE GÜNCEL ÇEVRİM TELEGRAM BOTU (STANDALONE NODE.JS)
 * Her gün saat ${config.scheduleTime || '21:00'}'da güncel listeyi okur ve Telegram kanalına gönderir.
 * 
 * Kurulum:
 * 1. node -v (Node.js 18+ gereklidir)
 * 2. npm init -y
 * 3. npm install node-cron
 * 4. node stake_bot.js
 */

const cron = require('node-cron');
const fs = require('fs');

// AYARLAR
const BOT_TOKEN = process.env.BOT_TOKEN || '${config.botToken || 'BURAYA_BOT_TOKEN_YAZIN'}';
const CHAT_ID = process.env.CHAT_ID || '${config.chatId || '@BURAYA_KANAL_ADI_YAZIN'}';
const TIMEZONE = '${config.timezone || 'Europe/Istanbul'}';
const SCHEDULE_TIME = '${config.scheduleTime || '21:00'}'; // Her gün 21:00
const TOTAL_PRIZE = ${config.totalPrize || 3000};
const FOOTER_TEXT = '${config.footerTemplate || '!stake'}';

// GÜNCEL ÇEVRİM LİSTESİ (İsterseniz bu dosyadan okuyabilir: list.json)
let leaderboard = ${cleanItemsJson};

// Para birimi formatlayıcı ($63,011.06)
function formatCurrency(amount) {
  return '$' + Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Ödül formatlayıcı (-$800)
function formatPrize(prize) {
  return '-$' + Number(prize).toLocaleString('en-US');
}

// İsim maskeleyici (Deniz8 -> De**8)
function maskUsername(name) {
  if (!name) return '***';
  if (name.includes('*')) return name;
  if (name.length <= 2) return name[0] + '*';
  if (name.length === 3) return name[0] + '*' + name[2];
  if (name.length === 4) return name.slice(0, 2) + '*' + name.slice(3);
  return name.slice(0, 2) + '**' + name.slice(-1);
}

// Günün tarihini DD.MM.YYYY formatında alma
function getTodayDateStr() {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return formatter.format(new Date()).replace(/\\//g, '.');
}

// Telegram mesajını oluşturma
function buildMessage() {
  const todayStr = getTodayDateStr();
  const lines = [];

  // Başlık: STAKE 18.09.2026 3000💵 ÖDÜLLÜ GÜNCEL ÇEVRİM LİSTESİ
  lines.push(\`STAKE \${todayStr} \${TOTAL_PRIZE}💵 ÖDÜLLÜ GÜNCEL ÇEVRİM LİSTESİ\`);
  lines.push('');

  // Sıralı liste
  leaderboard.sort((a, b) => a.rank - b.rank).forEach((item) => {
    const maskedName = maskUsername(item.username);
    const wagerStr = formatCurrency(item.wager);
    const prizeStr = formatPrize(item.prize);

    lines.push(\`\${item.rank}. \${maskedName} \${wagerStr} \${prizeStr}\`);
    lines.push(''); // Satırlar arası boşluk
  });

  if (FOOTER_TEXT) {
    lines.push(FOOTER_TEXT);
  }

  return lines.join('\\n');
}

// Telegram'a mesaj gönderme fonksiyonu
async function sendToTelegram() {
  const text = buildMessage();
  console.log(\`[\${new Date().toISOString()}] Telegram mesajı gönderiliyor...\`);

  try {
    const response = await fetch(\`https://api.telegram.org/bot\${BOT_TOKEN}/sendMessage\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
        disable_web_page_preview: true,
      }),
    });

    const result = await response.json();
    if (result.ok) {
      console.log('✅ Mesaj Telegram\\'a başarıyla gönderildi! Message ID:', result.result.message_id);
    } else {
      console.error('❌ Telegram Hatası:', result.description);
    }
  } catch (err) {
    console.error('❌ Bağlantı hatası:', err.message);
  }
}

// Cron Saat Parsingle (21:00 -> "0 21 * * *")
const [hour, minute] = SCHEDULE_TIME.split(':');
const cronPattern = \`\${parseInt(minute, 10)} \${parseInt(hour, 10)} * * *\`;

console.log(\`🤖 Stake Çevrim Botu başlatıldı!\`);
console.log(\`⏰ Zamanlayıcı: Her gün saat \${SCHEDULE_TIME} (\${TIMEZONE}) planlandı. [Cron: \${cronPattern}]\`);

cron.schedule(cronPattern, () => {
  console.log('⏰ Saat 21:00 oldu! Otomasyon çalışıyor...');
  sendToTelegram();
}, {
  timezone: TIMEZONE,
});

// İlk çalıştırmada test göndermek isterseniz alttaki satırın yorumunu kaldırabilirsiniz:
// sendToTelegram();
`;

  const pm2Command = `# 1. Proje klasörü oluşturup içine girin
mkdir stake-telegram-bot && cd stake-telegram-bot

# 2. Paketleri kurun
npm init -y
npm install node-cron

# 3. stake_bot.js dosyasını oluşturun ve kodu içine yapıştırın
nano stake_bot.js

# 4. Botu arka planda 7/24 çalışacak şekilde PM2 ile başlatın
npm install -g pm2
pm2 start stake_bot.js --name "stake-bot"
pm2 save
pm2 startup`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(standaloneScript);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleCopyPm2 = () => {
    navigator.clipboard.writeText(pm2Command);
    setCopiedPm2(true);
    setTimeout(() => setCopiedPm2(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-3">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">Bağımsız Node.js Bot Kodu (VPS / Sunucu)</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Bu web uygulaması zaten kendi içinde her gün saat <span className="text-emerald-400 font-mono">21:00</span>&apos;da listeyi otomatik göndermektedir. Ancak isterseniz bu botu tamamen kendi Linux sanal sunucunuzda (VPS), Raspberry Pi&apos;nizde veya bulutta 7/24 bağımsız çalıştırmak için aşağıdaki hazır kodu kullanabilirsiniz.
        </p>
      </div>

      {/* Code Snippet Box */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-mono text-slate-300 font-semibold">stake_bot.js</span>
            <span className="text-[11px] text-slate-500 font-mono">· Node.js</span>
          </div>

          <button
            onClick={handleCopyScript}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 transition-colors"
          >
            {copiedScript ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Kopyalandı!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Kodu Kopyala</span>
              </>
            )}
          </button>
        </div>

        <div className="p-4 bg-[#0a0f1d] max-h-[420px] overflow-y-auto">
          <pre className="text-xs text-slate-300 font-mono leading-relaxed whitespace-pre selection:bg-emerald-500/30">
            {standaloneScript}
          </pre>
        </div>
      </div>

      {/* Linux / PM2 Commands */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg space-y-3 p-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <h4 className="text-xs font-semibold text-white">Ubuntu / Debian VPS 7/24 Arka Plan Kurulum Komutları</h4>
          </div>

          <button
            onClick={handleCopyPm2}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-800 rounded border border-slate-700"
          >
            {copiedPm2 ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>Komutları Kopyala</span>
          </button>
        </div>

        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs text-emerald-400">
          <pre className="whitespace-pre-wrap">{pm2Command}</pre>
        </div>
      </div>
    </div>
  );
};
