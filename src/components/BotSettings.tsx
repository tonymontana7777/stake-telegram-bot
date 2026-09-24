import React, { useState } from 'react';
import { KeyRound, Hash, Check, Save, Eye, EyeOff, Bot, HelpCircle, CheckCircle2, AlertCircle, RefreshCw, Send } from 'lucide-react';
import { BotConfig } from '../types.ts';

interface BotSettingsProps {
  config: BotConfig;
  onSaveConfig: (updated: Partial<BotConfig>) => Promise<void>;
  onTestConnection: (token: string) => Promise<{ success: boolean; bot?: Record<string, unknown>; error?: string }>;
}

export const BotSettings: React.FC<BotSettingsProps> = ({
  config,
  onSaveConfig,
  onTestConnection,
}) => {
  const [botToken, setBotToken] = useState(config.botToken || '');
  const [chatId, setChatId] = useState(config.chatId || '');
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    bot?: Record<string, unknown>;
    error?: string;
  } | null>(null);

  const [isSendingTestMessage, setIsSendingTestMessage] = useState(false);
  const [testMessageFeedback, setTestMessageFeedback] = useState<{
    success: boolean;
    text: string;
  } | null>(null);

  const handleTest = async () => {
    if (!botToken.trim()) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await onTestConnection(botToken.trim());
      setTestResult(res);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Bağlantı hatası oluştu';
      setTestResult({ success: false, error: msg });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSendTestMessage = async () => {
    if (!botToken.trim() || !chatId.trim()) {
      setTestMessageFeedback({
        success: false,
        text: 'Lütfen önce Bot Token ve Hedef Chat/Kanal ID bilgilerini doldurun.',
      });
      return;
    }

    setIsSendingTestMessage(true);
    setTestMessageFeedback(null);

    try {
      // First save if needed
      await onSaveConfig({
        botToken: botToken.trim(),
        chatId: chatId.trim(),
      });

      const res = await fetch('/api/test-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: botToken.trim(),
          chatId: chatId.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestMessageFeedback({
          success: true,
          text: `✅ ${data.text || 'Test mesajı başarıyla Telegram grubunuza/kanalınıza ulaştı!'}`,
        });
      } else {
        setTestMessageFeedback({
          success: false,
          text: `❌ Mesaj gönderilemedi: ${data.error || 'Bilinmeyen hata'}`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Mesaj gönderilemedi.';
      setTestMessageFeedback({
        success: false,
        text: `❌ Sunucu hatası: ${msg}`,
      });
    } finally {
      setIsSendingTestMessage(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveConfig({
        botToken: botToken.trim(),
        chatId: chatId.trim(),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Configuration Form */}
      <form onSubmit={handleSave} className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-6">
        <div className="border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Telegram Bot API Kimlik Bilgileri</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Botunuzun Telegram kanalı veya grubuna mesaj iletebilmesi için @BotFather üzerinden alınan API Token ve hedef Chat ID gereklidir.
          </p>
        </div>

        <div className="space-y-4">
          {/* Bot Token */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                Telegram Bot Token
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                Örn: 7123456789:AAFs-x...
              </span>
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 pr-20 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                required
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="p-1 text-slate-400 hover:text-slate-200 text-xs"
                  title={showToken ? 'Gizle' : 'Göster'}
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Target Chat ID */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-blue-400" />
                Hedef Telegram Kanalı veya Grup ID
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                @KanalAdi veya -100123456789
              </span>
            </label>
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="@StakeVIPKanal veya -1001987654321"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              required
            />
            <span className="text-[11px] text-slate-500 block">
              Eğer herkese açık kanalsa kullanıcı adını (<code className="text-slate-400 font-mono">@Kanalim</code>) yazabilirsiniz. Özel kanal/grup ise -100 ile başlayan ID numarasını girin.
            </span>
          </div>
        </div>

        {/* Test Result Feedback */}
        {testResult && (
          <div
            className={`p-4 rounded-lg border text-xs leading-relaxed ${
              testResult.success
                ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                : 'bg-red-950/50 border-red-800 text-red-300'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <p className="font-semibold">
                  {testResult.success ? 'Bot Bağlantısı Başarılı!' : 'Bağlantı Hatası'}
                </p>
                {testResult.success && testResult.bot && (
                  <div className="font-mono text-[11px] text-emerald-400 space-y-0.5 pt-1">
                    <p>Bot Adı: {String(testResult.bot.first_name || 'Bilinmiyor')}</p>
                    <p>Kullanıcı Adı: @{String(testResult.bot.username || '')}</p>
                    <p>Bot ID: {String(testResult.bot.id || '')}</p>
                  </div>
                )}
                {!testResult.success && (
                  <p className="text-red-400 text-xs">{testResult.error}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Test Message to Group Feedback */}
        {testMessageFeedback && (
          <div
            className={`p-4 rounded-lg border text-xs leading-relaxed flex items-start gap-2.5 ${
              testMessageFeedback.success
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                : 'bg-red-950/60 border-red-800 text-red-300'
            }`}
          >
            {testMessageFeedback.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">{testMessageFeedback.success ? 'Gruba Mesaj İletildi!' : 'Mesaj İletilemedi'}</p>
              <p className="mt-0.5">{testMessageFeedback.text}</p>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting || !botToken.trim()}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors disabled:opacity-50"
              title="BotFather tokenının geçerli olup olmadığını sorgular"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? 'Sorgulanıyor...' : 'Tokenı Doğrula'}</span>
            </button>

            <button
              type="button"
              onClick={handleSendTestMessage}
              disabled={isSendingTestMessage || !botToken.trim() || !chatId.trim()}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Hedef Telegram kanalına veya grubuna anlık test mesajı atar"
            >
              <Send className={`w-3.5 h-3.5 ${isSendingTestMessage ? 'animate-pulse' : ''}`} />
              <span>{isSendingTestMessage ? 'Gruba Gönderiliyor...' : 'Gruba Test Mesajı At'}</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {saveSuccess ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span>Kaydedildi!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Kaydediliyor...' : 'Bilgileri Kaydet'}</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Step by Step Setup Guide */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-blue-400" />
          <h4 className="text-sm font-semibold text-white">Adım Adım Telegram Botu Kurulum Rehberi</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-400 leading-relaxed">
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1">
            <span className="font-semibold text-emerald-400">1. Bot Oluşturma</span>
            <p>
              Telegram&apos;da arama yerine <code className="text-white bg-slate-800 px-1 py-0.5 rounded">@BotFather</code> yazın ve başlatın. <code className="text-white bg-slate-800 px-1 py-0.5 rounded">/newbot</code> komutunu gönderin. Botunuz için bir isim ve ardından <code className="text-white bg-slate-800 px-1 py-0.5 rounded">bot</code> ile biten bir kullanıcı adı seçin (örn: <code className="text-slate-300">StakeCevrimBot</code>).
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1">
            <span className="font-semibold text-emerald-400">2. Token&apos;ı Alma</span>
            <p>
              BotFather size <code className="text-amber-400 font-mono">Use this token to access the HTTP API: ...</code> şeklinde bir şifre verecektir. Bu token&apos;ı kopyalayıp yukarıdaki &quot;Telegram Bot Token&quot; alanına yapıştırın.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1">
            <span className="font-semibold text-emerald-400">3. Botu Kanala/Gruba Ekleme</span>
            <p>
              Listenin gönderilmesini istediğiniz Telegram kanalınıza veya grubunuza gidin. Kanal Ayarları &gt; Yöneticiler (Admins) bölümünden botunuzu yönetici olarak ekleyin ve <strong>Mesaj Gönderme (Post Messages)</strong> izninin açık olduğundan emin olun.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1">
            <span className="font-semibold text-emerald-400">4. Chat / Kanal ID Belirleme</span>
            <p>
              Kanalınız genel ise bağlantı adını (örn: <code className="text-white bg-slate-800 px-1 py-0.5 rounded">@BenimKanalim</code>) yazın. Özel kanallarda ID öğrenmek için kanaldan bir mesajı <code className="text-white bg-slate-800 px-1 py-0.5 rounded">@userinfobot</code> botuna ileterek <code className="text-slate-300">-100...</code> ile başlayan ID&apos;yi alabilirsiniz.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
