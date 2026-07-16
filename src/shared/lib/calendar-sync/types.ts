/**
 * カレンダー同期の型定義
 *
 * @module shared/lib/calendar-sync/types
 */

import type { MeetingProviderValue } from "@/shared/lib/validations/enums/prisma-types";

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
  slotId: string;
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
  /**
   * Meet URL の発行元 (Phase B.1)。`GOOGLE_MEET` のとき `createCalendarEvent` に
   * `withMeet: true` を渡し、応答の hangoutLink を `Event.meetingUrl` に write-back する。
   */
  meetingProvider: MeetingProviderValue;
}

export interface SyncResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

export interface TwoWaySyncResult {
  success: boolean;
  processed: number;
  deleted: number;
  updated: number;
  errors: string[];
}
