import "server-only";

import { prisma } from "@/shared/db/prisma";
import { reissueReceiptCommand } from "@/shared/domain/receipts/issue";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";
import { timingSafeEqualStrings } from "@/shared/lib/timing-safe";

/**
 * ゲスト向け領収書再送信リクエストの domain command (RECEIPT-RESEND-P1)。
 *
 * ## 背景
 * ゲスト予約 (customerId=null) はメール本文の署名 URL で領収書を DL する契約。
 * 署名 URL は 24 時間 TTL + `Receipt.usedAt` の single-use gate の 2 段防御で、
 * どちらか 1 つでも消費されるとゲストは自力で再取得できなくなる。従来は admin
 * 手動対応が唯一の救済経路だったが、Stripe / Money Forward Cloud に倣って
 * **ゲスト側セルフサービス再送信** を追加する (2026-07-19 deep-research 結論)。
 *
 * ## 呼出契約
 * - `serialNo`: フォーム入力の領収書番号 (トリム済み)
 * - `email`: フォーム入力の受信メールアドレス (トリム/lower済み)
 * - 入力 email は `normalizeEmailForIdentity` で SSoT 正規化してから比較する
 *
 * ## Case 分岐
 * - **Case B**: `usedAt` が NULL (単に TTL 超過だけ) → 元 Receipt をそのまま返す。
 *   呼出側で **新 token** を発行してメール送信するだけ。single-use gate は
 *   保持されたままで、Receipt レコードは変更されない (監査ノイズを避ける)。
 * - **Case C**: `usedAt` が非 NULL (single-use gate 消費済) → `reissueReceiptCommand`
 *   で新 Receipt を発行 (`revision +1`、`reissuedFromId` chain、新 serialNo、
 *   発行時点 Settings で `issuerSnapshot` 再取得)。旧 Receipt は orphan 化される。
 *
 * ## enumeration 対策
 * - Receipt 未発見・email mismatch・orphan (再発行済) はすべて `null` を返す。
 *   呼出側は結果に関わらず「完了画面」を表示することで、攻撃者に
 *   serialNo / email の enumeration 情報を漏らさない (Stripe/OWASP パターン)。
 * - email 一致は `timingSafeEqualStrings` で side-channel を遮断する。
 *
 * @returns 成功時: `receipt` (最新 Receipt) + `recipientEmail` (正規化済) +
 *          Case C なら `previousSerialNo` (旧領収書番号)。
 *          失敗時: `null` (呼出側で完了画面を出しつつ内部ログには理由を残す)。
 */
export type ReceiptResendRequestResult = {
  readonly receipt: {
    readonly id: string;
    readonly serialNo: string;
    readonly recipientName: string;
    readonly subject: string;
    readonly amount: number;
    readonly taxAmount: number;
    readonly taxRate: number;
    readonly issuedAt: Date;
  };
  readonly recipientEmail: string;
  readonly previousSerialNo?: string;
  readonly wasReissued: boolean;
} | null;

export async function requestReceiptResendByEmail(input: {
  readonly serialNo: string;
  readonly email: string;
}): Promise<ReceiptResendRequestResult> {
  const normalizedInputEmail = normalizeEmailForIdentity(input.email);
  const trimmedSerialNo = input.serialNo.trim();

  if (trimmedSerialNo.length === 0 || normalizedInputEmail.length === 0) {
    return null;
  }

  const receipt = await prisma.receipt.findUnique({
    where: { serialNo: trimmedSerialNo },
    select: {
      id: true,
      serialNo: true,
      recipientName: true,
      subject: true,
      amount: true,
      taxAmount: true,
      taxRate: true,
      issuedAt: true,
      usedAt: true,
      reservationId: true,
      eventRegistrationId: true,
      reservation: {
        select: {
          guestEmail: true,
          customer: { select: { email: true } },
        },
      },
      eventRegistration: {
        select: {
          email: true,
          customer: { select: { email: true } },
        },
      },
    },
  });

  if (!receipt) return null;

  // orphan (既に再発行され、reservationId/eventRegistrationId 両方 NULL) は base にできない
  // (issue.ts の VALIDATION reject と対称)。ゲストは常に「latest な Receipt」を持つはずなので
  // 旧 orphan が指定された時点で不整合 (もしくは攻撃) と判断し 404 相当に隠蔽する。
  if (receipt.reservationId === null && receipt.eventRegistrationId === null) {
    return null;
  }

  const candidateEmails: string[] = [];
  if (receipt.reservation) {
    if (receipt.reservation.guestEmail) {
      candidateEmails.push(
        normalizeEmailForIdentity(receipt.reservation.guestEmail),
      );
    }
    if (receipt.reservation.customer?.email) {
      candidateEmails.push(
        normalizeEmailForIdentity(receipt.reservation.customer.email),
      );
    }
  }
  if (receipt.eventRegistration) {
    if (receipt.eventRegistration.email) {
      candidateEmails.push(
        normalizeEmailForIdentity(receipt.eventRegistration.email),
      );
    }
    if (receipt.eventRegistration.customer?.email) {
      candidateEmails.push(
        normalizeEmailForIdentity(receipt.eventRegistration.customer.email),
      );
    }
  }

  const matched = candidateEmails.some((candidate) =>
    timingSafeEqualStrings(candidate, normalizedInputEmail),
  );
  if (!matched) return null;

  // Case B: 未使用 → 元 Receipt を返す (呼出側で新 token 発行 + メール送信のみ)
  if (receipt.usedAt === null) {
    return {
      receipt: {
        id: receipt.id,
        serialNo: receipt.serialNo,
        recipientName: receipt.recipientName,
        subject: receipt.subject,
        amount: receipt.amount,
        taxAmount: receipt.taxAmount,
        taxRate: receipt.taxRate,
        issuedAt: receipt.issuedAt,
      },
      recipientEmail: normalizedInputEmail,
      wasReissued: false,
    };
  }

  // Case C: single-use gate 消費済 → 新 Receipt を発行 (revision +1)
  const previousSerialNo = receipt.serialNo;
  const newReceipt = await reissueReceiptCommand({
    originalReceiptId: receipt.id,
    reason: "ゲスト再送信リクエスト (single-use gate 消費済み)",
    // binding check は guest 経路では両方 optional (Receipt 側の紐付けを信頼する)。
  });

  return {
    receipt: {
      id: newReceipt.id,
      serialNo: newReceipt.serialNo,
      recipientName: newReceipt.recipientName,
      subject: newReceipt.subject,
      amount: newReceipt.amount,
      taxAmount: newReceipt.taxAmount,
      taxRate: newReceipt.taxRate,
      issuedAt: newReceipt.issuedAt,
    },
    recipientEmail: normalizedInputEmail,
    previousSerialNo,
    wasReissued: true,
  };
}
