/**
 * 予約関連の共有型定義
 *
 * 管理画面・公開ページ両方で使用される型
 */

import type { ReservationStatus } from "@/shared/lib/validations/enums";

/**
 * Prismaトランザクションクライアント型
 *
 * Prisma拡張クライアントとの互換性を確保するため、
 * reservationモデルのfindFirstメソッドのみを要求する型定義
 */
export interface PrismaTransactionClient {
  reservation: {
    findFirst: (args: {
      where: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => Promise<{
      id: string;
      startTime: Date;
      endTime: Date;
      status: ReservationStatus;
    } | null>;
  };
}

/**
 * 時間枠の型定義
 */
export interface TimeSlot {
  /** 時間（HH:MM形式） */
  time: string;
  /** 利用可能かどうか */
  available: boolean;
}

/**
 * カレンダー日付の型定義
 */
export interface CalendarDate {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isPast: boolean;
  hasAvailability: boolean;
}

/**
 * 重複チェックのパラメータ
 */
export interface OverlapCheckParams {
  spaceId: string;
  startTime: Date;
  endTime: Date;
  /** 更新時は自分自身を除外 */
  excludeReservationId?: string;
}

/**
 * 重複チェックの結果
 */
export interface OverlapCheckResult {
  hasOverlap: boolean;
  conflictingReservation?: {
    id: string;
    startTime: Date;
    endTime: Date;
    status: ReservationStatus;
  };
}
