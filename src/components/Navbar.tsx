import React from 'react';
import { Send, Clock, ShieldCheck, AlertCircle, Bot } from 'lucide-react';
import { BotConfig } from '../types.ts';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  config: BotConfig;
  serverTime: {
    currentTimeStr: string;
    currentDateStr: string;
    timezone: string;
  };
  onSendNow: () => void;
  isSending: boolean;
  botConfigured: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  config,
  serverTime,
  onSendNow,
  isSending,
  botConfigured,
}) => {
  const tabs = [
    { id: 'leaderboard', label: 'Çevrim Listesi' },
    { id: 'google-sheets', label: 'Google Sheets' },
    { id: 'preview', label: 'Canlı Önizleme & Gönder' },
    { id: 'automation', label: 'Zamanlayıcı (21:00)' },
    { id: 'bot-settings', label: 'Telegram Bot Ayarları' },
    { id: 'history', label: 'Gönderim Günlüğü' },
    { id: 'standalone', label: 'VPS / Bağımsız Kod' },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Zone */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                Stake Çevrim Botu
                <span className="text-xs font-normal text-emerald-400 font-mono bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                  21:00 Auto
                </span>
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-800 text-white shadow-xs border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Action Zone: Clock & Send Now Button */}
          <div className="flex items-center gap-3">
            {/* Live Clock */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 border border-slate-800 bg-slate-950/60 px-3 py-1.5 rounded-md font-mono tabular-nums">
              <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{serverTime.currentTimeStr || '--:--:--'}</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-500">{config.scheduleTime} Otomasyon</span>
            </div>

            {/* Quick Send Button */}
            <button
              onClick={onSendNow}
              disabled={isSending}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shadow-sm ${
                botConfigured
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              } disabled:opacity-50`}
              title={botConfigured ? "Listeyi anında Telegram'a gönder" : 'Telegram token ve Chat ID girilmelidir'}
            >
              <Send className={`w-3.5 h-3.5 ${isSending ? 'animate-pulse' : ''}`} />
              <span>{isSending ? 'Gönderiliyor...' : 'Şimdi Gönder'}</span>
            </button>
          </div>
        </div>

        {/* Mobile Sub-Navigation */}
        <div className="lg:hidden flex items-center gap-1 py-2 overflow-x-auto border-t border-slate-800/80 no-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
