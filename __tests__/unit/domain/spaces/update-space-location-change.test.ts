/**
 * updateSpaceCommand の拠点(Location)変更時のsmartLockDeviceIdリセットのテスト。
 *
 * スペースの拠点が変わると、既存のsmartLockDeviceIdは旧拠点のデバイスを指したままに
 * なり、issueSmartLockPasscodesが誤った物理ドアへパスコードを発行し続けてしまう
 * （Codexレビュー指摘 P2, PR#927）。拠点変更時はnullへリセットされることを検証する。
 *
 * isLocationChanging はトランザクション内で読み直した locationId（txStub 側）を基準に
 * 判定する（トランザクション開始前の読み取りに基づくと同時編集レースに弱いという
 * Codexレビュー指摘 P2, PR#928 への対応）。そのためテストのシナリオ分岐は
 * txStub.space.findUnique が返す locationId で表現する。
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

let txFindUniqueResult: { slug: string; locationId: string } = {
  slug: "old-slug",
  locationId: "location-a",
};

const txStub = {
  $executeRaw: (..._args: unknown[]) => Promise.resolve(undefined),
  space: {
    findUnique: (...args: unknown[]) => Promise.resolve(txFindUniqueResult),
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
  txFindUniqueResult = { slug: "old-slug", locationId: LOCATION_A };
});

describe("updateSpaceCommand - 拠点変更時のsmartLockDeviceIdリセット", () => {
  test("拠点が変わらない場合、smartLockDeviceIdはupdateデータに含まれない（既存値を維持）", async () => {
    mockFindUniqueSpace.mockResolvedValue({
      id: SPACE_ID,
      isPublished: false,
      publishedAt: null,
    });
    txFindUniqueResult = { slug: "old-slug", locationId: LOCATION_A };

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
    });
    txFindUniqueResult = { slug: "old-slug", locationId: LOCATION_A };

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
    });
    txFindUniqueResult = { slug: "old-slug", locationId: LOCATION_A };

    await updateSpaceCommand(SPACE_ID, baseInput(LOCATION_B));

    const call = mockUpdateSpace.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data["smartLockDeviceId"]).toBeNull();
  });

  test("トランザクション開始前の読み取り後に拠点が変更されていた場合、トランザクション内の最新値で判定する（TOCTOU対策）", async () => {
    // ensureSpaceExists (トランザクション開始前の読み取り) はまだ旧拠点を返すが、
    // その後トランザクション内で読み直すと、別の同時実行によって既に
    // LOCATION_B へ変更済みだったケース。
    mockFindUniqueSpace.mockResolvedValue({
      id: SPACE_ID,
      isPublished: false,
      publishedAt: null,
    });
    txFindUniqueResult = { slug: "old-slug", locationId: LOCATION_B };

    // 管理者は自分が開いた古いフォームの値(LOCATION_A、変更なしのつもり)のまま送信する。
    await updateSpaceCommand(SPACE_ID, baseInput(LOCATION_A));

    const call = mockUpdateSpace.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data["smartLockDeviceId"]).toBeNull();
  });
});
