/**
 * requestReceiptResendAction — ゲスト向け領収書再送信 Server Action の unit test.
 *
 * ## 検証観点
 *  - IP / email / serialNo それぞれの rate-limit hit で早期 error
 *  - Turnstile fail / honeypot 検出で早期 error
 *  - **enumeration 対策**: domain が null (Receipt 未発見・email mismatch・orphan) を
 *    返しても Server Action は **常に success (null)** を返す。send email も呼ばない。
 *  - Domain が result を返すと sendReceiptResendEmail が呼ばれる (Case B / Case C 両方)。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SubmissionResult } from "@conform-to/react";

const SERIAL_NO = "2026-000042";
const NEW_SERIAL_NO = "2026-000099";
const CUSTOMER_EMAIL = "guest@example.com";

const domainSpy = mock<
  (input: { serialNo: string; email: string }) => Promise<unknown>
>(() => Promise.resolve(null));

const sendReceiptResendEmailSpy = mock<
  (input: unknown) => Promise<{ ok: boolean }>
>(() => Promise.resolve({ ok: true }));

type LimitResult = { readonly success: boolean; readonly error?: string };
const ipCheckSpy = mock<() => Promise<LimitResult>>(() =>
  Promise.resolve({ success: true }),
);
const emailCheckSpy = mock<() => Promise<LimitResult>>(() =>
  Promise.resolve({ success: true }),
);
const serialNoCheckSpy = mock<() => Promise<LimitResult>>(() =>
  Promise.resolve({ success: true }),
);

type TurnstileResult =
  | { readonly success: true }
  | { readonly success: false; readonly error: string };
const turnstileSpy = mock<() => Promise<TurnstileResult>>(() =>
  Promise.resolve({ success: true }),
);

type BotHeuristicsResult =
  | { readonly success: true }
  | { readonly success: false; readonly error: string };
const botHeuristicsSpy = mock<() => BotHeuristicsResult>(() => ({
  success: true,
}));

const createAuditLogSpy = mock(() => Promise.resolve());
const fireAndForgetSpy = mock((promise: Promise<unknown>) => {
  // fire-and-forget は promise を捨てるのが本来の挙動だが、テストでは
  // 例外が silent に飲まれないことを確認するため await する
  return promise.catch(() => undefined);
});

beforeEach(() => {
  mock.restore();

  domainSpy.mockReset();
  domainSpy.mockImplementation(() => Promise.resolve(null));
  sendReceiptResendEmailSpy.mockReset();
  sendReceiptResendEmailSpy.mockImplementation(() =>
    Promise.resolve({ ok: true }),
  );
  ipCheckSpy.mockReset();
  ipCheckSpy.mockImplementation(() => Promise.resolve({ success: true }));
  emailCheckSpy.mockReset();
  emailCheckSpy.mockImplementation(() => Promise.resolve({ success: true }));
  serialNoCheckSpy.mockReset();
  serialNoCheckSpy.mockImplementation(() => Promise.resolve({ success: true }));
  turnstileSpy.mockReset();
  turnstileSpy.mockImplementation(() => Promise.resolve({ success: true }));
  botHeuristicsSpy.mockReset();
  botHeuristicsSpy.mockImplementation(() => ({ success: true }));
  createAuditLogSpy.mockReset();
  createAuditLogSpy.mockImplementation(() => Promise.resolve());
  fireAndForgetSpy.mockReset();
  fireAndForgetSpy.mockImplementation((promise: Promise<unknown>) =>
    promise.catch(() => undefined),
  );

  mock.module("@/shared/domain/receipts/resend", () => ({
    requestReceiptResendByEmail: domainSpy,
  }));

  mock.module("@/shared/domain/email/lib-dispatch", () => ({
    sendReceiptResendEmail: sendReceiptResendEmailSpy,
  }));

  mock.module("@/shared/domain/settings/turnstile", () => ({
    validateTurnstile: turnstileSpy,
  }));
  mock.module("@/shared/lib/action-helpers", () => ({
    checkActionRateLimit: ipCheckSpy,
    checkEmailRateLimit: emailCheckSpy,
    checkBotHeuristics: botHeuristicsSpy,
  }));

  mock.module("@/shared/lib/rate-limit", () => ({
    receiptResendByEmailRateLimiter: { check: emailCheckSpy },
    receiptResendBySerialNoRateLimiter: { check: serialNoCheckSpy },
    receiptResendRequestRateLimiter: { check: ipCheckSpy },
  }));

  mock.module("@/shared/domain/audit-log/commands", () => ({
    createAuditLogRecord: createAuditLogSpy,
  }));

  mock.module("@/shared/lib/audit-request-context", () => ({
    buildAuditRequestContext: mock(() =>
      Promise.resolve({ ip: "1.2.3.4", userAgent: "test-ua" }),
    ),
  }));

  mock.module("@/shared/lib/async-utils", () => ({
    fireAndForget: fireAndForgetSpy,
  }));

  mock.module("@/shared/lib/errors/server", () => ({
    ErrorCategory: {
      AUTHORIZATION: "AUTHORIZATION",
      DATABASE: "DATABASE",
      EXTERNAL_API: "EXTERNAL_API",
    },
    ErrorSeverity: { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" },
    logError: mock(() => undefined),
    normalizeError: (error: unknown) =>
      error instanceof Error ? error : new Error(String(error)),
  }));
});

async function importAction() {
  return await import("@/app/(public)/receipts/reissue-request/_actions/resend");
}

/**
 * action は conform の Server Action になったので FormData で呼ぶ。
 * honeypot のフィールド名は公開フォーム共通の `website`。
 */
function validInput(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("serialNo", SERIAL_NO);
  formData.set("email", CUSTOMER_EMAIL);
  formData.set("website", "");
  formData.set("formRenderedAt", String(Date.now() - 10_000));
  formData.set("turnstileToken", "test-token");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

/**
 * handler が返した `{ ok: false, error }` は `submission.reply({ formErrors })`
 * を経由して form-level（キー `""`）に入る。field-level の Zod エラーとは別物。
 */
function formError(result: SubmissionResult): string | undefined {
  return result.error?.[""]?.[0] ?? undefined;
}

/** `executeConformMutation` の成功 reply は `resetForm: true` = `initialValue: null` */
function isSuccess(result: SubmissionResult): boolean {
  return result.initialValue === null;
}

describe("requestReceiptResendAction (enumeration + rate-limit)", () => {
  test("IP rate-limit hit で早期 error (domain 未呼出)", async () => {
    ipCheckSpy.mockImplementation(() =>
      Promise.resolve({ success: false, error: "rate-limit-error" }),
    );

    const { requestReceiptResendAction } = await importAction();
    const result = await requestReceiptResendAction(undefined, validInput());

    expect(formError(result)).toBe("rate-limit-error");
    expect(domainSpy).not.toHaveBeenCalled();
    expect(sendReceiptResendEmailSpy).not.toHaveBeenCalled();
  });

  test("SerialNo rate-limit hit で早期 error", async () => {
    serialNoCheckSpy.mockImplementation(() =>
      Promise.resolve({ success: false }),
    );

    const { requestReceiptResendAction } = await importAction();
    const result = await requestReceiptResendAction(undefined, validInput());

    expect(formError(result)).toBeDefined();
    expect(domainSpy).not.toHaveBeenCalled();
  });

  test("Email rate-limit hit で早期 error", async () => {
    emailCheckSpy.mockImplementation(() =>
      Promise.resolve({ success: false, error: "email-limit" }),
    );

    const { requestReceiptResendAction } = await importAction();
    const result = await requestReceiptResendAction(undefined, validInput());

    expect(formError(result)).toBe("email-limit");
    expect(domainSpy).not.toHaveBeenCalled();
  });

  test("Turnstile fail で error", async () => {
    turnstileSpy.mockImplementation(() =>
      Promise.resolve({ success: false, error: "turnstile-error" }),
    );

    const { requestReceiptResendAction } = await importAction();
    const result = await requestReceiptResendAction(undefined, validInput());

    expect(formError(result)).toBe("turnstile-error");
    expect(domainSpy).not.toHaveBeenCalled();
  });

  test("Turnstile fail 時は SerialNo rate-limit を一度も消費しない (P1: guessable serialNo による shared bucket 枯渇対策)", async () => {
    // Turnstile より先に SerialNo バケットを消費できると、Turnstile を突破する
    // 手段を持たない第三者でも sequential な serialNo (YYYY-NNNNNN) を推測して
    // 空/不正な email で連投するだけで shared bucket (3/hour/serialNo) を
    // 枯渇させ、正規ユーザーの再送信リクエストを最大1時間締め出せてしまう
    // (PR #1428 で修正した receipt PDF rate limit と同型の P1)。
    turnstileSpy.mockImplementation(() =>
      Promise.resolve({ success: false, error: "turnstile-error" }),
    );

    const { requestReceiptResendAction } = await importAction();
    await requestReceiptResendAction(undefined, validInput());

    expect(serialNoCheckSpy).not.toHaveBeenCalled();
  });

  test("honeypot 検出で error (bot heuristics)", async () => {
    botHeuristicsSpy.mockImplementation(() => ({
      success: false,
      error: "bot-detected",
    }));

    const { requestReceiptResendAction } = await importAction();
    const result = await requestReceiptResendAction(
      undefined,
      validInput({ website: "spam" }),
    );

    expect(formError(result)).toBe("bot-detected");
    expect(domainSpy).not.toHaveBeenCalled();
  });

  test("enumeration 対策: domain が null (mismatch) でも success (null) を返し、send email は呼ばれない", async () => {
    domainSpy.mockImplementation(() => Promise.resolve(null));

    const { requestReceiptResendAction } = await importAction();
    const result = await requestReceiptResendAction(undefined, validInput());

    expect(isSuccess(result)).toBe(true);
    expect(domainSpy).toHaveBeenCalledTimes(1);
    expect(sendReceiptResendEmailSpy).not.toHaveBeenCalled();
  });

  test("Case B: domain が wasReissued=false で返すと send email が呼ばれる (previousSerialNo なし)", async () => {
    domainSpy.mockImplementation(() =>
      Promise.resolve({
        receipt: {
          id: "receipt-1",
          serialNo: SERIAL_NO,
          recipientName: "山田",
          subject: "スペース利用料として",
          amount: 8800,
          taxAmount: 800,
          taxRate: 10,
          issuedAt: new Date("2026-07-10T09:00:00Z"),
        },
        recipientEmail: CUSTOMER_EMAIL,
        wasReissued: false,
      }),
    );

    const { requestReceiptResendAction } = await importAction();
    const result = await requestReceiptResendAction(undefined, validInput());

    expect(isSuccess(result)).toBe(true);
    expect(sendReceiptResendEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendReceiptResendEmailSpy.mock.calls[0]?.[0]).toMatchObject({
      serialNo: SERIAL_NO,
      recipientEmail: CUSTOMER_EMAIL,
    });
    expect(
      (
        sendReceiptResendEmailSpy.mock.calls[0]?.[0] as {
          previousSerialNo?: string;
        }
      )?.previousSerialNo,
    ).toBeUndefined();
  });

  test("Case C: domain が wasReissued=true で返すと send email に previousSerialNo が含まれる", async () => {
    domainSpy.mockImplementation(() =>
      Promise.resolve({
        receipt: {
          id: "receipt-new",
          serialNo: NEW_SERIAL_NO,
          recipientName: "山田",
          subject: "スペース利用料として",
          amount: 8800,
          taxAmount: 800,
          taxRate: 10,
          issuedAt: new Date("2026-07-19T09:00:00Z"),
        },
        recipientEmail: CUSTOMER_EMAIL,
        previousSerialNo: SERIAL_NO,
        wasReissued: true,
      }),
    );

    const { requestReceiptResendAction } = await importAction();
    const result = await requestReceiptResendAction(undefined, validInput());

    expect(isSuccess(result)).toBe(true);
    expect(sendReceiptResendEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendReceiptResendEmailSpy.mock.calls[0]?.[0]).toMatchObject({
      serialNo: NEW_SERIAL_NO,
      previousSerialNo: SERIAL_NO,
    });
  });

  test("Zod validate 失敗 (無効な email) で error 返却 (domain 未呼出)", async () => {
    const { requestReceiptResendAction } = await importAction();
    const result = await requestReceiptResendAction(
      undefined,
      validInput({ email: "not-an-email" }),
    );

    // Zod 失敗は wrapper が handler を呼ぶ前に `submission.reply()` するので、
    // form-level ではなく **field-level**（`error.email`）に入る。
    expect(result.error?.["email"]).toBeDefined();
    expect(formError(result)).toBeUndefined();
    expect(domainSpy).not.toHaveBeenCalled();
  });
});
