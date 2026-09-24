export interface LeaderboardItem {
  id: string;
  rank: number;
  username: string;
  wager: number;
  prize: number;
}

export interface BotConfig {
  botToken: string;
  chatId: string;
  scheduleTime: string; // "21:00"
  timezone: string; // "Europe/Istanbul"
  enabled: boolean;
  totalPrize: number; // 3000
  headerTemplate: string; // "STAKE {TARIH} {ODUL}💵 ÖDÜLLÜ GÜNCEL ÇEVRİM LİSTESİ"
  footerTemplate: string; // "!stake"
  autoMask: boolean; // auto mask unmasked usernames e.g. Deniz8 -> De**8
  dateFormat: string; // "DD.MM.YYYY"
  showPrizes?: boolean; // if false, only show username and wager without prize amount
  // Google Sheets sync settings
  sheetsSyncEnabled?: boolean;
  spreadsheetId?: string;
  sheetRange?: string; // e.g. "Sayfa1!A2:D20" or "A2:D20"
  sheetGid?: string; // Google Sheets tab gid, e.g. 235680015
  googleAccessToken?: string;
}

export interface BroadcastLog {
  id: string;
  timestamp: string;
  dateStr: string;
  status: 'success' | 'error';
  chatId: string;
  messageContent: string;
  messageId?: number;
  error?: string;
  triggeredBy: 'scheduler' | 'manual';
}

export interface AppState {
  config: BotConfig;
  items: LeaderboardItem[];
  logs: BroadcastLog[];
  lastRunDate: string | null;
  botInfo?: {
    username?: string;
    first_name?: string;
    id?: number;
    can_join_groups?: boolean;
  } | null;
}
