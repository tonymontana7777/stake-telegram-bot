import React, { useState, useRef } from 'react';
import {
  Plus,
  Trash2,
  Save,
  ClipboardPaste,
  Wand2,
  ArrowUp,
  ArrowDown,
  Users,
  DollarSign,
  Trophy,
  Check,
  FileSpreadsheet,
  Download,
  Upload,
  AlertCircle,
} from 'lucide-react';
import { LeaderboardItem } from '../types.ts';
import {
  DEFAULT_PRIZE_DISTRIBUTION,
  formatCurrency,
  formatPrize,
  maskUsername,
  parseRawInput,
} from '../utils/formatters.ts';
import { fetchGoogleSheetData, parseSheetRowsToLeaderboard } from '../services/googleSheets.ts';

interface LeaderboardEditorProps {
  items: LeaderboardItem[];
  onSaveItems: (newItems: LeaderboardItem[]) => Promise<void>;
  autoMask: boolean;
  onToggleAutoMask: (val: boolean) => void;
  onOpenGoogleSheetsTab?: () => void;
  onSaveConfig?: (cfg: any) => Promise<void>;
}

export const LeaderboardEditor: React.FC<LeaderboardEditorProps> = ({
  items,
  onSaveItems,
  autoMask,
  onToggleAutoMask,
  onOpenGoogleSheetsTab,
  onSaveConfig,
}) => {
  const [localItems, setLocalItems] = useState<LeaderboardItem[]>(items);
  const [isSaving, setIsSaving] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [importStatus, setImportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Quick Google Sheet Modal
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [sheetLoading, setSheetLoading] = useState(false);

  // Sync if prop changes externally
  React.useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const totalWager = localItems.reduce((acc, item) => acc + (Number(item.wager) || 0), 0);
  const totalPrize = localItems.reduce((acc, item) => acc + (Number(item.prize) || 0), 0);

  // Export to JSON
  const handleExportJson = () => {
    const dataToExport = {
      exportDate: new Date().toISOString(),
      appName: 'Stake Telegram Bot',
      count: localItems.length,
      items: localItems.map((item, index) => ({
        rank: item.rank || index + 1,
        username: item.username,
        wager: Number(item.wager) || 0,
        prize: Number(item.prize) || 0,
      })),
    };

    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(dataToExport, null, 2)
    )}`;
    const downloadAnchor = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `stake-leaderboard-${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setImportStatus({
      success: true,
      message: `${localItems.length} kayıt JSON olarak dışa aktarıldı.`,
    });
    setTimeout(() => setImportStatus(null), 3000);
  };

  // Import from JSON
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    fileReader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        // Support both direct array and object with items field
        let rawList: unknown[] = [];
        if (Array.isArray(parsed)) {
          rawList = parsed;
        } else if (parsed && Array.isArray(parsed.items)) {
          rawList = parsed.items;
        } else if (parsed && Array.isArray(parsed.leaderboard)) {
          rawList = parsed.leaderboard;
        } else {
          throw new Error('Geçerli bir liste formatı bulunamadı. JSON bir dizi veya "items" dizisi içermelidir.');
        }

        if (rawList.length === 0) {
          throw new Error('İçe aktarılan JSON dosyası boş.');
        }

        const formattedItems: LeaderboardItem[] = rawList.map((item: any, idx: number) => ({
          id: Math.random().toString(36).substring(2, 9),
          rank: Number(item.rank) || idx + 1,
          username: String(item.username || item.name || `User${idx + 1}`),
          wager: Number(item.wager || item.amount || 0),
          prize: Number(item.prize ?? (DEFAULT_PRIZE_DISTRIBUTION[idx] ?? 0)),
        }));

        setLocalItems(formattedItems);
        setImportStatus({
          success: true,
          message: `${formattedItems.length} kayıt başarıyla içe aktarıldı! Değişiklikleri uygulamak için "Listeyi Kaydet" butonuna basabilirsiniz.`,
        });
        setTimeout(() => setImportStatus(null), 4000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'JSON dosyası okunurken hata oluştu.';
        setImportStatus({
          success: false,
          message: msg,
        });
        setTimeout(() => setImportStatus(null), 4000);
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    fileReader.readAsText(file);
  };

  const handleQuickFetchSheet = async () => {
    if (!sheetUrlInput.trim()) {
      setImportStatus({
        success: false,
        message: 'Lütfen geçerli bir Google E-Tablo linki veya ID girin.',
      });
      return;
    }

    setSheetLoading(true);
    setImportStatus(null);

    try {
      const rows = await fetchGoogleSheetData(sheetUrlInput.trim(), 'A1:G100');
      const parsed = parseSheetRowsToLeaderboard(rows, autoMask);

      if (parsed.length === 0) {
        throw new Error('E-Tablodan oyuncu veya çevrim verisi çıkarılamadı. Lütfen tablonun dolu olduğundan ve paylaşım izninin açık olduğundan emin olun.');
      }

      setLocalItems(parsed);
      await onSaveItems(parsed);
      if (onSaveConfig) {
        await onSaveConfig({
          spreadsheetId: sheetUrlInput.trim(),
          sheetsSyncEnabled: true,
        });
      }
      setShowSheetModal(false);
      setSheetUrlInput('');
      setImportStatus({
        success: true,
        message: `✅ Google E-Tablo başarıyla okundu! ${parsed.length} oyuncu listeye aktarıldı ve kaydedildi.`,
      });
      setTimeout(() => setImportStatus(null), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'E-Tablo okunamadı.';
      setImportStatus({
        success: false,
        message: `❌ Hata: ${msg}`,
      });
    } finally {
      setSheetLoading(false);
    }
  };

  const handleItemChange = (id: string, field: keyof LeaderboardItem, value: string | number) => {
    setLocalItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          [field]: field === 'wager' || field === 'prize' || field === 'rank' ? Number(value) || 0 : value,
        };
      })
    );
  };

  const handleAddRow = () => {
    const nextRank = localItems.length + 1;
    const defaultPrize = DEFAULT_PRIZE_DISTRIBUTION[nextRank - 1] ?? 0;
    const newItem: LeaderboardItem = {
      id: Math.random().toString(36).substring(2, 9),
      rank: nextRank,
      username: `Oy**${nextRank}`,
      wager: 10000,
      prize: defaultPrize,
    };
    setLocalItems([...localItems, newItem]);
  };

  const handleDeleteRow = (id: string) => {
    const updated = localItems.filter((item) => item.id !== id);
    // Recalculate ranks
    const reRanked = updated.map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));
    setLocalItems(reRanked);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === localItems.length - 1)
    ) {
      return;
    }
    const newItems = [...localItems];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const temp = newItems[index];
    newItems[index] = newItems[targetIdx];
    newItems[targetIdx] = temp;

    // Fix ranks
    const reRanked = newItems.map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));
    setLocalItems(reRanked);
  };

  const handleApplyDefaultPrizes = () => {
    const updated = localItems.map((item, idx) => ({
      ...item,
      prize: DEFAULT_PRIZE_DISTRIBUTION[idx] ?? 0,
    }));
    setLocalItems(updated);
  };

  const handleMaskAllUsernames = () => {
    const updated = localItems.map((item) => ({
      ...item,
      username: maskUsername(item.username),
    }));
    setLocalItems(updated);
  };

  const handleParseAndApply = () => {
    if (!pasteText.trim()) return;
    const parsed = parseRawInput(pasteText, autoMask);
    if (parsed.length > 0) {
      setLocalItems(parsed);
      setShowPasteModal(false);
      setPasteText('');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveItems(localItems);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-400">Katılımcı Sayısı</span>
            <div className="text-2xl font-bold text-white font-mono tabular-nums mt-0.5">
              {localItems.length} <span className="text-xs font-normal text-slate-500">Oyuncu</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-400">Toplam Çevrim (Wager)</span>
            <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums mt-0.5">
              {formatCurrency(totalWager)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-400">Toplam Ödül Havuzu</span>
            <div className="text-2xl font-bold text-amber-400 font-mono tabular-nums mt-0.5">
              ${totalPrize.toLocaleString()}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Trophy className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowPasteModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-blue-400" />
            <span>Toplu Liste Yapıştır</span>
          </button>

          {/* Quick Google Sheets Fetch */}
          <button
            onClick={() => setShowSheetModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-950 hover:bg-emerald-900/80 text-emerald-300 rounded-lg border border-emerald-800 transition-colors shadow-xs"
            title="Google E-Tablo linki yapıştırıp doğrudan oyuncuları aktarın"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Google E-Tablo Linkinden Oku</span>
          </button>

          {/* JSON Export */}
          <button
            onClick={handleExportJson}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
            title="Mevcut çevrim listesini JSON dosyası olarak indirir"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>JSON İndir (Yedekle)</span>
          </button>

          {/* JSON Import */}
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span>JSON Yükle</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportJson}
              className="hidden"
            />
          </label>

          <button
            onClick={handleApplyDefaultPrizes}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
            title="1. sıra $800, 2. sıra $500 ... 10. sıra $25 şablonunu otomatik uygula"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>3000$ Ödül Dağıtımı Uygula</span>
          </button>

          <button
            onClick={handleMaskAllUsernames}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
            title="Tüm kullanıcı adlarını 'De**8' formatında maskeler"
          >
            <Wand2 className="w-3.5 h-3.5 text-purple-400" />
            <span>İsimleri Maskele (De**8)</span>
          </button>

          <label className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-lg cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoMask}
              onChange={(e) => onToggleAutoMask(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
            />
            <span>Otomatik Gizleme Aktif</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAddRow}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>Satır Ekle</span>
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {saveSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-white" />
                <span>Kaydedildi!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Kaydediliyor...' : 'Listeyi Kaydet'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Import / Export Notification */}
      {importStatus && (
        <div
          className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-center gap-2.5 transition-all ${
            importStatus.success
              ? 'bg-emerald-950/50 border-emerald-800/80 text-emerald-300'
              : 'bg-red-950/50 border-red-800/80 text-red-300'
          }`}
        >
          {importStatus.success ? (
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{importStatus.message}</span>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
              <tr>
                <th className="py-3 px-4 w-14 text-center">Sıra</th>
                <th className="py-3 px-4">Kullanıcı Adı (Telegram Görünümü)</th>
                <th className="py-3 px-4 text-right">Çevrim Tutarı ($)</th>
                <th className="py-3 px-4 text-right">Ödül ($)</th>
                <th className="py-3 px-4 w-28 text-center">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {localItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                    Henüz liste girilmemiş. Yukarıdaki &quot;Toplu Liste Yapıştır&quot; veya &quot;Satır Ekle&quot; ile ekleyebilirsiniz.
                  </td>
                </tr>
              ) : (
                localItems.map((item, index) => {
                  const displayUsername = autoMask ? maskUsername(item.username) : item.username;
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Rank */}
                      <td className="py-2.5 px-4 text-center">
                        <span className={`inline-block font-bold ${index < 3 ? 'text-amber-400' : 'text-slate-400'}`}>
                          {item.rank}.
                        </span>
                      </td>

                      {/* Username input with mask hint */}
                      <td className="py-2.5 px-4 font-sans">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={item.username}
                            onChange={(e) => handleItemChange(item.id, 'username', e.target.value)}
                            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono w-36 sm:w-48"
                            placeholder="De**8"
                          />
                          {autoMask && item.username !== displayUsername && (
                            <span className="text-[11px] text-slate-500 font-mono">
                              (Önizleme: <span className="text-emerald-400">{displayUsername}</span>)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Wager Input */}
                      <td className="py-2.5 px-4 text-right font-mono">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-slate-500">$</span>
                          <input
                            type="number"
                            step="any"
                            value={item.wager}
                            onChange={(e) => handleItemChange(item.id, 'wager', e.target.value)}
                            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-emerald-400 text-right focus:outline-none focus:border-emerald-500 w-32 font-mono tabular-nums"
                          />
                        </div>
                      </td>

                      {/* Prize Input */}
                      <td className="py-2.5 px-4 text-right font-mono">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-slate-500">-$</span>
                          <input
                            type="number"
                            step="any"
                            value={item.prize}
                            onChange={(e) => handleItemChange(item.id, 'prize', e.target.value)}
                            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-amber-400 text-right focus:outline-none focus:border-emerald-500 w-24 font-mono tabular-nums"
                          />
                        </div>
                      </td>

                      {/* Row actions */}
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleMove(index, 'up')}
                            disabled={index === 0}
                            className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 rounded hover:bg-slate-800"
                            title="Yukarı Taşı"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleMove(index, 'down')}
                            disabled={index === localItems.length - 1}
                            className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 rounded hover:bg-slate-800"
                            title="Aşağı Taşı"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRow(item.id)}
                            className="p-1 text-red-400 hover:text-red-300 rounded hover:bg-red-950/40 ml-1"
                            title="Satırı Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Helpful Info Box */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 leading-relaxed space-y-1">
        <p className="font-semibold text-slate-300">💡 Otomasyon & Güncelleme Bilgisi:</p>
        <p>
          Her akşam saat <span className="text-emerald-400 font-mono">21:00</span>&apos;da bu listedeki güncel katılımcılar ve çevrim miktarları okunur. Mesajın başlığındaki tarih otomatik olarak o günün tarihi (örn: <span className="font-mono text-slate-300">{new Date().toLocaleDateString('tr-TR')}</span>) yapılarak Telegram kanalınıza gönderilir.
        </p>
      </div>

      {/* Bulk Paste Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Toplu Liste veya Çevrim Verisi Yapıştır</h3>
              </div>
              <button
                onClick={() => setShowPasteModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                Kapat (✕)
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Stake affiliate panelinden, Excel tablonuzdan veya önceki Telegram mesajınızdan kopyaladığınız listeyi buraya yapıştırın. Sistem kullanıcı adlarını, çevrim miktarlarını ve ödülleri otomatik olarak ayrıştıracaktır.
            </p>

            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`Örnek Format 1 (Telegram Mesajı):
1. De**8 $63,011.06 -$800
2. Ah**n $52,350.07 -$500

Örnek Format 2 (Tablo veya Excel):
De**8	63011.06
Ah**n	52350.07`}
              className="w-full h-56 bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPasteModal(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                İptal
              </button>
              <button
                onClick={handleParseAndApply}
                disabled={!pasteText.trim()}
                className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                Ayrıştır ve Listeye Aktar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Google Sheets Modal */}
      {showSheetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Google E-Tablo Linki Yapıştır</h3>
              </div>
              <button
                onClick={() => setShowSheetModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                Kapat (✕)
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Google E-Tablonuzun bağlantısını (URL) buraya yapıştırın. Sistem tablonuzu anında okuyarak oyuncu sıralamasını ve çevrim miktarlarını doğrudan bu listeye aktaracaktır.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300 block">
                Google E-Tablo Linki:
              </label>
              <input
                type="text"
                value={sheetUrlInput}
                onChange={(e) => setSheetUrlInput(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5n.../edit"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-hidden focus:border-emerald-500"
              />
              <span className="text-[11px] text-slate-500 block">
                ⚠️ Tablonuzun sağ üstündeki <strong>Paylaş</strong> butonundan <em>&quot;Bağlantıya sahip olan herkes görüntüleyebilir&quot;</em> seçeneğini açmanız yeterlidir.
              </span>
            </div>

            <div className="flex items-center justify-between pt-2">
              {onOpenGoogleSheetsTab && (
                <button
                  type="button"
                  onClick={() => {
                    setShowSheetModal(false);
                    onOpenGoogleSheetsTab();
                  }}
                  className="text-xs text-emerald-400 hover:underline"
                >
                  Detaylı Sheets Ayarları &rarr;
                </button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => setShowSheetModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  İptal
                </button>
                <button
                  onClick={handleQuickFetchSheet}
                  disabled={sheetLoading || !sheetUrlInput.trim()}
                  className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {sheetLoading ? 'Tablo Okunuyor...' : 'E-Tablodan Aktar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
