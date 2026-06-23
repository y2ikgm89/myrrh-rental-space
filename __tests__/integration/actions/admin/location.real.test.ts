/**
 * Location Server Action 実呼出し統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/location.ts の
 * updateLocationPublished / updateLocationOrder / deleteLocation を
 * 実 import で呼び出す。
 *
 * conform 系 (createLocationAction / updateLocationAction) は後続タスクで分離。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

const mockUpdatePublished = mock<
  (
    id: string,
    isPublished: boolean,
  ) => Promise<{ id: string; isPublished: boolean }>
>((id, isPublished) => Promise.resolve({ id, isPublished }));
const mockUpdateOrder = mock<
  (items: { id: string; sortOrder: number }[]) => Promise<{ updated: number }>
>((items) => Promise.resolve({ updated: items.length }));
const mockDeleteLocation = mock<(id: string) => Promise<{ id: string }>>((id) =>
  Promise.resolve({ id }),
);

mock.module("@/shared/domain/locations/commands", () => ({
  createLocation: mock(async () => ({ id: "x" })),
  updateLocation: mock(async () => ({ id: "x" })),
  deleteLocation: mockDeleteLocation,
  updateLocationOrder: mockUpdateOrder,
  updateLocationPublished: mockUpdatePublished,
}));

mock.module("@/shared/domain/locations/gbp-sync-commands", () => ({
  syncLocationToGbpCommand: mock(async () => {}),
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

const mockExecute = mock<
  <T>(opts: ExecuteOpts<T>) => Promise<T | { error: string }>
>(async <T>(opts: ExecuteOpts<T>) => {
  const data = await opts.execute({ id: "admin", role: "ADMIN" });
  if (opts.afterSuccess) await opts.afterSuccess(data);
  return data;
});

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mockExecute,
}));

const { updateLocationPublished, updateLocationOrder, deleteLocation } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/location");
const { isMutationError } = await import("@/shared/lib/mutation-result");

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_B = "22222222-2222-4222-8222-222222222222";

describe("updateLocationPublished (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockUpdatePublished.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await updateLocationPublished("bad", true);
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: resource=location, action=publish", async () => {
    await updateLocationPublished(VALID_UUID, true);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "location",
        action: "publish",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockUpdatePublished).toHaveBeenCalledWith(VALID_UUID, true);
  });
});

describe("updateLocationOrder (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockUpdateOrder.mockClear();
  });

  test("重複 id は validation error", async () => {
    const r = await updateLocationOrder([
      { id: VALID_UUID, sortOrder: 0 },
      { id: VALID_UUID, sortOrder: 1 },
    ]);
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: resource=location, action=update", async () => {
    const items = [
      { id: VALID_UUID, sortOrder: 0 },
      { id: VALID_UUID_B, sortOrder: 1 },
    ];
    const result = await updateLocationOrder(items);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "location",
        action: "update",
      }),
    );
    expect(mockUpdateOrder).toHaveBeenCalledWith(items);
    expect(result).toEqual({ updated: 2 });
  });
});

describe("deleteLocation (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockDeleteLocation.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await deleteLocation("bad");
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: resource=location, action=delete", async () => {
    await deleteLocation(VALID_UUID);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "location",
        action: "delete",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockDeleteLocation).toHaveBeenCalledWith(VALID_UUID);
  });
});
