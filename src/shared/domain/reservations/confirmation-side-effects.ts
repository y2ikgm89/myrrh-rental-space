/**
 * 予約確定（作成 / CONFIRMED 遷移）後の smart-lock 発行 + 確認メールを統一実行する。
 *
 * 公開予約 / 管理画面の create・confirm 経路が同じ副作用チェーンを通る SSoT。
 * キャンセル側 (`cancellation-side-effects.ts`) と対称に channel で起点を区別する。
 *
 * 含まれる副作用:
 *   1. SwitchBot 一時パスコード発行（対象デバイスがあるスペースのみ）
 *   2. 顧客向け予約確認メール（`sendCustomerEmail !== false` のとき）
 *
 * GCal 同期 / 管理者通知メール / in-app 通知 / AuditLog は呼出側が個別に
 * fireAndForget する（経路ごとにタイミング・内容が異なるため phase 1 では未集約）。
 *
 * @module shared/domain/reservations/confirmation-side-effects
 */

import "server-only";

import { issueSmartLockPasscodes } from "@/shared/domain/smart-lock/issue-passcode";
import { sendReservationConfirmationEmail } from "@/shared/lib/email/reservation-emails";
import type { ReservationEmailData } from "@/shared/lib/email/types";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

export type ConfirmChannel = "customer" | "admin";

export interface ConfirmationSideEffectInput {
  /** command 結果から組み立てたメール payload（spaceId は payload 外で渡す）。 */
  payload: ReservationEmailData;
  spaceId: string;
  /** 起点チャネル（監査・将来の outcome metadata 用）。 */
  channel: ConfirmChannel;
  /**
   * false のとき顧客確認メールを送らず passcode 発行のみ行う。
   * 管理画面の CONFIRMED 作成で sendEmail=false のときに使う。省略時 true。
   */
  sendCustomerEmail?: boolean;
}

/**
 * 確認メール送信前に、スペースにアクティブなスマートロックデバイスがあれば
 * 一時パスコードを発行する。平文はメールに載せずハブで開示し、発行失敗時のみ
 * fallback 案内フラグを付ける。
 *
 * `issueSmartLockPasscodes` は対象デバイスが無いスペースでは即座に空配列を返す
 * ため、スマートロック未設定のスペースでは実質的な遅延は生じない（DB クエリ 1 回分のみ）。
 * デバイスが設定されているスペースでは SwitchBot 側の確定待ちで最大 45 秒程度
 * ブロックし得るが、意図した設計。
 */
export async function applyConfirmationSideEffects(
  input: ConfirmationSideEffectInput,
): Promise<void> {
  const sendCustomerEmail = input.sendCustomerEmail !== false;

  try {
    const result = await issueSmartLockPasscodes({
      reservationId: input.payload.reservationId,
      spaceId: input.spaceId,
      startTime: input.payload.startTime,
      endTime: input.payload.endTime,
    });

    if (!sendCustomerEmail) {
      return;
    }

    await sendReservationConfirmationEmail(
      result.issuanceFailed
        ? { ...input.payload, smartLockIssuanceFailed: true }
        : input.payload,
    );
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "applyConfirmationSideEffects",
        reservationId: input.payload.reservationId,
        channel: input.channel,
        sendCustomerEmail,
      },
    });
  }
}
