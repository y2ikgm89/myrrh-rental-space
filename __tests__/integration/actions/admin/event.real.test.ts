/**
 * Event Server Action 実呼出し統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/event.ts のうち
 * id-only mutation (deleteEvent / publishEvent / duplicateEvent / cancelEvent
 * / archiveEvent) を実 import して呼び出し、executeAdminMutationResult を
 * mock.module で差替えた本物のカバレッジを確保する。
 *
 * conform 系 (createEventAction / updateEventAction) は別レイヤ (event-bulk)
 * と同等で event-bulk.test.ts が既存実装済。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

const mockDeleteEventCommand = mock<(id: string) => Promise<void>>(() =>
  Promise.resolve(),
);
const mockPublishEventCommand = mock<(id: string) => Promise<void>>(() =>
  Promise.resolve(),
);
const mockCancelEventCommand = mock<(id: string) => Promise<void>>(() =>
  Promise.resolve(),
);
const mockArchiveEventCommand = mock<(id: string) => Promise<void>>(() =>
  Promise.resolve(),
);
const mockDuplicateEventCommand = mock<
  (id: string) => Promise<{ id: string; slug: string }>
>(() => Promise.resolve({ id: "dup-id", slug: "dup-slug" }));
const mockCreateEventCommand = mock(() =>
  Promise.resolve({ id: "x", slug: "y" }),
);
const mockUpdateEventCommand = mock(() => Promise.resolve());

mock.module("@/shared/domain/events/commands", () => ({
  createEventCommand: mockCreateEventCommand,
  updateEventCommand: mockUpdateEventCommand,
  deleteEventCommand: mockDeleteEventCommand,
  publishEventCommand: mockPublishEventCommand,
  cancelEventCommand: mockCancelEventCommand,
  archiveEventCommand: mockArchiveEventCommand,
  duplicateEventCommand: mockDuplicateEventCommand,
}));

mock.module("@/shared/domain/events/admin-queries", () => ({
  getEventById: mock(async () => ({
    id: "evt",
    slug: "slug",
    googleCalendarEventId: null,
  })),
}));

mock.module("@/shared/domain/events/calendar-sync", () => ({
  getEventForCalendarSync: mock(async () => null),
}));

mock.module("@/shared/lib/calendar-sync/event-outbound", () => ({
  syncEventToCalendar: mock(async () => {}),
  updateEventCalendarSync: mock(async () => {}),
  deleteEventCalendarSync: mock(async () => {}),
}));

mock.module("@/shared/lib/cache/event-cache", () => ({
  invalidateEventCaches: mock(() => {}),
}));

mock.module("@/shared/lib/cache", () => ({
  invalidateSiteWideCache: mock(() => {}),
  purgeMarketingHomeTag: mock(() => {}),
  firePurgeAsync: mock(() => {}),
}));

mock.module("@/shared/lib/cloudflare", () => ({
  purgeCloudflareDetailUrls: mock(async () => ({ success: true })),
  purgeCloudflareCache: mock(async () => ({ success: true })),
  purgeAllCloudflareCache: mock(async () => ({ success: true })),
  purgeCloudflareByPaths: mock(async () => ({ success: true })),
  purgeCloudflareCacheByTags: mock(async () => ({ success: true })),
  callPurgeApiPublic: mock(async () => ({ success: true })),
  getCloudflareCredentialsValidated: mock(() => null),
  setCloudflareTagPurgeEnabled: mock(() => {}),
  isCloudflareTagPurgeEnabled: mock(() => true),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mock(() => {}),
}));

mock.module("next/cache", () => ({
  updateTag: mock(() => {}),
  revalidateTag: mock(() => {}),
  cacheLife: mock(() => {}),
  cacheTag: mock(() => {}),
}));

type ExecuteOpts<T> = {
  resource: string;
  action: string;
  resourceId?: string;
  execute: (user: { id: string; role: string }) => Promise<T>;
  afterSuccess?: (data: T) => void | Promise<void>;
  resolveAuditResourceId?: (data: T) => string | undefined;
};

const mockExecuteAdminMutationResult = mock<
  <T>(opts: ExecuteOpts<T>) => Promise<T | { error: string }>
>(async <T>(opts: ExecuteOpts<T>) => {
  const data = await opts.execute({ id: "admin", role: "ADMIN" });
  if (opts.afterSuccess) await opts.afterSuccess(data);
  return data;
});

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mockExecuteAdminMutationResult,
}));

const { deleteEvent, publishEvent, duplicateEvent, cancelEvent, archiveEvent } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event");
const { isMutationError } = await import("@/shared/lib/mutation-result");

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("deleteEvent (real)", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockDeleteEventCommand.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await deleteEvent("not-uuid");
    expect(isMutationError(r)).toBe(true);
    expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
  });

  test("正常系: resource=event, action=delete", async () => {
    await deleteEvent(VALID_UUID);
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "event",
        action: "delete",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockDeleteEventCommand).toHaveBeenCalledWith(VALID_UUID);
  });
});

describe("publishEvent (real)", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockPublishEventCommand.mockClear();
  });

  test("正常系: resource=event, action=publish", async () => {
    await publishEvent(VALID_UUID);
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "event", action: "publish" }),
    );
    expect(mockPublishEventCommand).toHaveBeenCalledWith(VALID_UUID);
  });
});

describe("duplicateEvent (real)", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockDuplicateEventCommand.mockClear();
  });

  test("正常系: resource=event, action=create", async () => {
    mockDuplicateEventCommand.mockResolvedValueOnce({
      id: "dup",
      slug: "dup-slug",
    });
    await duplicateEvent(VALID_UUID);
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "event", action: "create" }),
    );
  });
});

describe("cancelEvent (real)", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockCancelEventCommand.mockClear();
  });

  test("正常系: resource=event, action=update", async () => {
    await cancelEvent(VALID_UUID);
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "event", action: "update" }),
    );
    expect(mockCancelEventCommand).toHaveBeenCalledWith(VALID_UUID);
  });
});

describe("archiveEvent (real)", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockArchiveEventCommand.mockClear();
  });

  test("正常系: resource=event, action=update", async () => {
    await archiveEvent(VALID_UUID);
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "event", action: "update" }),
    );
    expect(mockArchiveEventCommand).toHaveBeenCalledWith(VALID_UUID);
  });
});
