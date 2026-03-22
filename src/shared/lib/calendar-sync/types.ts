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
