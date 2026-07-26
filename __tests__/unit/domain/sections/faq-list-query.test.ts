import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installErrorsServerMock } from "../../../mocks/errors-server";

// Prisma モック（mock.module より前に定義 — TDZ 回避）
const cacheLifeMock = mock(() => {});
const cacheTagMock = mock(() => {});
mock.module("next/cache", () => ({
  cacheLife: cacheLifeMock,
  cacheTag: cacheTagMock,
}));

const faqItemFindMany = mock<(_args?: unknown) => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    faqItem: {
      findMany: (args: unknown) => faqItemFindMany(args),
    },
  },
}));

interface SafeFetchOpts<T> {
  readonly fetch: () => Promise<T>;
  readonly fallback: T;
}
await installErrorsServerMock({
  safeFetch: async <T>(opts: SafeFetchOpts<T>): Promise<T> => {
    try {
      return await opts.fetch();
    } catch {
      return opts.fallback;
    }
  },
});

const { getPublishedFaqItems } =
  await import("@/shared/domain/sections/queries");

function lastFindManyArg(): { select: Record<string, unknown> } {
  const call = faqItemFindMany.mock.calls[0]?.[0];
  if (!call || typeof call !== "object") {
    throw new Error("faqItem.findMany was not called");
  }
  return call as { select: Record<string, unknown> };
}

describe("getPublishedFaqItems", () => {
  beforeEach(() => {
    faqItemFindMany.mockReset();
    faqItemFindMany.mockResolvedValue([]);
  });

  // Regression: FaqListSection の flat-items 分岐（config.categoryId 絞り込み時）が
  // <FaqHelpfulVote>/<FaqViewTracker> をマウントできるよう、select に投票/閲覧数
  // カウントを含める（旧実装は id/question/answer のみで恒久的にトラッキング不能だった）
  test("select は helpfulCount / notHelpfulCount を含む", async () => {
    await getPublishedFaqItems(10, "category-1");

    const { select } = lastFindManyArg();
    expect(select).toMatchObject({
      id: true,
      question: true,
      answer: true,
      helpfulCount: true,
      notHelpfulCount: true,
    });
  });

  test("DB から取得した helpfulCount / notHelpfulCount がそのまま返る", async () => {
    faqItemFindMany.mockResolvedValue([
      {
        id: "faq-1",
        question: "Q1",
        answer: "A1",
        helpfulCount: 3,
        notHelpfulCount: 1,
      },
    ]);

    const items = await getPublishedFaqItems(10, "category-1");

    expect(items).toEqual([
      {
        id: "faq-1",
        question: "Q1",
        answer: "A1",
        helpfulCount: 3,
        notHelpfulCount: 1,
      },
    ]);
  });
});
