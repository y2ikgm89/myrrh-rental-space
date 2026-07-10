/**
 * updateSpaceCommand の拠点(Location)変更時のsmartLockDeviceIdリセットのテスト。
 *
 * スペースの拠点が変わると、既存のsmartLockDeviceIdは旧拠点のデバイスを指したままに
 * なり、issueSmartLockPasscodesが誤った物理ドアへパスコードを発行し続けてしまう
 * （Codexレビュー指摘 P2, PR#927）。拠点変更時はnullへリセットされることを検証する。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockFindUniqueSpace = mock<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve(null),
);
const mockUpdateSpace = mock<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve({ id: "space-1", slug: "space-slug" }),
);
const mockFindFirstLocation = mock<(...args: unknown[]) => Promise<unknown>>(
  () => Promise.resolve(null),
);
const mockFindFirstCategory = mock<(...args: unknown[]) => Promise<unknown>>(
  () => Promise.resolve(null),
);

const txStub = {
  space: {
    findUnique: (...args: unknown[]) => Promise.resolve({ slug: "old-slug" }),
    update: (...args: unknown[]) => mockUpdateSpace(...args),
  },
};

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: {
      findUnique: (...args: unknown[]) => mockFindUniqueSpace(...args),
    },
    location: {
      findFirst: (...args: unknown[]) => mockFindFirstLocation(...args),
    },
    spaceCategory: {
      findFirst: (...args: unknown[]) => mockFindFirstCategory(...args),
    },
    $transaction: (fn: (tx: typeof txStub) => Promise<unknown>) => fn(txStub),
  },
}));

mock.module("@/shared/domain/media/managed-image-assertions", () => ({
  assertAllowedManagedGallery: () => undefined,
  assertAllowedManagedImageSourcesInJson: () => undefined,
  assertAllowedManagedImageUrl: () => undefined,
  assertAllowedManagedImageUrls: () => undefined,
}));

mock.module("@/shared/lib/slug-validation", () => ({
  checkSlugAvailability: () => Promise.resolve({ available: true }),
  getSlugErrorMessage: () => "スラッグが使用できません",
}));

const { updateSpaceCommand } = await import("@/shared/domain/spaces/commands");

const SPACE_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const LOCATION_A = "location-a";
const LOCATION_B = "location-b";
const DEVICE_ID = "device-1";

function baseInput(locationId: string) {
  return {
    slug: "space-slug",
    name: "テストスペース",
    descriptionJson: {},
    descriptionHtml: "<p></p>",
    descriptionPlainText: "",
    capacity: 4,
    hourlyPrice: 1000,
    mainImageUrl: "https://example.com/image.jpg",
    gallery: [],
    facilities: [],
    isPublished: false,
    reviewsEnabled: false,
    locationId,
    categoryId: null,
  };
}

beforeEach(() => {
  mockFindUniqueSpace.mockReset();
  mockUpdateSpace.mockReset();
  mockFindFirstLocation.mockReset();
  mockFindFirstCategory.mockReset();

  mockUpdateSpace.mockResolvedValue({ id: SPACE_ID, slug: "space-slug" });
  mockFindFirstLocation.mockResolvedValue({
    id: LOCATION_B,
    defaultSmartLockDeviceId: null,
  });
});

describe("updateSpaceCommand - 拠点変更時のsmartLockDeviceIdリセット", () => {
  test("拠点が変わらない場合、smartLockDeviceIdはupdateデータに含まれない（既存値を維持）", async () => {
    mockFindUniqueSpace.mockResolvedValue({
      id: SPACE_ID,
      isPublished: false,
      publishedAt: null,
      locationId: LOCATION_A,
      smartLockDeviceId: DEVICE_ID,
    });

    await updateSpaceCommand(SPACE_ID, baseInput(LOCATION_A));

    const call = mockUpdateSpace.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(Object.hasOwn(call.data, "smartLockDeviceId")).toBe(false);
  });

  test("拠点が変わる場合、smartLockDeviceIdはnullにリセットされる", async () => {
    mockFindUniqueSpace.mockResolvedValue({
      id: SPACE_ID,
      isPublished: false,
      publishedAt: null,
      locationId: LOCATION_A,
      smartLockDeviceId: DEVICE_ID,
    });

    await updateSpaceCommand(SPACE_ID, baseInput(LOCATION_B));

    const call = mockUpdateSpace.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data["smartLockDeviceId"]).toBeNull();
  });

  test("元々smartLockDeviceIdが未設定で拠点が変わる場合もnullを明示する", async () => {
    mockFindUniqueSpace.mockResolvedValue({
      id: SPACE_ID,
      isPublished: false,
      publishedAt: null,
      locationId: LOCATION_A,
      smartLockDeviceId: null,
    });

    await updateSpaceCommand(SPACE_ID, baseInput(LOCATION_B));

    const call = mockUpdateSpace.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data["smartLockDeviceId"]).toBeNull();
  });
});
