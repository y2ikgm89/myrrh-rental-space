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
 * 空き判定が実際に使う findFirst だけを要求する最小構造型。呼び出し側を
 * `Prisma.TransactionClient` に縛らず、テストでも差し替えやすくする
 * （app 標準 client は `$extends` していないので互換性のための回避策ではない。
 * 経緯は `src/shared/domain/reservations/series-advisory-lock.ts` のコメント）。
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
  eventTimeSlot: {
    findFirst: (args: {
      where: Prisma.EventTimeSlotWhereInput;
      select?: Prisma.EventTimeSlotSelect;
    }) => Promise<{
      id: string;
      startAt: Date;
      endAt: Date;
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
