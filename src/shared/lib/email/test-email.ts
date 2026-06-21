/**
 * テスト送信ラッパー（管理画面の「テスト送信」ボタンから呼ばれる）。
 *
 * Resend 公式推奨をフル適用:
 * - `react:` で React Email component を渡す（@react-email/render 不要）
 * - `tags` で本番トラフィックから分離（dashboard で category=test 抽出可）
 * - `headers["X-Test-Email"]` で受信側 grep 可
 * - per-click unique idempotencyKey で同一クリックの retry を吸収、連続クリックは別送信
 *
 * @module shared/lib/email/test-email
 */

import "server-only";

import { randomUUID } from "node:crypto";
import { TestEmail } from "@/shared/emails/test-email";
import { sendEmail } from "./send";
import type { EmailResult } from "./types";

export type SendTestEmailParams = {
  to: string;
  staffId: string;
  triggeredByEmail: string;
  triggeredByName: string;
  siteName: string;
  simulatorAddress: boolean;
};

export async function sendTestEmail(
  params: SendTestEmailParams,
): Promise<EmailResult> {
  const {
    to,
    staffId,
    triggeredByEmail,
    triggeredByName,
    siteName,
    simulatorAddress,
  } = params;
  const now = new Date();
  const timestamp = formatJst(now);
  const ts = now.getTime();
  const rnd6 = randomUUID().replace(/-/g, "").slice(0, 6);

  return sendEmail({
    payload: {
      to,
      subject: `【${siteName}】テスト送信（${timestamp}）`,
      react: TestEmail({
        recipientLabel: to,
        siteName,
        timestamp,
        triggeredByName,
        triggeredByEmail,
      }),
      tags: [
        { name: "category", value: "test" },
        { name: "source", value: "admin_settings" },
      ],
      headers: { "X-Test-Email": "true" },
    },
    idempotencyKey: `test-email/${staffId}/${ts}-${rnd6}`,
    operation: "settings.test_email_send",
    context: { recipient: to, simulatorAddress },
  });
}

function formatJst(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
