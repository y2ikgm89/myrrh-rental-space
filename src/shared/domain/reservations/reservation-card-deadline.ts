import { isWithinDeadline } from "./deadline";

/** 一覧カードの変更・キャンセル表示と同じステータス集合（詳細の CANCELLABLE と一致） */
const MODIFIABLE_STATUSES = new Set(["PENDING", "CONFIRMED"]);

export interface ReservationCardDeadlineInput {
  readonly status: string;
  readonly startTime: Date;
}

export interface ReservationDeadlineSettingsInput {
  readonly modificationDeadlineHours: number;
  readonly cancellationDeadlineHours: number;
}

/**
 * マイページ予約一覧カード用: 変更リンク・キャンセルリンク・期限外メッセージの表示可否。
 * 「現在時刻」は呼び出し側（Server Component 等）で渡し、ドメイン関数は純粋に保つ。
 */
export function getReservationCardDeadlineState(
  reservation: ReservationCardDeadlineInput,
  deadlineSettings: ReservationDeadlineSettingsInput,
  now: Date,
): {
  readonly canModify: boolean;
  readonly canCancel: boolean;
  readonly showPastDeadlineMessage: boolean;
} {
  const isModifiable = MODIFIABLE_STATUSES.has(reservation.status);
  const canModify =
    isModifiable &&
    isWithinDeadline(
      reservation.startTime,
      deadlineSettings.modificationDeadlineHours,
      now,
    );
  const canCancel =
    isModifiable &&
    isWithinDeadline(
      reservation.startTime,
      deadlineSettings.cancellationDeadlineHours,
      now,
    );
  const showPastDeadlineMessage = isModifiable && !canModify && !canCancel;

  return { canModify, canCancel, showPastDeadlineMessage };
}
