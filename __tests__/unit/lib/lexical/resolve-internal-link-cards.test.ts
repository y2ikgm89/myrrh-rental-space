import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockResolveLinkCardsByType = mock<
  (contentType: string, ids: readonly string[]) => Promise<Map<string, unknown>>
>(() => Promise.resolve(new Map()));

mock.module("@/shared/domain/link-cards/resolve-queries", () => ({
  resolveLinkCardsByType: mockResolveLinkCardsByType,
}));

const { resolveInternalLinkCards } =
  await import("@/shared/lib/lexical/resolve-internal-link-cards");

const PLACEHOLDER = (type: string, id: string) =>
  `<a data-internal-link-card="true" data-content-type="${type}" data-content-id="${id}" href="#"></a>`;

describe("resolveInternalLinkCards", () => {
  beforeEach(() => {
    mockResolveLinkCardsByType.mockReset();
    mockResolveLinkCardsByType.mockResolvedValue(new Map());
  });

  test("プレースホルダーが無い HTML はそのまま返す（DB アクセスなし）", async () => {
    const html = "<p>hello</p>";
    expect(await resolveInternalLinkCards(html)).toBe(html);
    expect(mockResolveLinkCardsByType).not.toHaveBeenCalled();
  });

  test("解決できないプレースホルダーは除去される", async () => {
    const html = `<p>a</p>${PLACEHOLDER("post", "__nope__")}<p>b</p>`;
    const out = await resolveInternalLinkCards(html);
    expect(out).not.toContain("data-internal-link-card");
    expect(out).toContain("<p>a</p>");
    expect(out).toContain("<p>b</p>");
  });

  test("解決できたプレースホルダーはカード本体に差し替わる（title は HTML escape）", async () => {
    mockResolveLinkCardsByType.mockResolvedValueOnce(
      new Map([
        [
          "p1",
          {
            contentType: "post",
            contentId: "p1",
            title: "A & B <script>",
            excerpt: "概要",
            thumbnailUrl: "https://x/t.jpg",
            href: "/posts/a-b",
          },
        ],
      ]),
    );
    const html = `<p>x</p>${PLACEHOLDER("post", "p1")}`;
    const out = await resolveInternalLinkCards(html);
    expect(out).toContain('data-internal-link-card-resolved="true"');
    expect(out).toContain('href="/posts/a-b"');
    expect(out).toContain("A &amp; B &lt;script&gt;");
    expect(out).toContain("https://x/t.jpg");
    expect(out).toContain("概要");
    expect(out).not.toContain('href="#"');
  });

  test("種別ごとに 1 回だけバッチ解決する（同種別の複数 id をまとめる）", async () => {
    const html =
      PLACEHOLDER("post", "p1") +
      PLACEHOLDER("post", "p2") +
      PLACEHOLDER("event", "e1");
    await resolveInternalLinkCards(html);
    expect(mockResolveLinkCardsByType).toHaveBeenCalledTimes(2);
    expect(mockResolveLinkCardsByType).toHaveBeenCalledWith("post", [
      "p1",
      "p2",
    ]);
    expect(mockResolveLinkCardsByType).toHaveBeenCalledWith("event", ["e1"]);
  });

  test("不正な種別の placeholder は除去され、解決は呼ばれない", async () => {
    const html = PLACEHOLDER("garbage", "x");
    const out = await resolveInternalLinkCards(html);
    expect(out).toBe("");
    expect(mockResolveLinkCardsByType).not.toHaveBeenCalled();
  });
});
