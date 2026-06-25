/**
 * 予約関連の共有型定義
 *
 * 管理画面・公開ページ両方で使用される型
 */

import type {
  Prisma,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";

/**
 * Prismaトランザクションクライアント型
 *
 * Prisma拡張クライアントとの互換性を確保するため、
 * reservationモデルのfindFirstメソッドのみを要求する型定義。
 * where / orderBy は Prisma 公式の Input 型を使用して field 名 typo / type drift
 * を build 時検出する。
 */
export interface PrismaTransactionClient {
  reservation: {
    findFirst: (args: {
      where: Prisma.ReservationWhereInput;
      select?: Prisma.ReservationSelect;
    }) => Promise<{
      id: string;
      startTime: Date;
      endTime: Date;
      status: ReservationStatus;
    } | null>;
  };
  blockedDate: {
    findFirst: (args: {
      where: Prisma.BlockedDateWhereInput;
      orderBy?: Prisma.BlockedDateOrderByWithRelationInput;
      select?: Prisma.BlockedDateSelect;
    }) => Promise<{ reason: string | null } | null>;
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
