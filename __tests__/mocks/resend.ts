/**
 * Resend メールサービス モック
 *
 * Resend SDK v6+ の `{ data, error }` 返却シェイプと
 * `emails.send(payload, { idempotencyKey })` の 2 引数シグネチャに準拠。
 */

import { mock } from "bun:test";

// =============================================================================
// Types
// =============================================================================

export type MockEmailResponse = {
  data: { id: string } | null;
  error: { name: string; message: string } | null;
};

export interface MockEmail {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  react?: React.ReactElement;
}

export type MockSendOptions = {
  idempotencyKey?: string;
};

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
