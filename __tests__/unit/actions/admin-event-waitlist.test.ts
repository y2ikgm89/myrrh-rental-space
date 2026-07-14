import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";
import { isMutationError } from "@/shared/lib/mutation-result";

const mockExecuteAdminMutationResult = mock();
const mockAdminPromoteWaitlistEntryCommand = mock();
const mockExpireWaitlistOfferCommand = mock();
const mockCreateAuditLogRecord = mock(async () => undefined);
const mockGetEventWaitlistOfferPaymentContext = mock();
const mockSendEventWaitlistOffered = mock(async () => ({ ok: true }) as const);
const mockSendEventWaitlistExpired = mock(async () => ({ ok: true }) as const);

mock.module("server-only", () => ({}));

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: (
    ...args: Parameters<typeof mockExecuteAdminMutationResult>
  ) => mockExecuteAdminMutationResult(...args),
}));

mock.module("@/shared/domain/events/waitlist-commands", () => ({
  adminPromoteWaitlistEntryCommand: (
    ...args: Parameters<typeof mockAdminPromoteWaitlistEntryCommand>
  ) => mockAdminPromoteWaitlistEntryCommand(...args),
  expireWaitlistOfferCommand: (
    ...args: Parameters<typeof mockExpireWaitlistOfferCommand>
  ) => mockExpireWaitlistOfferCommand(...args),
}));

mock.module("@/shared/domain/events/waitlist-queries", () => ({
  getEventWaitlistOfferPaymentContext: (
    ...args: Parameters<typeof mockGetEventWaitlistOfferPaymentContext>
  ) => mockGetEventWaitlistOfferPaymentContext(...args),
}));

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (
    ...args: Parameters<typeof mockCreateAuditLogRecord>
  ) => mockCreateAuditLogRecord(...args),
}));

mock.module("@/shared/lib/email/event-waitlist-emails", () => ({
  sendEventWaitlistOffered: (
    ...args: Parameters<typeof mockSendEventWaitlistOffered>
  ) => mockSendEventWaitlistOffered(...args),
  sendEventWaitlistExpired: (
    ...args: Parameters<typeof mockSendEventWaitlistExpired>
  ) => mockSendEventWaitlistExpired(...args),
}));

// fireAndForget は本来 await しない設計だが、テストでは afterSuccess 内で発火された
// 副作用 Promise を捕まえて明示的に await できるよう、実行開始済みの Promise を
// 配列に積むだけの stub に差し替える（admin-event-registration.test.ts と同型）。
const firedPromises: Promise<unknown>[] = [];
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    firedPromises.push(promise.catch(() => undefined));
  },
}));

const { adminPromoteWaitlistEntryAction, adminExpireWaitlistOfferAction } =
  await import("@/admin/actions/event-waitlist");

const registrationId = "cm0reg12345678901234567";
const now = new Date("2026-07-14T00:00:00.000Z");
const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

describe("admin event waitlist actions", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockReset();
    mockAdminPromoteWaitlistEntryCommand.mockReset();
    mockExpireWaitlistOfferCommand.mockReset();
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
    mockGetEventWaitlistOfferPaymentContext.mockReset();
    mockSendEventWaitlistOffered.mockReset();
    mockSendEventWaitlistOffered.mockResolvedValue({ ok: true });
    mockSendEventWaitlistExpired.mockReset();
    mockSendEventWaitlistExpired.mockResolvedValue({ ok: true });
    firedPromises.length = 0;
  });

  test("繰り上げ当選: WAITLISTED 対象は成功し resource:event / action:update で mutation を呼ぶ", async () => {
    mockAdminPromoteWaitlistEntryCommand.mockResolvedValue({
      promoted: {
        id: registrationId,
        email: "waiting@example.com",
        offeredAt: now,
        expiresAt,
      },
      alreadyOffered: false,
    });
    mockGetEventWaitlistOfferPaymentContext.mockResolvedValue({
      kind: "free",
      confirmUrl: "https://example.com/events/waitlist/confirm?token=t",
    });
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      const data = await options.execute({ id: "admin-1" });
      await options.afterSuccess?.(data);
      return data;
    });

    const result = await adminPromoteWaitlistEntryAction(registrationId);
    await Promise.allSettled(firedPromises);

    expect(isMutationError(result)).toBe(false);
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "event",
        action: "update",
        resourceId: registrationId,
      }),
    );
    expect(mockAdminPromoteWaitlistEntryCommand).toHaveBeenCalledWith(
      expect.objectContaining({ registrationId }),
    );

    // AuditLog: event-registration リソースへ旧値/新値/actor 付きで記録される
    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin-1",
        action: "UPDATE",
        resource: "event-registration",
        resourceId: registrationId,
        metadata: expect.objectContaining({
          registrationId,
          previousStatus: "WAITLISTED",
          newStatus: "WAITLISTED_OFFERED",
          actorUserId: "admin-1",
        }),
      }),
    );

    // 繰り上げ当選メールが送信される
    expect(mockSendEventWaitlistOffered).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId,
        to: "waiting@example.com",
        expiresAt,
      }),
    );
  });

  test("繰り上げ当選: 既に WAITLISTED_OFFERED（冪等 no-op）は AuditLog もメールも重複させない", async () => {
    mockAdminPromoteWaitlistEntryCommand.mockResolvedValue({
      promoted: {
        id: registrationId,
        email: "waiting@example.com",
        offeredAt: now,
        expiresAt,
      },
      alreadyOffered: true,
    });
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      const data = await options.execute({ id: "admin-1" });
      await options.afterSuccess?.(data);
      return data;
    });

    const result = await adminPromoteWaitlistEntryAction(registrationId);
    await Promise.allSettled(firedPromises);

    expect(isMutationError(result)).toBe(false);
    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
    expect(mockSendEventWaitlistOffered).not.toHaveBeenCalled();
  });

  test("繰り上げ当選: WAITLISTED でない場合は CONFLICT を返す", async () => {
    mockAdminPromoteWaitlistEntryCommand.mockRejectedValue(
      new DomainError("この申込はキャンセル待ち状態ではありません", "CONFLICT"),
    );
    // executeAdminMutationResult 自体を mock しているため実装の catch は通らない。
    // 実装 (admin-action.ts) と同じ DomainError → MutationError 変換を再現し、
    // action 層が DomainError を握りつぶさず正しく伝播することを検証する。
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      try {
        return await options.execute({ id: "admin-1" });
      } catch (error) {
        if (error instanceof DomainError) {
          return { error: error.message, code: error.code };
        }
        throw error;
      }
    });

    const result = await adminPromoteWaitlistEntryAction(registrationId);

    expect(isMutationError(result)).toBe(true);
    if (isMutationError(result)) {
      expect(result.code).toBe("CONFLICT");
    }
    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
    expect(mockSendEventWaitlistOffered).not.toHaveBeenCalled();
  });

  test("期限切れ: WAITLISTED_OFFERED 対象は成功し resource:event / action:update で mutation を呼ぶ", async () => {
    mockExpireWaitlistOfferCommand.mockResolvedValue({
      registration: {
        id: registrationId,
        status: "EXPIRED",
        email: "waiting@example.com",
        name: "山田太郎",
      },
    });
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      const data = await options.execute({ id: "admin-1" });
      await options.afterSuccess?.(data);
      return data;
    });

    const result = await adminExpireWaitlistOfferAction(registrationId);
    await Promise.allSettled(firedPromises);

    expect(isMutationError(result)).toBe(false);
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "event",
        action: "update",
        resourceId: registrationId,
      }),
    );
    expect(mockExpireWaitlistOfferCommand).toHaveBeenCalledWith(
      expect.objectContaining({ registrationId }),
    );

    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin-1",
        action: "UPDATE",
        resource: "event-registration",
        resourceId: registrationId,
        metadata: expect.objectContaining({
          registrationId,
          previousStatus: "WAITLISTED_OFFERED",
          newStatus: "EXPIRED",
          actorUserId: "admin-1",
        }),
      }),
    );

    expect(mockSendEventWaitlistExpired).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId,
        to: "waiting@example.com",
      }),
    );
  });

  test("期限切れ: 対象が既に OFFERED でない（冪等 no-op）は AuditLog もメールも書かない", async () => {
    mockExpireWaitlistOfferCommand.mockResolvedValue({ registration: null });
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      const data = await options.execute({ id: "admin-1" });
      await options.afterSuccess?.(data);
      return data;
    });

    const result = await adminExpireWaitlistOfferAction(registrationId);
    await Promise.allSettled(firedPromises);

    expect(isMutationError(result)).toBe(false);
    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
    expect(mockSendEventWaitlistExpired).not.toHaveBeenCalled();
  });

  test("不正な registrationId はドメイン層を呼ばず VALIDATION エラーを返す", async () => {
    const result = await adminPromoteWaitlistEntryAction("not-a-cuid");

    expect(isMutationError(result)).toBe(true);
    if (isMutationError(result)) {
      expect(result.code).toBe("VALIDATION");
    }
    expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    expect(mockAdminPromoteWaitlistEntryCommand).not.toHaveBeenCalled();
  });
});
