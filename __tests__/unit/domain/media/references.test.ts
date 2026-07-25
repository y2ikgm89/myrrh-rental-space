import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

const mockPostFindFirst = mock<() => Promise<Record<string, unknown> | null>>(
  () => Promise.resolve(null),
);
const mockNewsFindFirst = mock<() => Promise<Record<string, unknown> | null>>(
  () => Promise.resolve(null),
);
const mockSpaceFindFirst = mock<() => Promise<Record<string, unknown> | null>>(
  () => Promise.resolve(null),
);
const mockEventFindFirst = mock<() => Promise<Record<string, unknown> | null>>(
  () => Promise.resolve(null),
);
const mockSectionFindFirst = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockSettingsSeoFindFirst = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockTermsFindFirst = mock<() => Promise<Record<string, unknown> | null>>(
  () => Promise.resolve(null),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    post: { findFirst: mockPostFindFirst },
    news: { findFirst: mockNewsFindFirst },
    space: { findFirst: mockSpaceFindFirst },
    event: { findFirst: mockEventFindFirst },
    section: { findFirst: mockSectionFindFirst },
    settingsSeo: { findFirst: mockSettingsSeoFindFirst },
    termsDocument: { findFirst: mockTermsFindFirst },
  },
}));

const { findMediaUrlUsages, assertMediaUrlNotInUse } =
  await import("@/shared/domain/media/references");

const MEDIA_URL = "https://media.example.com/media/hero.jpg";

describe("findMediaUrlUsages", () => {
  beforeEach(() => {
    mockPostFindFirst.mockReset();
    mockNewsFindFirst.mockReset();
    mockSpaceFindFirst.mockReset();
    mockEventFindFirst.mockReset();
    mockSectionFindFirst.mockReset();
    mockSettingsSeoFindFirst.mockReset();
    mockTermsFindFirst.mockReset();

    mockPostFindFirst.mockResolvedValue(null);
    mockNewsFindFirst.mockResolvedValue(null);
    mockSpaceFindFirst.mockResolvedValue(null);
    mockEventFindFirst.mockResolvedValue(null);
    mockSectionFindFirst.mockResolvedValue(null);
    mockSettingsSeoFindFirst.mockResolvedValue(null);
    mockTermsFindFirst.mockResolvedValue(null);
  });

  test("空文字は空配列を返す", async () => {
    await expect(findMediaUrlUsages("")).resolves.toEqual([]);
    expect(mockPostFindFirst).not.toHaveBeenCalled();
  });

  test("参照なしは空配列", async () => {
    await expect(findMediaUrlUsages(MEDIA_URL)).resolves.toEqual([]);
  });

  test("投稿・スペース・セクションのラベルを返す", async () => {
    mockPostFindFirst
      .mockResolvedValueOnce({ slug: "hello-post" })
      .mockResolvedValueOnce(null);
    mockSpaceFindFirst
      .mockResolvedValueOnce({ name: "Studio A" })
      .mockResolvedValueOnce(null);
    mockSectionFindFirst.mockResolvedValueOnce({ id: "sec-1" });

    const labels = await findMediaUrlUsages(MEDIA_URL);

    expect(labels).toContain("投稿: hello-post");
    expect(labels).toContain("スペース: Studio A");
    expect(labels).toContain("セクション");
  });

  test("ラベルは最大 5 件に制限される", async () => {
    mockPostFindFirst
      .mockResolvedValueOnce({ slug: "p1" })
      .mockResolvedValueOnce({ slug: "p2" });
    mockNewsFindFirst
      .mockResolvedValueOnce({ slug: "n1" })
      .mockResolvedValueOnce({ slug: "n2" });
    mockSpaceFindFirst
      .mockResolvedValueOnce({ name: "S1" })
      .mockResolvedValueOnce({ name: "S2" });
    mockEventFindFirst
      .mockResolvedValueOnce({ title: "E1" })
      .mockResolvedValueOnce({ title: "E2" });
    mockSectionFindFirst.mockResolvedValueOnce({ id: "sec" });

    const labels = await findMediaUrlUsages(MEDIA_URL);

    expect(labels.length).toBe(5);
  });
});

describe("assertMediaUrlNotInUse", () => {
  beforeEach(() => {
    mockPostFindFirst.mockReset();
    mockNewsFindFirst.mockReset();
    mockSpaceFindFirst.mockReset();
    mockEventFindFirst.mockReset();
    mockSectionFindFirst.mockReset();
    mockSettingsSeoFindFirst.mockReset();
    mockTermsFindFirst.mockReset();

    mockPostFindFirst.mockResolvedValue(null);
    mockNewsFindFirst.mockResolvedValue(null);
    mockSpaceFindFirst.mockResolvedValue(null);
    mockEventFindFirst.mockResolvedValue(null);
    mockSectionFindFirst.mockResolvedValue(null);
    mockSettingsSeoFindFirst.mockResolvedValue(null);
    mockTermsFindFirst.mockResolvedValue(null);
  });

  test("参照なしでは throw しない", async () => {
    await expect(assertMediaUrlNotInUse(MEDIA_URL)).resolves.toBeUndefined();
  });

  test("参照ありは CONFLICT をスローする", async () => {
    mockPostFindFirst
      .mockResolvedValueOnce({ slug: "in-use" })
      .mockResolvedValueOnce(null);

    try {
      await assertMediaUrlNotInUse(MEDIA_URL);
      expect.unreachable("expected DomainError");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({
        code: "CONFLICT",
        message: expect.stringContaining("使用中"),
      });
    }
  });
});
