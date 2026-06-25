/**
 * Event gallery round-trip — 統合テスト
 *
 * createEventCommand / updateEventCommand / duplicateEventCommand を通じて
 * gallery: GalleryItem[] が Prisma create/update/duplicate call に正しく
 * 伝搬されることを mock Prisma で検証する。
 *
 * scope:
 *  - gallery shape が `{ url, alt, caption }[]` として create/update data に乗る
 *  - asPrismaInputJsonValue が gallery を InputJsonValue に変換して渡す
 *  - duplicate 時も gallery が source から複製先 create data に乗る
 *
 * auth / RBAC / cache invalidation はスコープ外（別テストで担保）。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

mock.module("server-only", () => ({}));

const mockCreate = mock<
  (args: {
    data: Record<string, unknown>;
    select: Record<string, boolean>;
  }) => Promise<{
    id: string;
    slug: string;
  }>
>(() => Promise.resolve({ id: "evt-id", slug: "test-event" }));

const mockUpdate = mock<
  (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => Promise<void>
>(() => Promise.resolve());

const mockFindFirst = mock<() => Promise<Record<string, unknown> | null>>(() =>
  Promise.resolve(null),
);

const mockFindUnique = mock<() => Promise<Record<string, unknown> | null>>(() =>
  Promise.resolve(null),
);

const mockFindUniqueBySlug = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);

const mockFindMany = mock<() => Promise<{ slug: string }[]>>(() =>
  Promise.resolve([]),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    event: {
      create: (args: {
        data: Record<string, unknown>;
        select: Record<string, boolean>;
      }) => mockCreate(args),
      update: (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => mockUpdate(args),
      findFirst: (_args: unknown) => mockFindFirst(),
      findUnique: (args: { where: { id?: string; slug?: string } }) => {
        if (args.where.slug !== undefined) return mockFindUniqueBySlug();
        return mockFindUnique();
      },
      findMany: () => mockFindMany(),
    },
    eventTicket: {
      createMany: mock(() => Promise.resolve({ count: 0 })),
      deleteMany: mock(() => Promise.resolve({ count: 0 })),
    },
    $transaction: mock(async (fn: (tx: unknown) => Promise<unknown>) => {
      // interactive transaction — tx は prisma と同じ mock を使う
      const tx = {
        event: {
          create: mockCreate,
          update: mockUpdate,
        },
        eventTicket: {
          createMany: mock(() => Promise.resolve({ count: 0 })),
          deleteMany: mock(() => Promise.resolve({ count: 0 })),
        },
      };
      return fn(tx);
    }),
  },
}));

// email / calendar / other side-effects をすべて no-op に
mock.module("@/shared/lib/email/event-emails", () => ({
  sendEventCancelledToAllParticipants: mock(async () => {}),
  sendEventUpdatedToAllParticipants: mock(async () => {}),
}));
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mock((_fn: () => unknown) => {}),
}));
mock.module("@/shared/lib/lexical/description-defaults", () => ({
  buildParagraphEditorStateJson: mock(() => ({ type: "root" })),
  buildParagraphHtml: mock(() => "<p></p>"),
}));
mock.module("@/shared/lib/lexical/html-to-plain-text", () => ({
  stripHtmlToText: mock(() => ""),
}));

const { createEventCommand, updateEventCommand, duplicateEventCommand } =
  await import("@/shared/domain/events/commands");

// ---------------------------------------------------------------------------

const GALLERY = [
  { url: "https://cdn.example.com/a.jpg", alt: "img a", caption: "Caption A" },
  { url: "https://cdn.example.com/b.jpg", alt: "img b", caption: "" },
];

const BASE_INPUT = {
  title: "テストイベント",
  slug: "test-event",
  descriptionJson: {
    type: "root",
  } as import("@generated/prisma/client").Prisma.InputJsonValue,
  descriptionHtml: "<p>test</p>",
  descriptionPlainText: "test",
  gallery: GALLERY,
  startTime: "2026-07-01T10:00",
  endTime: "2026-07-01T12:00",
  status: EventStatus.DRAFT,
} as const;

const SOURCE_EVENT = {
  id: "src-evt-id",
  slug: "test-event",
  status: EventStatus.DRAFT,
  startTime: new Date("2026-07-01T01:00:00.000Z"),
  endTime: new Date("2026-07-01T03:00:00.000Z"),
  locationId: null,
  spaceId: null,
  addressDetail: null,
  title: "テストイベント",
  descriptionJson: { type: "root" },
  descriptionHtml: "<p>test</p>",
  descriptionPlainText: "test",
  thumbnailUrl: null,
  gallery: GALLERY,
  ogpImageUrl: null,
  ogpTitle: null,
  ogpDescription: null,
  metaDescription: null,
  metaKeywords: null,
  registrationDeadline: null,
  capacity: null,
  registrationOpen: false,
  tickets: [],
};

describe("Event gallery round-trip", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ id: "evt-id", slug: "test-event" });
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue(undefined);
    mockFindFirst.mockReset();
    mockFindFirst.mockResolvedValue(null);
    mockFindUnique.mockReset();
    mockFindUnique.mockResolvedValue(null);
    mockFindUniqueBySlug.mockReset();
    mockFindUniqueBySlug.mockResolvedValue(null);
    mockFindMany.mockReset();
    mockFindMany.mockResolvedValue([]);
  });

  // ── createEventCommand: gallery が create data に乗る ────────────────────

  test("createEventCommand: gallery が Prisma create data に正しく渡される", async () => {
    // slug 重複チェック — 新規なのですべて null
    await createEventCommand(BASE_INPUT);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArg = mockCreate.mock.calls[0]?.[0] as
      | { data: Record<string, unknown> }
      | undefined;

    // asPrismaInputJsonValue が gallery を InputJsonValue に変換して渡す
    // (runtime では plain array を返す)
    expect(callArg?.data).toBeDefined();
    expect(callArg?.data?.["gallery"]).toEqual(GALLERY);
  });

  // ── updateEventCommand: gallery が update data に乗る ────────────────────

  test("updateEventCommand: gallery が Prisma update data に正しく渡される", async () => {
    // findFirst で既存イベントを返す
    mockFindFirst.mockResolvedValueOnce({
      id: "evt-id",
      slug: "test-event",
      status: EventStatus.DRAFT,
      startTime: new Date("2026-07-01T01:00:00.000Z"),
      endTime: new Date("2026-07-01T03:00:00.000Z"),
      locationId: null,
      spaceId: null,
      addressDetail: null,
    });

    await updateEventCommand("evt-id", BASE_INPUT);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const callArg = mockUpdate.mock.calls[0]?.[0] as
      | { data: Record<string, unknown> }
      | undefined;

    expect(callArg?.data?.["gallery"]).toEqual(GALLERY);
  });

  // ── duplicateEventCommand: gallery が複製先 create data に乗る ──────────

  test("duplicateEventCommand: gallery が複製先 Prisma create data に正しく渡される", async () => {
    // duplicateEventCommand は findFirst(id, deletedAt) で source 取得
    mockFindFirst.mockResolvedValueOnce(SOURCE_EVENT);
    // ensureUniqueSlug 内の findFirst(slug チェック) は null → slug そのまま使用

    await duplicateEventCommand("src-evt-id");

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArg = mockCreate.mock.calls[0]?.[0] as
      | { data: Record<string, unknown> }
      | undefined;

    expect(callArg?.data?.["gallery"]).toEqual(GALLERY);
    // duplicate なので DRAFT / registrationOpen=false
    expect(callArg?.data?.["status"]).toBe(EventStatus.DRAFT);
    expect(callArg?.data?.["registrationOpen"]).toBe(false);
  });
});
