import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar.tsx';
import { LeaderboardEditor } from './components/LeaderboardEditor.tsx';
import { TelegramPreview } from './components/TelegramPreview.tsx';
import { AutomationSettings } from './components/AutomationSettings.tsx';
import { BotSettings } from './components/BotSettings.tsx';
import { GoogleSheetsSettings } from './components/GoogleSheetsSettings.tsx';
import { HistoryViewer } from './components/HistoryViewer.tsx';
import { StandaloneCode } from './components/StandaloneCode.tsx';
import { BotConfig, LeaderboardItem, BroadcastLog } from './types.ts';
import { DEFAULT_CONFIG, INITIAL_LEADERBOARD } from './utils/formatters.ts';
import { AlertCircle, CheckCircle, Info, Sparkles, Send } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('leaderboard');
  const [config, setConfig] = useState<BotConfig>(DEFAULT_CONFIG);
  const [items, setItems] = useState<LeaderboardItem[]>(INITIAL_LEADERBOARD);
  const [logs, setLogs] = useState<BroadcastLog[]>([]);
  const [lastRunDate, setLastRunDate] = useState<string | null>(null);
  const [serverTime, setServerTime] = useState<{
    currentTimeStr: string;
    currentDateStr: string;
    timezone: string;
  }>({
    currentTimeStr: '',
    currentDateStr: '',
    timezone: 'Europe/Istanbul',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [lastSendResult, setLastSendResult] = useState<{
    success: boolean;
    message?: string;
  } | null>(null);

  // Fetch state from server
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state', {
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.config) setConfig(data.config);
        if (data.items) setItems(data.items);
        if (data.logs) setLogs(data.logs);
        if (data.lastRunDate !== undefined) setLastRunDate(data.lastRunDate);
        if (data.serverTime) setServerTime(data.serverTime);
      }
    } catch {
      // Ignore transient connection interruptions during hot reloads / startup
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    // Poll every 5 seconds for live clock and background broadcast logs
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, [fetchState]);

  // Save Config
  const handleSaveConfig = async (updated: Partial<BotConfig>) => {
    const newConfig = { ...config, ...updated };
    setConfig(newConfig);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error('Sunucu yapılandırmayı kaydedemedi');
    } catch (err) {
      console.error('Save config error:', err);
      throw err;
    }
  };

  // Save Items
  const handleSaveItems = async (newItems: LeaderboardItem[]) => {
    setItems(newItems);
    try {
      const res = await fetch('/api/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: newItems }),
      });
      if (!res.ok) throw new Error('Sunucu listeyi kaydedemedi');
    } catch (err) {
      console.error('Save items error:', err);
      throw err;
    }
  };

  // Immediate send
  const handleSendNow = async () => {
    setIsSending(true);
    setLastSendResult(null);
    try {
      const res = await fetch('/api/send-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setLastSendResult({
          success: true,
          message: `Mesaj başarıyla iletildi! (Telegram Msg ID: ${data.messageId || 'OK'})`,
        });
      } else {
        setLastSendResult({
          success: false,
          message: data.error || 'Mesaj gönderilemedi. Token veya Chat ID kontrol edin.',
        });
      }
      await fetchState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastSendResult({
        success: false,
        message: `Sunucu hatası: ${msg}`,
      });
    } finally {
      setIsSending(false);
    }
  };

  // Test Telegram connection
  const handleTestConnection = async (token: string) => {
    const res = await fetch('/api/test-telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: token }),
    });
    return await res.json();
  };

  // Clear logs
  const handleClearLogs = async () => {
    try {
      await fetch('/api/clear-logs', { method: 'POST' });
      setLogs([]);
    } catch (err) {
      console.error('Clear logs error:', err);
    }
  };

  const botConfigured = Boolean(config.botToken && config.chatId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-white">
      {/* Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        config={config}
        serverTime={serverTime}
        onSendNow={handleSendNow}
        isSending={isSending}
        botConfigured={botConfigured}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Quick Context Banner */}
        <div className="border border-slate-800 bg-slate-900/60 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
            <div className="text-xs text-slate-300">
              <span className="font-semibold text-white">Stake Günlük Çevrim Otomasyonu:</span> Her gün saat{' '}
              <span className="font-mono text-emerald-400 font-semibold">{config.scheduleTime}</span>&apos;da güncel tarih ve liste Telegram kanalınıza otomatik aktarılır.
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="text-slate-400 flex items-center gap-1.5">
              <span>Hedef Kanal:</span>
              <span className="font-mono text-slate-200">
                {config.chatId ? config.chatId : 'Belirtilmedi'}
              </span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="text-slate-400 flex items-center gap-1.5">
              <span>Otomasyon:</span>
              <span className={config.enabled ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                {config.enabled ? 'Aktif' : 'Pasif'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Contents */}
        {activeTab === 'leaderboard' && (
          <LeaderboardEditor
            items={items}
            onSaveItems={handleSaveItems}
            autoMask={config.autoMask}
            onToggleAutoMask={(val) => handleSaveConfig({ autoMask: val })}
            onOpenGoogleSheetsTab={() => setActiveTab('google-sheets')}
            onSaveConfig={handleSaveConfig}
          />
        )}

        {activeTab === 'google-sheets' && (
          <GoogleSheetsSettings
            config={config}
            onSaveConfig={handleSaveConfig}
            onImportItems={handleSaveItems}
          />
        )}

        {activeTab === 'preview' && (
          <TelegramPreview
            config={config}
            items={items}
            onSendNow={handleSendNow}
            isSending={isSending}
            lastSendResult={lastSendResult}
          />
        )}

        {activeTab === 'automation' && (
          <AutomationSettings
            config={config}
            onSaveConfig={handleSaveConfig}
            serverTime={serverTime}
            lastRunDate={lastRunDate}
          />
        )}

        {activeTab === 'bot-settings' && (
          <BotSettings
            config={config}
            onSaveConfig={handleSaveConfig}
            onTestConnection={handleTestConnection}
          />
        )}

        {activeTab === 'history' && (
          <HistoryViewer logs={logs} onClearLogs={handleClearLogs} />
        )}

        {activeTab === 'standalone' && (
          <StandaloneCode config={config} items={items} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-600">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>Stake Çevrim & Telegram Bot Otomasyon Paneli</div>
          <div className="font-mono text-slate-500">
            {config.scheduleTime} Otomatik Yayın · Europe/Istanbul
          </div>
        </div>
      </footer>
    </div>
  );
}
