import React, { useState } from 'react';
import { Send, Copy, Check, MessageSquare, AlertCircle, Sparkles, Calendar } from 'lucide-react';
import { BotConfig, LeaderboardItem } from '../types.ts';
import { buildTelegramMessage, getFormattedDateInTz } from '../utils/formatters.ts';

interface TelegramPreviewProps {
  config: BotConfig;
  items: LeaderboardItem[];
  onSendNow: () => Promise<void>;
  isSending: boolean;
  lastSendResult: { success: boolean; message?: string } | null;
}

export const TelegramPreview: React.FC<TelegramPreviewProps> = ({
  config,
  items,
  onSendNow,
  isSending,
  lastSendResult,
}) => {
  const [copied, setCopied] = useState(false);
  const [previewDate, setPreviewDate] = useState<string>(getFormattedDateInTz(config.timezone));

  const messageText = buildTelegramMessage(config, items, previewDate);

  const handleCopy = () => {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSetToday = () => {
    setPreviewDate(getFormattedDateInTz(config.timezone));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Control Panel & Status */}
      <div className="lg:col-span-5 space-y-5">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Gönderim & Test Paneli</h3>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Bu ekran, botun Telegram kanalınıza veya grubunuza göndereceği mesajın birebir önizlemesidir.
          </p>

          {/* Target Channel Info */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 space-y-1 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span>Hedef Telegram Kanalı:</span>
              <span className="font-mono text-emerald-400 font-medium">
                {config.chatId ? config.chatId : '⚠️ Belirtilmemiş'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Otomasyon Zamanı:</span>
              <span className="font-mono text-slate-200">Her gün {config.scheduleTime}</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Karakter Sayısı:</span>
              <span className="font-mono text-slate-400">{messageText.length} karakter</span>
            </div>
          </div>

          {/* Date Override Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span>Önizleme Tarihi:</span>
              <button
                onClick={handleSetToday}
                className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
              >
                <Calendar className="w-3 h-3" />
                Bugünün Tarihini Al
              </button>
            </label>
            <input
              type="text"
              value={previewDate}
              onChange={(e) => setPreviewDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              placeholder="18.09.2026"
            />
            <span className="text-[11px] text-slate-500 block">
              Gerçek otomasyonda her gün saat 21:00&apos;da o günün tarihi otomatik atanır.
            </span>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col gap-2.5">
            <button
              onClick={onSendNow}
              disabled={isSending || !config.botToken || !config.chatId}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className={`w-4 h-4 ${isSending ? 'animate-pulse' : ''}`} />
              <span>{isSending ? 'Telegram\'a Gönderiliyor...' : 'Telegram\'a Şimdi Gönder'}</span>
            </button>

            <button
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Panoya Kopyalandı!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Mesajı Panoya Kopyala</span>
                </>
              )}
            </button>
          </div>

          {/* Status Alert if triggered */}
          {lastSendResult && (
            <div
              className={`p-3 rounded-lg border text-xs leading-relaxed ${
                lastSendResult.success
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : 'bg-red-950/60 border-red-800 text-red-300'
              }`}
            >
              <div className="flex items-start gap-2">
                {lastSendResult.success ? (
                  <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                )}
                <div>
                  <p className="font-semibold">
                    {lastSendResult.success ? 'Başarıyla Gönderildi!' : 'Gönderim Başarısız Oldu'}
                  </p>
                  <p className="mt-0.5 opacity-90">{lastSendResult.message}</p>
                </div>
              </div>
            </div>
          )}

          {!config.botToken && (
            <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <p className="font-semibold">Bot Token Eksik</p>
                <p className="mt-0.5 text-amber-400/80">
                  Telegram&apos;a mesaj gönderebilmek için &quot;Telegram Bot Ayarları&quot; sekmesinden bot tokenınızı ve hedef kanal ID&apos;nizi kaydetmeniz gereklidir.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Telegram UI Mockup */}
      <div className="lg:col-span-7">
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          {/* Telegram App Header Simulation */}
          <div className="bg-[#17212b] border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-700 flex items-center justify-center text-white font-bold text-xs">
                ST
              </div>
              <div>
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <span>{config.chatId || 'Stake VIP Çevrim Kanalı'}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                </div>
                <div className="text-[11px] text-slate-400">Telegram Kanalı · Bot</div>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Önizleme
            </div>
          </div>

          {/* Telegram Chat Wallpaper Area */}
          <div className="p-4 sm:p-6 bg-[#0e1621] min-h-[480px] flex flex-col justify-end">
            <div className="max-w-md ml-auto bg-[#182533] border border-slate-800/60 rounded-2xl rounded-tr-xs p-4 text-white shadow-lg space-y-2">
              {/* Message Content formatted cleanly */}
              <div className="text-xs leading-relaxed font-mono whitespace-pre-wrap selection:bg-emerald-500/30">
                {messageText}
              </div>

              {/* Telegram Message Footer (Time & Read receipt) */}
              <div className="flex items-center justify-end gap-1 pt-1 text-[10px] text-slate-400 font-sans">
                <span>{config.scheduleTime || '21:00'}</span>
                <span className="text-emerald-400">✓✓</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
