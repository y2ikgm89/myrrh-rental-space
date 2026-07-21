import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockRequireAdminPermission = mock(async () => ({
  id: "admin-user",
  role: "ADMIN",
}));
const mockGetNewsByIdQuery = mock(async (id: string) => ({
  id,
  title: "テスト記事",
}));
const mockGetNewsListQuery = mock(async () => ({
  news: [],
  total: 0,
  page: 1,
  limit: 20,
  totalPages: 0,
}));

mock.module("@/admin/queries/_helpers", () => ({
  requireAdminPermission: (
    ...args: Parameters<typeof mockRequireAdminPermission>
  ) => mockRequireAdminPermission(...args),
}));

mock.module("@/shared/domain/news/admin-queries", () => ({
  getNewsById: (...args: Parameters<typeof mockGetNewsByIdQuery>) =>
    mockGetNewsByIdQuery(...args),
  getNewsList: (...args: Parameters<typeof mockGetNewsListQuery>) =>
    mockGetNewsListQuery(...args),
}));

// 実行時に読み込まれる "react" は package.json exports の "react-server"
// 条件が付かない限り常に恒等関数の cache() を返す（React 公式実装、
// node_modules/react/cjs/react.development.js で実証済み）。generateMetadata /
// page body が同一 id で連続呼出したときにクエリが 1 回に集約されることを
// 検証するため、テスト用に本物のメモ化を行う fake に差し替える。
mock.module("react", () => ({
  cache: <Args extends unknown[], Result>(
    fn: (...args: Args) => Result,
  ): ((...args: Args) => Result) => {
    const store = new Map<string, Result>();
    return (...args: Args): Result => {
      const key = JSON.stringify(args);
      if (!store.has(key)) {
        store.set(key, fn(...args));
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return store.get(key)!;
    };
  },
}));

const { getNewsById } = await import("@/admin/queries/news");

const NEWS_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_NEWS_ID = "22222222-2222-4222-8222-222222222222";

// cache() は id をキーにメモ化するため、id ごとに未使用の値を使う
// （同一プロセス内で getNewsById は import 時に一度だけ生成され、
// 内部キャッシュはテスト間で共有される）。
describe("getNewsById — generateMetadata / page body の二重フェッチ防止", () => {
  beforeEach(() => {
    mockRequireAdminPermission.mockClear();
    mockGetNewsByIdQuery.mockClear();
  });

  test("同一 id を連続して呼んでもクエリは 1 回だけ発行され、異なる id は個別に発行する", async () => {
    await getNewsById(NEWS_ID);
    await getNewsById(NEWS_ID);

    expect(mockGetNewsByIdQuery).toHaveBeenCalledTimes(1);

    await getNewsById(OTHER_NEWS_ID);

    expect(mockGetNewsByIdQuery).toHaveBeenCalledTimes(2);
  });
});
