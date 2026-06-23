/**
 * Resend メールサービス モック
 *
 * ## 型整合の方針
 * 公式 Resend SDK (`resend`) の `CreateEmailOptions` / `CreateEmailResponse` を
 * **直接 import** し、モック関数のパラメータ・戻り値型として再利用する。
 *
 * SDK の major bump（v6 で `{ data, error }` シェイプ確立 / `react?: ReactNode`、
 * `idempotencyKey` を 2nd 引数 `CreateEmailRequestOptions` に切出 etc.）が起きたとき、
 * 送信ヘルパの実装より **テストの mock factory が先に型エラーで落ちる**ことで
 * silent contract drift を検知する。
 *
 * @see https://resend.com/docs/api-reference/emails/send-email
 */

import { mock } from "bun:test";
import type {
  CreateEmailOptions,
  CreateEmailRequestOptions,
  CreateEmailResponse,
} from "resend";

// =============================================================================
// Types — Resend SDK 公式型のサブセット
// =============================================================================

/**
 * Resend SDK の `emails.send()` 返却型をそのまま採用。
 * `{ data: { id } | null, error: ErrorResponse | null }`。
 */
export type MockEmailResponse = CreateEmailResponse;

/**
 * Resend SDK の `emails.send()` ペイロード型をそのまま採用。
 * `text` / `html` / `react` の排他 union（discriminated by content kind）が維持される。
 */
export type MockEmail = CreateEmailOptions;

/**
 * Resend SDK の `emails.send()` の 2nd 引数 `{ idempotencyKey? }`。
 */
export type MockSendOptions = CreateEmailRequestOptions;

/**
 * 送信ログ用: ペイロード + 任意の idempotencyKey を flatten した記録。
 */
export type MockEmailRecord = MockEmail & {
  idempotencyKey?: string;
};

// =============================================================================
// Mock Implementation
// =============================================================================

/**
 * 送信されたメールを記録する配列（idempotencyKey 含む）
 */
export const sentEmails: MockEmailRecord[] = [];

/**
 * Resend.emails.send のモック関数
 *
 * `resend.emails.send(payload)` / `resend.emails.send(payload, { idempotencyKey })` の
 * 両シグネチャに対応。成功時は `{ data: { id }, error: null }` を返す。
 */
export const mockSendEmail = mock<
  (email: MockEmail, options?: MockSendOptions) => Promise<MockEmailResponse>
>((email: MockEmail, options?: MockSendOptions) => {
  sentEmails.push({
    ...email,
    ...(options?.idempotencyKey !== undefined && {
      idempotencyKey: options.idempotencyKey,
    }),
  });
  return Promise.resolve({
    data: { id: `mock-email-${Date.now()}` },
    error: null,
  });
});

/**
 * Resend クライアントのモック
 */
export const mockResendClient = {
  emails: {
    send: mockSendEmail,
  },
};

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * モックをリセット
 */
export function resetResendMock(): void {
  sentEmails.length = 0;
  mockSendEmail.mockClear();
}

/**
 * 送信されたメールを取得
 */
export function getSentEmails(): MockEmailRecord[] {
  return [...sentEmails];
}

/**
 * 特定の宛先に送信されたメールを検索
 */
export function findEmailTo(email: string): MockEmailRecord | undefined {
  return sentEmails.find((e) =>
    Array.isArray(e.to) ? e.to.includes(email) : e.to === email,
  );
}

/**
 * 特定の件名のメールを検索
 */
export function findEmailBySubject(
  subject: string,
): MockEmailRecord | undefined {
  return sentEmails.find((e) => e.subject.includes(subject));
}

/**
 * 特定の idempotency key を持つメールを検索
 */
export function findEmailByIdempotencyKey(
  key: string,
): MockEmailRecord | undefined {
  return sentEmails.find((e) => e.idempotencyKey === key);
}
