/**
 * カレンダー同期の型定義
 *
 * @module shared/lib/calendar-sync/types
 */

export interface ReservationSyncData {
  reservationId: string;
  spaceName: string;
  customerName: string;
  customerEmail: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  notes?: string;
  totalPrice?: number | null;
}

export interface EventSyncData {
  eventId: string;
  title: string;
  /** Lexical plainText 派生（descriptionPlainText カラムから取得） */
  descriptionPlainText: string;
  startTime: Date;
  endTime: Date;
  /**
   * 合成済み会場文字列（formatEventVenue の結果）。
   * 会場未設定のイベント（location/space/addressDetail 全て空）では null。
   * ReservationSyncData.location（optional）と異なり、Event は呼び出し側で
   * 必ず明示的に解決してから渡す契約。
   */
  location: string | null;
  /** 公開ページ URL（管理者が GCal から公開ページに飛べるようにする） */
  publicUrl: string;
}

export interface SyncResult {
  success: boolean;
  eventId?: string;
  oauthEventId?: string;
  error?: string;
}

export interface TwoWaySyncResult {
  success: boolean;
  processed: number;
  deleted: number;
  updated: number;
  errors: string[];
}
