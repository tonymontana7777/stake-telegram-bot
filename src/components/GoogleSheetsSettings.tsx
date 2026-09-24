import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  LogIn,
  LogOut,
  Save,
  HelpCircle,
  Clock,
} from 'lucide-react';
import { BotConfig, LeaderboardItem } from '../types.ts';
import {
  initAuth,
  googleSignIn,
  logoutGoogle,
  getAccessToken,
} from '../services/firebaseAuth.ts';
import {
  extractSpreadsheetId,
  fetchGoogleSheetData,
  parseSheetRowsToLeaderboard,
} from '../services/googleSheets.ts';
import { User } from 'firebase/auth';

interface GoogleSheetsSettingsProps {
  config: BotConfig;
  onSaveConfig: (updated: Partial<BotConfig>) => Promise<void>;
  onImportItems: (items: LeaderboardItem[]) => Promise<void>;
}

export const GoogleSheetsSettings: React.FC<GoogleSheetsSettingsProps> = ({
  config,
  onSaveConfig,
  onImportItems,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [spreadsheetInput, setSpreadsheetInput] = useState(config.spreadsheetId || '');
  const [rangeInput, setRangeInput] = useState(config.sheetRange || 'Sayfa1!A1:D20');
  const [syncEnabled, setSyncEnabled] = useState(config.sheetsSyncEnabled ?? false);

  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    success: boolean;
    text: string;
  } | null>(null);
  const [previewRows, setPreviewRows] = useState<any[][] | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        setAccessToken(token);
        // Also update backend config with token for background scheduled cron
        onSaveConfig({ googleAccessToken: token });
      },
      () => {
        setCurrentUser(null);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setStatusMessage(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setCurrentUser(result.user);
        setAccessToken(result.accessToken);
        await onSaveConfig({
          googleAccessToken: result.accessToken,
          sheetsSyncEnabled: true,
        });
        setSyncEnabled(true);
        setStatusMessage({
          success: true,
          text: `Google Hesabı bağlandı: ${result.user.email}`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Giriş yapılamadı.';
      setStatusMessage({
        success: false,
        text: `Google ile giriş başarısız: ${msg}`,
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await logoutGoogle();
    setCurrentUser(null);
    setAccessToken(null);
    await onSaveConfig({ googleAccessToken: '' });
    setStatusMessage({
      success: true,
      text: 'Google oturumu kapatıldı.',
    });
  };

  const handleFetchAndPreview = async () => {
    if (!spreadsheetInput.trim()) {
      setStatusMessage({
        success: false,
        text: 'Lütfen Google E-Tablo URL adresini veya ID bilgisini girin.',
      });
      return;
    }

    const token = accessToken || (await getAccessToken()) || config.googleAccessToken || null;

    setIsLoadingSheet(true);
    setStatusMessage(null);

    try {
      const rows = await fetchGoogleSheetData(spreadsheetInput, rangeInput, token);
      if (rows.length === 0) {
        setStatusMessage({
          success: false,
          text: 'E-Tablo okundu fakat belirtilen aralıkta veri bulunamadı.',
        });
        setPreviewRows(null);
        return;
      }

      setPreviewRows(rows.slice(0, 15));
      const parsedItems = parseSheetRowsToLeaderboard(rows, config.autoMask);

      setStatusMessage({
        success: true,
        text: `E-Tablo başarıyla okundu! Toplam ${rows.length} satır bulundu, ${parsedItems.length} oyuncu tespit edildi.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'E-Tablo okunamadı.';
      setStatusMessage({
        success: false,
        text: msg,
      });
    } finally {
      setIsLoadingSheet(false);
    }
  };

  const handleApplyToLeaderboard = async () => {
    if (!spreadsheetInput.trim()) {
      setStatusMessage({
        success: false,
        text: 'Lütfen Google E-Tablo linki veya ID girin.',
      });
      return;
    }

    const token = accessToken || (await getAccessToken()) || config.googleAccessToken || null;

    setIsLoadingSheet(true);
    try {
      const rows = await fetchGoogleSheetData(spreadsheetInput, rangeInput, token);
      const parsedItems = parseSheetRowsToLeaderboard(rows, config.autoMask);

      if (parsedItems.length === 0) {
        throw new Error('E-Tablodan geçerli oyuncu listesi çıkarılamadı.');
      }

      // Save to main items
      await onImportItems(parsedItems);

      // Save settings
      await onSaveConfig({
        spreadsheetId: extractSpreadsheetId(spreadsheetInput),
        sheetRange: rangeInput,
        sheetsSyncEnabled: syncEnabled,
        ...(token ? { googleAccessToken: token } : {}),
      });

      setStatusMessage({
        success: true,
        text: `✅ ${parsedItems.length} oyuncu başarıyla güncel çevrim tablosuna aktarıldı ve kaydedildi!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Aktarım yapılamadı.';
      setStatusMessage({
        success: false,
        text: msg,
      });
    } finally {
      setIsLoadingSheet(false);
    }
  };

  const handleSaveSettingsOnly = async () => {
    try {
      await onSaveConfig({
        spreadsheetId: extractSpreadsheetId(spreadsheetInput),
        sheetRange: rangeInput,
        sheetsSyncEnabled: syncEnabled,
      });
      setStatusMessage({
        success: true,
        text: 'Google E-Tablo ayarları kaydedildi.',
      });
    } catch (err: unknown) {
      setStatusMessage({
        success: false,
        text: 'Ayarlar kaydedilemedi.',
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header card */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Google E-Tablolar (Sheets) Entegrasyonu</h2>
              <p className="text-xs text-slate-400">
                Her gün güncellenen Google E-Tablonuzu bağlayın; saat 21:00&apos;da güncel liste okunup otomatik Telegram&apos;a gönderilsin.
              </p>
            </div>
          </div>

          {/* Google Auth Status / Button */}
          <div>
            {currentUser ? (
              <div className="flex items-center gap-3 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2">
                  {currentUser.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt="Google avatar"
                      className="w-6 h-6 rounded-full border border-slate-700"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white">
                      G
                    </div>
                  )}
                  <span className="text-xs text-slate-200 font-medium">
                    {currentUser.displayName || currentUser.email}
                  </span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 pl-2 border-l border-slate-800"
                  title="Oturumu Kapat"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-900 rounded-lg shadow-sm transition-all"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{isSigningIn ? 'Giriş Yapılıyor...' : 'Google ile Giriş Yap'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Settings Form */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-5">
        <h3 className="text-sm font-semibold text-white border-b border-slate-800 pb-3 flex items-center justify-between">
          <span>E-Tablo Bağlantı Ayarları</span>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-normal">
            <input
              type="checkbox"
              checked={syncEnabled}
              onChange={(e) => setSyncEnabled(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <span className={syncEnabled ? 'text-emerald-400 font-medium' : 'text-slate-400'}>
              {syncEnabled ? 'Otomatik Sheets Senkronizasyonu Aktif' : 'Senkronizasyon Pasif'}
            </span>
          </label>
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Google E-Tablo Linki veya Spreadsheet ID:
            </label>
            <input
              type="text"
              value={spreadsheetInput}
              onChange={(e) => setSpreadsheetInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-emerald-500 font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Google E-Tablonuzun tarayıcıdaki linkini yapıştırabilirsiniz, ID otomatik ayıklanır.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Okunacak Sayfa ve Hücre Aralığı:
              </label>
              <input
                type="text"
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                placeholder="Sayfa1!A1:D20 veya A1:D20"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-emerald-500 font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Örnek: <code className="text-emerald-400">Sayfa1!A1:D20</code> veya <code className="text-emerald-400">A1:E50</code>
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Kolon Eşleme Formatı:
              </label>
              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <p>Kolon 1: <span className="text-slate-200">Sıra No</span> (veya doğrudan isim)</p>
                <p>Kolon 2: <span className="text-slate-200">Kullanıcı Adı</span></p>
                <p>Kolon 3: <span className="text-slate-200">Çevrim Tutarı ($)</span></p>
                <p>Kolon 4: <span className="text-slate-200">Ödül Tutarı ($)</span> (Opsiyonel)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={handleFetchAndPreview}
            disabled={isLoadingSheet}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isLoadingSheet ? 'animate-spin' : ''}`} />
            <span>{isLoadingSheet ? 'Okunuyor...' : 'E-Tabloyu Oku & Önizle'}</span>
          </button>

          <button
            onClick={handleApplyToLeaderboard}
            disabled={isLoadingSheet}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Listeye Aktar & Kaydet</span>
          </button>

          <button
            onClick={handleSaveSettingsOnly}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Sadece Ayarları Kaydet</span>
          </button>
        </div>

        {/* Status Alert */}
        {statusMessage && (
          <div
            className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-center gap-2.5 ${
              statusMessage.success
                ? 'bg-emerald-950/40 border-emerald-800/70 text-emerald-300'
                : 'bg-red-950/40 border-red-800/70 text-red-300'
            }`}
          >
            {statusMessage.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* Sheets Preview Table */}
      {previewRows && previewRows.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs space-y-3 p-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h4 className="text-xs font-semibold text-white">E-Tablodan Okunan İlk Satırlar (Önizleme)</h4>
            <span className="text-[11px] text-slate-500">{previewRows.length} satır gösteriliyor</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {previewRows.map((row, rIdx) => (
                  <tr key={rIdx} className={rIdx === 0 ? 'bg-slate-950 font-bold text-slate-300' : 'hover:bg-slate-800/40'}>
                    <td className="py-2 px-3 text-slate-500 w-10">{rIdx + 1}</td>
                    {row.map((cell: any, cIdx: number) => (
                      <td key={cIdx} className="py-2 px-3 text-slate-300">
                        {String(cell ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily Automation Explanation Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <Clock className="w-4 h-4 text-emerald-400" />
          <span>Her Gün Saat 21:00&apos;da Akış Nasıl Çalışır?</span>
        </div>
        <div className="text-xs text-slate-400 space-y-2 leading-relaxed">
          <p>
            1. Sunucu her gün saat <strong className="text-emerald-400 font-mono">21:00</strong> olduğunda Google Sheets bağlantısını kontrol eder.
          </p>
          <p>
            2. Belirttiğiniz Google E-Tablodaki en güncel çevrim listesini otomatik çeker ve sıralar.
          </p>
          <p>
            3. İsimleri güvenli şekilde maskeler (<code className="text-slate-300">De**8</code>), ödülleri hesaplar ve bugünün tarihiyle Telegram kanalınıza tek parça halinde gönderir.
          </p>
        </div>
      </div>
    </div>
  );
};
