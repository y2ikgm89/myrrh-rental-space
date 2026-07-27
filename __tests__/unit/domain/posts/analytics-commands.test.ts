import { describe, test, expect, mock, beforeEach } from "bun:test";
import { installPrismaEnumsMock } from "../../../support/prisma-enums-mock";

const mockPostUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 1 }),
);

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    post: { updateMany: mockPostUpdateMany },
  },
}));
await installPrismaEnumsMock({
  PostStatus: { PUBLISHED: "PUBLISHED", DRAFT: "DRAFT" },
});

const { incrementPostViewCount } =
  await import("@/shared/domain/posts/analytics-commands");

const POST_ID = "00000000-0000-4000-8000-000000000001";

describe("incrementPostViewCount", () => {
  beforeEach(() => {
    mockPostUpdateMany.mockReset();
    mockPostUpdateMany.mockResolvedValue({ count: 1 });
  });

  test("公開記事は viewCount を increment する", async () => {
    const result = await incrementPostViewCount(POST_ID);

    expect(result).toEqual({ incremented: true });
    expect(mockPostUpdateMany).toHaveBeenCalledWith({
      where: { id: POST_ID, status: "PUBLISHED" },
      data: { viewCount: { increment: 1 } },
    });
  });

  test("下書きなど非公開記事は increment しない", async () => {
    mockPostUpdateMany.mockResolvedValue({ count: 0 });

    const result = await incrementPostViewCount(POST_ID);

    expect(result).toEqual({ incremented: false });
    expect(mockPostUpdateMany).toHaveBeenCalledWith({
      where: { id: POST_ID, status: "PUBLISHED" },
      data: { viewCount: { increment: 1 } },
    });
  });
});
