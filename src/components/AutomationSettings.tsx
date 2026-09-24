import React, { useState } from 'react';
import { Clock, Globe, Save, Check, ShieldAlert, Sparkles, BellRing } from 'lucide-react';
import { BotConfig } from '../types.ts';

interface AutomationSettingsProps {
  config: BotConfig;
  onSaveConfig: (updated: Partial<BotConfig>) => Promise<void>;
  serverTime: {
    currentTimeStr: string;
    currentDateStr: string;
    timezone: string;
  };
  lastRunDate: string | null;
}

export const AutomationSettings: React.FC<AutomationSettingsProps> = ({
  config,
  onSaveConfig,
  serverTime,
  lastRunDate,
}) => {
  const [scheduleTime, setScheduleTime] = useState(config.scheduleTime || '21:00');
  const [timezone, setTimezone] = useState(config.timezone || 'Europe/Istanbul');
  const [enabled, setEnabled] = useState(config.enabled);
  const [totalPrize, setTotalPrize] = useState(config.totalPrize || 3000);
  const [headerTemplate, setHeaderTemplate] = useState(
    config.headerTemplate || 'STAKE {TARIH} {ODUL}💵 ÖDÜLLÜ GÜNCEL ÇEVRİM LİSTESİ'
  );
  const [footerTemplate, setFooterTemplate] = useState(config.footerTemplate || '!stake');
  const [showPrizes, setShowPrizes] = useState(config.showPrizes !== undefined ? config.showPrizes : true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const timezones = [
    { value: 'Europe/Istanbul', label: 'Europe/Istanbul (Türkiye Saati - UTC+3)' },
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
    { value: 'Europe/Berlin', label: 'Europe/Berlin (Almanya - CET)' },
    { value: 'Europe/London', label: 'Europe/London (İngiltere - GMT/BST)' },
    { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
  ];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveConfig({
        scheduleTime,
        timezone,
        enabled,
        totalPrize: Number(totalPrize) || 3000,
        headerTemplate,
        footerTemplate,
        showPrizes,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Overview Status Card */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <h3 className="text-sm font-semibold text-white">
              Otomasyon Durumu: {enabled ? 'Aktif (Çalışıyor)' : 'Duraklatıldı'}
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Bot, her gün saat <span className="text-emerald-400 font-mono font-medium">{scheduleTime}</span> ({timezone}) olduğunda güncel listeyi Telegram kanalınıza iletir.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
            />
            <span className="text-slate-300 font-medium">Zamanlayıcıyı Etkinleştir</span>
          </label>
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-6">
        <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-white">Zamanlama & Şablon Ayarları</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Günlük gönderim saatini ve mesaj formatını özelleştirin.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Şu Anki Sunucu Saati: {serverTime.currentTimeStr || '--:--'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Schedule Time */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Günlük Gönderim Saati (HH:mm)</span>
            </label>
            <input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              required
            />
            <span className="text-[11px] text-slate-500 block">
              Varsayılan: 21:00 (Her akşam tam 21:00&apos;da tetiklenir)
            </span>
          </div>

          {/* Timezone */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span>Zaman Dilimi (Timezone)</span>
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              {timezones.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-500 block">
              Türkiye için Europe/Istanbul önerilir.
            </span>
          </div>

          {/* Total Prize Pool */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">
              Toplam Ödül Tutarı ($)
            </label>
            <input
              type="number"
              value={totalPrize}
              onChange={(e) => setTotalPrize(Number(e.target.value) || 0)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              placeholder="3000"
            />
            <span className="text-[11px] text-slate-500 block">
              Başlıktaki &#123;ODUL&#125; değişkeni yerine bu rakam yazılır.
            </span>
          </div>

          {/* Footer Text */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">
              Mesaj Sonu Komutu / Alt Bilgi
            </label>
            <input
              type="text"
              value={footerTemplate}
              onChange={(e) => setFooterTemplate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              placeholder="!stake"
            />
            <span className="text-[11px] text-slate-500 block">
              Mesajın en altına eklenecek komut (örn: !stake)
            </span>
          </div>
        </div>

        {/* Header Template */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
            <span>Başlık Şablonu:</span>
            <span className="text-[11px] text-slate-500">
              Kullanılabilir değişkenler: <code className="text-emerald-400">&#123;TARIH&#125;</code>, <code className="text-amber-400">&#123;ODUL&#125;</code>
            </span>
          </label>
          <input
            type="text"
            value={headerTemplate}
            onChange={(e) => setHeaderTemplate(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
            placeholder="STAKE {TARIH} {ODUL}💵 ÖDÜLLÜ GÜNCEL ÇEVRİM LİSTESİ"
          />
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 text-xs text-slate-400">
            <span className="text-slate-300 font-medium">Örnek Çıktı:</span>{' '}
            <span className="text-white font-mono">
              {headerTemplate
                .replace('{TARIH}', serverTime.currentDateStr || '18.09.2026')
                .replace('{ODUL}', String(totalPrize || 3000))}
            </span>
          </div>
        </div>

        {/* Prize display toggle */}
        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-white">Satırlarda Ödül Miktarını Göster</span>
            <p className="text-[11px] text-slate-400">
              Kapatırsanız her satırda sadece kullanıcı adı ve çevrim tutarı yazar (Örn: <code>1. De**8 $63,011.06</code>).
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showPrizes}
              onChange={(e) => setShowPrizes(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end pt-4 border-t border-slate-800">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {saveSuccess ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span>Ayarlar Kaydedildi!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Info Card */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400 space-y-1.5">
        <div className="flex items-center gap-1.5 text-slate-200 font-medium">
          <BellRing className="w-4 h-4 text-emerald-400" />
          <span>Otomasyon Çalışma Prensibi</span>
        </div>
        <p>
          Sunucu arka planda her 15 saniyede bir saati kontrol eder. Saat <span className="font-mono text-emerald-400">{scheduleTime}</span> olduğunda, sistem en son kaydedilen güncel listeyi alır, günün tarihini başlığa işler ve Telegram kanalınıza tek bir düzenli mesaj olarak postalar.
        </p>
        {lastRunDate && (
          <p className="text-slate-500 pt-1">
            Son başarılı otomatik gönderim tarihi: <span className="font-mono text-slate-400">{lastRunDate}</span>
          </p>
        )}
      </div>
    </div>
  );
};
