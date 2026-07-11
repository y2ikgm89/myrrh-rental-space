import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import { createHash } from "node:crypto";

// send.ts の suppression 判定 (hashSuppressedEmailCandidate(normalizeEmailForIdentity(recipient)))
// と bit-for-bit 同じ hash 値を生成するテストヘルパー。
// normalizeEmailForIdentity は小文字化 + trim なので、単純 canonical (すでに小文字) は
// そのまま SHA-256 に通せば良い。
function hashForTest(canonicalEmail: string): string {
  return createHash("sha256")
    .update(canonicalEmail.trim().toLowerCase())
    .digest("hex");
}

// setTimeout をモックして backoff sleep をスキップする
// send.ts の sleep() は setTimeout を使用するため、グローバルを差し替える
const originalSetTimeout = globalThis.setTimeout;
function runImmediateSetTimeout<TArgs extends unknown[]>(
  handler: (...args: TArgs) => void,
  _timeout?: Parameters<typeof originalSetTimeout>[1],
  ...args: TArgs
): ReturnType<typeof originalSetTimeout>;
function runImmediateSetTimeout(
  handler: TimerHandler,
  _timeout?: Parameters<typeof originalSetTimeout>[1],
  ...args: unknown[]
): number;
function runImmediateSetTimeout(
  handler: TimerHandler,
  _timeout?: Parameters<typeof originalSetTimeout>[1],
  ...args: unknown[]
): number | ReturnType<typeof originalSetTimeout> {
  if (typeof handler === "function") {
    Reflect.apply(handler, undefined, args);
  }
  return originalSetTimeout(() => {}, 0);
}

const immediateSetTimeout = Object.assign(runImmediateSetTimeout, {
  __promisify__: originalSetTimeout.__promisify__,
});
let setTimeoutSpy: ReturnType<typeof spyOn<typeof globalThis, "setTimeout">>;

// 1. モック関数を先に定義（TDZ 回避）
const mockResendSend = mock<
  (
    payload: unknown,
    options?: unknown,
  ) => Promise<{
    data: { id: string } | null;
    error: { name: string; message: string } | null;
  }>
>();

const mockIsEmailEnabled = mock<() => boolean>(() => true);
const mockGetResendClient = mock<
  () => { emails: { send: typeof mockResendSend } } | null
>(() => ({ emails: { send: mockResendSend } }));
const mockGetFromAddress = mock<
  (senderEmail?: string | null, senderName?: string | null) => string
>(() => "テストサービス <noreply@example.com>");
const mockLogError = mock<
  (error: Error, context: Record<string, unknown>) => void
>(() => {});
const mockNormalizeError = mock<(e: unknown) => Error>((e: unknown) =>
  e instanceof Error ? e : new Error(String(e)),
);

type DeliverySettings = {
  sendReservationConfirmationEmail: boolean;
  notifyNewReservation: boolean;
  notifyReservationChange: boolean;
  notifyReservationCancel: boolean;
  notifyNewInquiry: boolean;
  senderEmail: string | null;
  senderName: string | null;
  replyToEmail: string | null;
};

const DELIVERY_DEFAULTS: DeliverySettings = {
  sendReservationConfirmationEmail: true,
  notifyNewReservation: true,
  notifyReservationChange: true,
  notifyReservationCancel: true,
  notifyNewInquiry: true,
  senderEmail: null,
  senderName: null,
  replyToEmail: null,
};

const mockGetEmailDeliverySettings = mock<() => Promise<DeliverySettings>>(() =>
  Promise.resolve(DELIVERY_DEFAULTS),
);

// 2. mock.module — import より前
mock.module("@/shared/lib/email/client", () => ({
  isEmailEnabled: mockIsEmailEnabled,
  getResendClient: mockGetResendClient,
  getFromAddress: mockGetFromAddress,
}));

mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: mockGetEmailDeliverySettings,
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM", LOW: "LOW" },
  logError: mockLogError,
  normalizeError: mockNormalizeError,
}));

// Resend webhook suppression check (DB lookup) のモック:
// Bun 公式 re-export pattern (...actual, override) で他の export を保ち
// `getSuppressedEmailSet` のみ module-level mock に差し替える。
// デフォルトは空 Set（= 全宛先送信許可）。suppression 検証は
// describe("suppression branch") で per-test に mockResolvedValue で切替える。
// 引数を取らない (PII cache leak fix: 引数を cache key にしないため、
// 送信側で recipient を canonical に正規化して .has() 判定する)。
const actualCustomersQueries =
  await import("@/shared/domain/customers/queries");
const mockGetSuppressedEmailSet = mock<() => Promise<Set<string>>>(() =>
  Promise.resolve(new Set()),
);
mock.module("@/shared/domain/customers/queries", () => ({
  ...actualCustomersQueries,
  getSuppressedEmailSet: mockGetSuppressedEmailSet,
}));

// 3. テスト対象 import
// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { sendEmail, hashForKey } from "@/shared/lib/email/send";

// -----------------------------------------------------------------------
// 共通テストデータ
// -----------------------------------------------------------------------
const VALID_PAYLOAD = {
  to: "customer@example.com",
  subject: "テスト件名",
  html: "<p>テスト本文</p>",
};

const BASE_PARAMS = {
  payload: VALID_PAYLOAD,
  operation: "testOperation",
};

// -----------------------------------------------------------------------
// beforeEach: モックをリセットしてデフォルト挙動を再設定
// -----------------------------------------------------------------------
beforeEach(() => {
  // setTimeout をスパイして backoff sleep を即時解決にする
  // これにより retry テストが 5 秒タイムアウトせずに完了する
  setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(
    immediateSetTimeout,
  );

  mockResendSend.mockReset();
  mockIsEmailEnabled.mockReset();
  mockGetResendClient.mockReset();
  mockLogError.mockReset();
  mockNormalizeError.mockReset();
  // suppression: デフォルトで「全宛先送信許可」（空 Set）にリセット
  mockGetSuppressedEmailSet.mockReset();
  mockGetSuppressedEmailSet.mockResolvedValue(new Set());

  // デフォルト挙動: メール有効 + クライアント存在
  // NOTE: mockResendSend のデフォルト戻り値は各テストで個別に設定する
  //       ここで設定するとリトライテストの Once 連鎖に干渉するため
  mockIsEmailEnabled.mockReturnValue(true);
  mockGetResendClient.mockReturnValue({ emails: { send: mockResendSend } });
  mockGetFromAddress.mockReturnValue("テストサービス <noreply@example.com>");
  mockGetEmailDeliverySettings.mockReset();
  mockGetEmailDeliverySettings.mockResolvedValue(DELIVERY_DEFAULTS);
  mockNormalizeError.mockImplementation((e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  );
  // 標準ケース: 送信成功（retry テストでは上書きされる）
  mockResendSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
});

afterEach(() => {
  // テスト後に setTimeout を元に戻す
  setTimeoutSpy.mockRestore();
});

// -----------------------------------------------------------------------
// sendEmail() テスト
// -----------------------------------------------------------------------

describe("sendEmail()", () => {
  describe("no-op path", () => {
    test("isEmailEnabled() が false の場合、SDK を呼ばずに { ok: false, reason: 'disabled' } を返す", async () => {
      mockIsEmailEnabled.mockReturnValue(false);

      const result = await sendEmail(BASE_PARAMS);

      expect(result).toEqual({ ok: false, reason: "disabled" });
      expect(mockResendSend).not.toHaveBeenCalled();
    });

    test("getResendClient() が null の場合、SDK を呼ばずに { ok: false, reason: 'disabled' } を返す", async () => {
      mockGetResendClient.mockReturnValue(null);

      const result = await sendEmail(BASE_PARAMS);

      expect(result).toEqual({ ok: false, reason: "disabled" });
      expect(mockResendSend).not.toHaveBeenCalled();
    });
  });

  describe("正常系", () => {
    test("idempotencyKey なしの場合、1 引数形式で resend.emails.send を呼ぶ", async () => {
      mockResendSend.mockResolvedValue({
        data: { id: "msg_test123" },
        error: null,
      });
      const result = await sendEmail(BASE_PARAMS);

      expect(result).toEqual({ ok: true, messageId: "msg_test123" });
      expect(mockResendSend).toHaveBeenCalledTimes(1);
      // 1 引数形式: 第 2 引数が undefined（オプション未渡し）
      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: VALID_PAYLOAD.to,
          subject: VALID_PAYLOAD.subject,
          html: VALID_PAYLOAD.html,
        }),
      );
      // 第 2 引数（idempotencyKey オブジェクト）は渡されない
      const calls = mockResendSend.mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0]).toHaveLength(1);
    });

    test("idempotencyKey あり の場合、2 引数形式で resend.emails.send を呼ぶ（公式推奨）", async () => {
      mockResendSend.mockResolvedValue({
        data: { id: "msg_test456" },
        error: null,
      });
      const result = await sendEmail({
        ...BASE_PARAMS,
        idempotencyKey: "reservation-confirm/reservation-1",
      });

      expect(result).toEqual({ ok: true, messageId: "msg_test456" });
      expect(mockResendSend).toHaveBeenCalledTimes(1);
      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({ to: VALID_PAYLOAD.to }),
        { idempotencyKey: "reservation-confirm/reservation-1" },
      );
    });

    test("from が getFromAddress() から payload に自動注入される", async () => {
      await sendEmail(BASE_PARAMS);

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "テストサービス <noreply@example.com>",
        }),
      );
    });

    test("成功時に { ok: true, messageId } を返す", async () => {
      mockResendSend.mockResolvedValue({
        data: { id: "test-email-id" },
        error: null,
      });

      const result = await sendEmail(BASE_PARAMS);

      expect(result).toEqual({ ok: true, messageId: "test-email-id" });
    });
  });

  describe("返信先(reply-to)注入", () => {
    test("settings.replyToEmail が payload に replyTo として注入される", async () => {
      mockGetEmailDeliverySettings.mockResolvedValue({
        ...DELIVERY_DEFAULTS,
        replyToEmail: "info@myrrh.example.com",
      });

      await sendEmail(BASE_PARAMS);

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({ replyTo: "info@myrrh.example.com" }),
      );
    });

    test("replyToEmail が未設定なら replyTo を付与しない", async () => {
      await sendEmail(BASE_PARAMS);

      const firstCall = mockResendSend.mock.calls[0];
      expect(firstCall?.[0]).not.toHaveProperty("replyTo");
    });

    test("payload が replyTo を明示していれば設定値より優先する", async () => {
      mockGetEmailDeliverySettings.mockResolvedValue({
        ...DELIVERY_DEFAULTS,
        replyToEmail: "settings@example.com",
      });

      await sendEmail({
        ...BASE_PARAMS,
        payload: { ...VALID_PAYLOAD, replyTo: "override@example.com" },
      });

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({ replyTo: "override@example.com" }),
      );
    });
  });

  describe("retry 動作", () => {
    test("rate_limit_exceeded (429) は retry 対象で maxRetries まで再試行する", async () => {
      const rateLimitError = {
        name: "rate_limit_exceeded",
        message: "Rate limit exceeded",
      };
      // Once 連鎖の干渉を防ぐためリセットしてから設定
      mockResendSend.mockReset();
      mockResendSend
        // attempt 0,1,2 で失敗 → 各 sleep + retry
        .mockResolvedValueOnce({ data: null, error: rateLimitError })
        .mockResolvedValueOnce({ data: null, error: rateLimitError })
        .mockResolvedValueOnce({ data: null, error: rateLimitError })
        // attempt 3（= maxRetries）で成功
        .mockResolvedValueOnce({ data: { id: "email-1" }, error: null });

      const result = await sendEmail({ ...BASE_PARAMS, maxRetries: 3 });

      // 4 回目で成功（attempt 0→1→2→3 の計 4 回）
      expect(result).toEqual({ ok: true, messageId: "email-1" });
      expect(mockResendSend).toHaveBeenCalledTimes(4);
    });

    test("internal_server_error (500) は retry 対象", async () => {
      const serverError = {
        name: "internal_server_error",
        message: "Internal Server Error",
      };
      mockResendSend.mockReset();
      mockResendSend
        .mockResolvedValueOnce({ data: null, error: serverError })
        .mockResolvedValueOnce({ data: { id: "email-1" }, error: null });

      const result = await sendEmail({ ...BASE_PARAMS, maxRetries: 3 });

      expect(result).toEqual({ ok: true, messageId: "email-1" });
      expect(mockResendSend).toHaveBeenCalledTimes(2);
    });

    test("application_error (500) は retry 対象", async () => {
      const appError = {
        name: "application_error",
        message: "Application Error",
      };
      mockResendSend.mockReset();
      mockResendSend
        .mockResolvedValueOnce({ data: null, error: appError })
        .mockResolvedValueOnce({ data: { id: "email-1" }, error: null });

      const result = await sendEmail({ ...BASE_PARAMS, maxRetries: 3 });

      expect(result).toEqual({ ok: true, messageId: "email-1" });
      expect(mockResendSend).toHaveBeenCalledTimes(2);
    });

    test("validation_error (422) は即時失敗で retry しない", async () => {
      const validationError = {
        name: "validation_error",
        message: "Invalid email address",
      };
      mockResendSend.mockResolvedValue({ data: null, error: validationError });

      const result = await sendEmail({ ...BASE_PARAMS, maxRetries: 3 });

      expect(result).toEqual({
        ok: false,
        reason: "error",
        error: "メール送信に失敗しました",
      });
      // retry せず 1 回だけ呼ばれる
      expect(mockResendSend).toHaveBeenCalledTimes(1);
    });

    test("invalid_api_key (401) は即時失敗で retry しない", async () => {
      const apiKeyError = {
        name: "invalid_api_key",
        message: "Invalid API key",
      };
      mockResendSend.mockResolvedValue({ data: null, error: apiKeyError });

      const result = await sendEmail({ ...BASE_PARAMS, maxRetries: 3 });

      expect(result).toEqual({
        ok: false,
        reason: "error",
        error: "メール送信に失敗しました",
      });
      expect(mockResendSend).toHaveBeenCalledTimes(1);
    });

    test("maxRetries: 0 の場合、retry 無効化（初回エラーで即失敗）", async () => {
      const rateLimitError = {
        name: "rate_limit_exceeded",
        message: "Rate limit exceeded",
      };
      mockResendSend.mockResolvedValue({ data: null, error: rateLimitError });

      const result = await sendEmail({ ...BASE_PARAMS, maxRetries: 0 });

      expect(result).toEqual({
        ok: false,
        reason: "error",
        error: "メール送信に失敗しました",
      });
      // maxRetries: 0 なので attempt=0 のみ（1 回で終了）
      expect(mockResendSend).toHaveBeenCalledTimes(1);
    });

    test("N 回目で retry が成功するパターン", async () => {
      const rateLimitError = {
        name: "rate_limit_exceeded",
        message: "Rate limit exceeded",
      };
      // attempt 0: 失敗、attempt 1: 成功
      mockResendSend.mockReset();
      mockResendSend
        .mockResolvedValueOnce({ data: null, error: rateLimitError })
        .mockResolvedValueOnce({ data: { id: "email-retry-ok" }, error: null });

      const result = await sendEmail({ ...BASE_PARAMS, maxRetries: 3 });

      expect(result).toEqual({ ok: true, messageId: "email-retry-ok" });
      expect(mockResendSend).toHaveBeenCalledTimes(2);
    });
  });

  describe("エラーハンドリング", () => {
    test("最終失敗時は固定メッセージ { ok: false, reason: 'error', error: 'メール送信に失敗しました' } を返す", async () => {
      const rateLimitError = {
        name: "rate_limit_exceeded",
        message: "Rate limit exceeded: 内部詳細情報（露出してはいけない）",
      };
      // maxRetries: 0 で即失敗
      mockResendSend.mockResolvedValue({ data: null, error: rateLimitError });

      const result = await sendEmail({ ...BASE_PARAMS, maxRetries: 0 });

      expect(result.ok).toBe(false);
      if (!result.ok && result.reason === "error") {
        expect(result.error).toBe("メール送信に失敗しました");
        // エラーの内部メッセージを露出しない
        expect(result.error).not.toContain("内部詳細情報");
      } else {
        throw new Error("Expected error result");
      }
    });

    test("logError が ErrorCategory.EXTERNAL_API / ErrorSeverity.MEDIUM で呼ばれる", async () => {
      const serverError = {
        name: "validation_error",
        message: "Bad request",
      };
      mockResendSend.mockResolvedValue({ data: null, error: serverError });

      await sendEmail({ ...BASE_PARAMS, maxRetries: 0 });

      expect(mockLogError).toHaveBeenCalledTimes(1);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          category: "EXTERNAL_API",
          severity: "MEDIUM",
        }),
      );
    });

    test("logError の context に operation が含まれる", async () => {
      const serverError = { name: "validation_error", message: "Bad request" };
      mockResendSend.mockResolvedValue({ data: null, error: serverError });

      await sendEmail({
        ...BASE_PARAMS,
        operation: "sendReservationEmail",
        maxRetries: 0,
      });

      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: expect.objectContaining({
            operation: "sendReservationEmail",
          }),
        }),
      );
    });

    test("logError の context に idempotencyKey が含まれる（指定時）", async () => {
      const serverError = { name: "validation_error", message: "Bad request" };
      mockResendSend.mockResolvedValue({ data: null, error: serverError });

      await sendEmail({
        ...BASE_PARAMS,
        idempotencyKey: "reservation-confirm/res-1",
        maxRetries: 0,
      });

      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: expect.objectContaining({
            idempotencyKey: "reservation-confirm/res-1",
          }),
        }),
      );
    });

    test("logError の context に errorName が含まれる", async () => {
      const serverError = {
        name: "validation_error",
        message: "Bad request",
      };
      mockResendSend.mockResolvedValue({ data: null, error: serverError });

      await sendEmail({ ...BASE_PARAMS, maxRetries: 0 });

      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: expect.objectContaining({
            errorName: "validation_error",
          }),
        }),
      );
    });

    test("logError の context に attempt カウンタが含まれる", async () => {
      const serverError = {
        name: "validation_error",
        message: "Bad request",
      };
      mockResendSend.mockResolvedValue({ data: null, error: serverError });

      await sendEmail({ ...BASE_PARAMS, maxRetries: 0 });

      // attempt=0 なので attempt+1=1 が context に入る
      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: expect.objectContaining({
            attempt: 1,
          }),
        }),
      );
    });

    test("追加の context オプションが logError の context にマージされる", async () => {
      const serverError = {
        name: "validation_error",
        message: "Bad request",
      };
      mockResendSend.mockResolvedValue({ data: null, error: serverError });

      await sendEmail({
        ...BASE_PARAMS,
        context: { reservationId: "res-1", customerId: "cust-1" },
        maxRetries: 0,
      });

      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: expect.objectContaining({
            reservationId: "res-1",
            customerId: "cust-1",
          }),
        }),
      );
    });

    test("SDK が throw（ネットワークエラー等）した場合も固定メッセージで失敗する", async () => {
      mockResendSend.mockImplementation(() => {
        throw new Error("ECONNREFUSED");
      });

      const result = await sendEmail(BASE_PARAMS);

      expect(result).toEqual({
        ok: false,
        reason: "error",
        error: "メール送信に失敗しました",
      });
      expect(mockLogError).toHaveBeenCalledTimes(1);
    });

    test("SDK が throw した場合も logError で ErrorCategory.EXTERNAL_API が呼ばれる", async () => {
      mockResendSend.mockImplementation(() => {
        throw new Error("Network error");
      });

      await sendEmail(BASE_PARAMS);

      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          category: "EXTERNAL_API",
          severity: "MEDIUM",
        }),
      );
    });

    test("idempotencyKey 未指定時は logError の context に idempotencyKey が含まれない", async () => {
      const serverError = {
        name: "validation_error",
        message: "Bad request",
      };
      mockResendSend.mockResolvedValue({ data: null, error: serverError });

      await sendEmail({ ...BASE_PARAMS, maxRetries: 0 });

      // idempotencyKey が含まれる場合のパターンと一致しないことを確認
      // 指定ありケースは "idempotencyKey: ... を含む context" で toHaveBeenCalledWith が通る
      // 未指定ケースは operation のみが context に存在し idempotencyKey キーが存在しない
      expect(mockLogError).toHaveBeenCalledTimes(1);
      expect(mockLogError).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          context: expect.objectContaining({
            idempotencyKey: expect.anything(),
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // suppression branch
  // -----------------------------------------------------------------------
  // PR #742 で追加した「Resend webhook 由来の HARD_BOUNCED / COMPLAINED 観測済み
  // 宛先に送信を抑止」のロジックを 6 case で網羅する。production は引数を取らない
  // `getSuppressedEmailSet()` が全 suppressed 顧客の canonical email 集合を返し、
  // 送信側で recipient を canonical に正規化して `.has()` 判定する (PII cache leak
  // fix — 引数を cache key にしない設計)。suppression set に該当する宛先が
  // 1 件でも含まれていれば送信せず { ok: false, reason: "disabled" } + logError
  // を返す（公式 Gmail Feb 2024 / Yahoo bulk sender complaint rate < 0.3% 要件
  // のアプリ層先取り）。
  describe("suppression branch", () => {
    test("1 recipient HARD_BOUNCED なら送信せず disabled + logError 1 回", async () => {
      // Set は canonical email の SHA-256 hash を格納する契約 (queries.ts)。
      // 送信側で recipient を hash して .has() 判定する。
      mockGetSuppressedEmailSet.mockResolvedValue(
        new Set([hashForTest("customer@example.com")]),
      );

      const result = await sendEmail(BASE_PARAMS);

      expect(result).toEqual({ ok: false, reason: "disabled" });
      expect(mockResendSend).not.toHaveBeenCalled();
      expect(mockLogError).toHaveBeenCalledTimes(1);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          category: "EXTERNAL_API",
          severity: "LOW",
          context: expect.objectContaining({
            operation: "testOperation",
            recipient: "customer@example.com",
          }),
        }),
      );
    });

    test("1 recipient COMPLAINED なら送信せず disabled + logError 1 回", async () => {
      // domain query 側で HARD_BOUNCED / COMPLAINED の両方が Set に入って返る
      // 仕様なので、test は「Set に入っているか」のみ確認すれば良い。
      // Set は canonical email の SHA-256 hash を格納する契約 (queries.ts)。
      // 送信側で recipient を hash して .has() 判定する。
      mockGetSuppressedEmailSet.mockResolvedValue(
        new Set([hashForTest("customer@example.com")]),
      );

      const result = await sendEmail(BASE_PARAMS);

      expect(result).toEqual({ ok: false, reason: "disabled" });
      expect(mockResendSend).not.toHaveBeenCalled();
      expect(mockLogError).toHaveBeenCalledTimes(1);
    });

    test("SOFT_BOUNCED 相当（suppression set に含まれない）は送信続行", async () => {
      // SOFT_BOUNCED は domain query 側で suppression set に含めない仕様。
      // test では「Set が空 = 送信許可」のケースとして等価に扱う。
      mockGetSuppressedEmailSet.mockResolvedValue(new Set());

      const result = await sendEmail(BASE_PARAMS);

      expect(result).toEqual({ ok: true, messageId: "email-1" });
      expect(mockResendSend).toHaveBeenCalledTimes(1);
      expect(mockLogError).not.toHaveBeenCalled();
    });

    test("DB 未登録（unknown 宛先）は送信続行", async () => {
      // staff / system / inquiry guest 等 Customer レコードなしの宛先は
      // findMany で行が返らず Set に含まれない。
      mockGetSuppressedEmailSet.mockResolvedValue(new Set());

      const result = await sendEmail(BASE_PARAMS);

      expect(result).toEqual({ ok: true, messageId: "email-1" });
      expect(mockResendSend).toHaveBeenCalledTimes(1);
    });

    test("複数宛先のうち 1 件のみ HARD_BOUNCED でも全送信を抑止 + logError", async () => {
      mockGetSuppressedEmailSet.mockResolvedValue(
        new Set([hashForTest("b@example.com")]),
      );

      const result = await sendEmail({
        ...BASE_PARAMS,
        payload: {
          ...VALID_PAYLOAD,
          to: ["a@example.com", "b@example.com", "c@example.com"],
        },
      });

      expect(result).toEqual({ ok: false, reason: "disabled" });
      expect(mockResendSend).not.toHaveBeenCalled();
      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: expect.objectContaining({
            recipient: "b@example.com",
          }),
        }),
      );
      // 引数なし版なので getSuppressedEmailSet は 1 回だけ、no-arg で呼ばれる
      // （per-recipient N×round-trip でないことの回帰防止 + 引数を cache key に
      // しない PII cache leak fix の回帰防止）
      expect(mockGetSuppressedEmailSet).toHaveBeenCalledTimes(1);
      expect(mockGetSuppressedEmailSet).toHaveBeenCalledWith();
    });

    test("複数宛先が全て OK なら送信続行", async () => {
      mockGetSuppressedEmailSet.mockResolvedValue(new Set());

      const result = await sendEmail({
        ...BASE_PARAMS,
        payload: {
          ...VALID_PAYLOAD,
          to: ["a@example.com", "b@example.com", "c@example.com"],
        },
      });

      expect(result).toEqual({ ok: true, messageId: "email-1" });
      expect(mockResendSend).toHaveBeenCalledTimes(1);
      expect(mockLogError).not.toHaveBeenCalled();
    });
  });
});

// -----------------------------------------------------------------------
// hashForKey() テスト
// -----------------------------------------------------------------------

describe("hashForKey()", () => {
  describe("決定論性", () => {
    test("同じ入力で常に同じ出力を返す", () => {
      const input = "reservation-confirm/reservation-abc123";
      const hash1 = hashForKey(input);
      const hash2 = hashForKey(input);
      expect(hash1).toBe(hash2);
    });

    test("異なる入力では異なる出力を返す", () => {
      const hash1 = hashForKey("reservation-confirm/res-1");
      const hash2 = hashForKey("reservation-confirm/res-2");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("出力長", () => {
    test("出力長は 32 文字（sha256 hex の先頭 32 文字）", () => {
      const hash = hashForKey("some input");
      expect(hash).toHaveLength(32);
    });

    test("空文字列入力でも 32 文字の有効なハッシュを返す", () => {
      const hash = hashForKey("");
      expect(hash).toHaveLength(32);
      // 16進数のみで構成される
      expect(hash).toMatch(/^[0-9a-f]{32}$/);
    });

    test("長大文字列（300+ 文字 URL）でも 32 文字に正規化される", () => {
      const longUrl =
        "https://example.com/reset?token=" + "a".repeat(280) + "&userId=123";
      expect(longUrl.length).toBeGreaterThan(256);

      const hash = hashForKey(longUrl);
      expect(hash).toHaveLength(32);
    });
  });

  describe("特殊入力", () => {
    test("Unicode / 日本語を含む入力でも安定動作する", () => {
      const input = "スペース名：会議室A / 予約ID：12345#セクション";
      const hash = hashForKey(input);
      expect(hash).toHaveLength(32);
      expect(hash).toMatch(/^[0-9a-f]{32}$/);
    });

    test("/ を含む入力でも安定動作する（idempotency key 形式）", () => {
      const input = "reservation-confirm/reservation-uuid-1234";
      const hash = hashForKey(input);
      expect(hash).toHaveLength(32);
      expect(hash).toMatch(/^[0-9a-f]{32}$/);
    });

    test("# を含む入力でも安定動作する", () => {
      const input = "https://example.com/page#anchor";
      const hash = hashForKey(input);
      expect(hash).toHaveLength(32);
      expect(hash).toMatch(/^[0-9a-f]{32}$/);
    });

    test("メールアドレスを含む入力でも安定動作する（配信先ごとの idempotency key 用途）", () => {
      const email = "customer+test@example.co.jp";
      const hash = hashForKey(email);
      expect(hash).toHaveLength(32);
      expect(hash).toMatch(/^[0-9a-f]{32}$/);
    });

    test("同一内容・異なる表現の文字列は異なるハッシュを返す", () => {
      const hash1 = hashForKey("reservation-confirm/res-1");
      // スペースを追加した場合
      const hash2 = hashForKey("reservation-confirm/res-1 ");
      expect(hash1).not.toBe(hash2);
    });
  });
});
