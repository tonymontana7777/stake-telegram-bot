import React, { useState } from 'react';
import { History, CheckCircle2, AlertCircle, Trash2, Eye, ExternalLink } from 'lucide-react';
import { BroadcastLog } from '../types.ts';

interface HistoryViewerProps {
  logs: BroadcastLog[];
  onClearLogs: () => Promise<void>;
}

export const HistoryViewer: React.FC<HistoryViewerProps> = ({ logs, onClearLogs }) => {
  const [selectedLog, setSelectedLog] = useState<BroadcastLog | null>(null);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Gönderim Geçmişi & Günlükler</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Zamanlayıcı veya manuel olarak Telegram&apos;a iletilen tüm mesajların durum kayıtları.
          </p>
        </div>

        {logs.length > 0 && (
          <button
            onClick={onClearLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-950/60 border border-red-900/40 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Kayıtları Temizle</span>
          </button>
        )}
      </div>

      {logs.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-2">
          <History className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm font-medium text-slate-300">Henüz Gönderim Kaydı Yok</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Telegram botunuza token ve hedef kanal ekledikten sonra &quot;Şimdi Gönder&quot; butonunu kullanarak veya saat 21:00 otomasyonunu bekleyerek ilk gönderimi yapabilirsiniz.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-medium">
                <tr>
                  <th className="py-3 px-4">Tarih & Saat</th>
                  <th className="py-3 px-4">Hedef Kanal</th>
                  <th className="py-3 px-4">Tetikleme Türü</th>
                  <th className="py-3 px-4">Durum</th>
                  <th className="py-3 px-4 text-right">Detay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {logs.map((log) => {
                  const date = new Date(log.timestamp);
                  const formattedTime = date.toLocaleTimeString('tr-TR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });
                  const formattedDate = date.toLocaleDateString('tr-TR');

                  return (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 text-slate-300">
                        {formattedDate} <span className="text-slate-500">{formattedTime}</span>
                      </td>
                      <td className="py-3 px-4 text-emerald-400 font-sans">
                        {log.chatId}
                      </td>
                      <td className="py-3 px-4 font-sans">
                        <span className="text-xs text-slate-400">
                          {log.triggeredBy === 'scheduler' ? '⏰ Saat 21:00 Otomasyon' : '👆 Manuel Gönderim'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-sans">
                        {log.status === 'success' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Başarılı (ID: {log.messageId || 'OK'})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-red-400 font-medium">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Hata ({log.error || 'Bilinmiyor'})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-sans">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3 text-slate-400" />
                          <span>Mesajı Gör</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Log Message Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-sm font-semibold text-white">İletilen Mesaj İçeriği</h4>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                Kapat (✕)
              </button>
            </div>

            <div className="text-xs space-y-1 text-slate-400 font-mono">
              <p>Tarih: {new Date(selectedLog.timestamp).toLocaleString('tr-TR')}</p>
              <p>Kanal: {selectedLog.chatId}</p>
              <p>Durum: {selectedLog.status === 'success' ? 'Başarılı' : `Hata: ${selectedLog.error}`}</p>
            </div>

            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 max-h-72 overflow-y-auto">
              <pre className="text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed">
                {selectedLog.messageContent}
              </pre>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
