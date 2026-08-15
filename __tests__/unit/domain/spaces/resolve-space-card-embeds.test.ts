import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TaxDisplayMode } from "@/shared/lib/validations/enums/prisma-types";

mock.module("server-only", () => ({}));

const mockResolveSpaceCardEmbedData = mock<
  (ids: readonly string[]) => Promise<Map<string, unknown>>
>(() => Promise.resolve(new Map()));

mock.module("@/shared/domain/spaces/public-queries", () => ({
  resolveSpaceCardEmbedData: mockResolveSpaceCardEmbedData,
}));

const mockGetPublicTaxSettings = mock(() =>
  Promise.resolve({
    standardRate: 10,
    reducedRate: 8,
    displayModePublic: TaxDisplayMode.TAX_INCLUDED,
  }),
);

mock.module("@/shared/domain/settings/queries/tax", () => ({
  getPublicTaxSettings: mockGetPublicTaxSettings,
}));

const { resolveSpaceCardEmbeds } =
  await import("@/shared/domain/spaces/resolve-space-card-embeds");

const PLACEHOLDER = (id: string, name = "") =>
  `<a data-space-card-embed="true" data-space-id="${id}" data-space-name="${name}" href="#"></a>`;

describe("resolveSpaceCardEmbeds", () => {
  beforeEach(() => {
    mockResolveSpaceCardEmbedData.mockReset();
    mockResolveSpaceCardEmbedData.mockResolvedValue(new Map());
    mockGetPublicTaxSettings.mockClear();
  });

  test("プレースホルダーが無い HTML はそのまま返す（DB アクセスなし）", async () => {
    const html = "<p>hello</p>";
    expect(await resolveSpaceCardEmbeds(html)).toBe(html);
    expect(mockResolveSpaceCardEmbedData).not.toHaveBeenCalled();
    expect(mockGetPublicTaxSettings).not.toHaveBeenCalled();
  });

  test("解決できないプレースホルダーは除去される", async () => {
    const html = `<p>a</p>${PLACEHOLDER("__nope__")}<p>b</p>`;
    const out = await resolveSpaceCardEmbeds(html);
    expect(out).not.toContain("data-space-card-embed");
    expect(out).toContain("<p>a</p>");
    expect(out).toContain("<p>b</p>");
  });

  test("解決できたプレースホルダーはリッチカードに差し替わる（name は HTML escape・税込み価格表示）", async () => {
    mockResolveSpaceCardEmbedData.mockResolvedValueOnce(
      new Map([
        [
          "spc-1",
          {
            id: "spc-1",
            slug: "terrace-room",
            name: "テラス <script> ルーム",
            capacity: 8,
            hourlyPrice: 3000,
            taxRateType: "STANDARD",
            mainImageUrl: "https://x/room.jpg",
          },
        ],
      ]),
    );
    const html = `<p>x</p>${PLACEHOLDER("spc-1", "テラス")}`;
    const out = await resolveSpaceCardEmbeds(html);
    expect(out).toContain('data-space-card-embed-resolved="true"');
    expect(out).toContain('href="/spaces/terrace-room"');
    expect(out).toContain('href="/reservation?spaceId=spc-1"');
    expect(out).toContain("テラス &lt;script&gt; ルーム");
    expect(out).toContain("https://x/room.jpg");
    expect(out).toContain("8名");
    expect(out).toContain("¥3,300/h（税込）");
    expect(out).not.toContain('href="#"');
  });

  test("同一 html 内の複数プレースホルダーの id をまとめて1回で解決し、税設定取得も1回のみ", async () => {
    const html = PLACEHOLDER("spc-1") + PLACEHOLDER("spc-2");
    await resolveSpaceCardEmbeds(html);
    expect(mockResolveSpaceCardEmbedData).toHaveBeenCalledTimes(1);
    expect(mockResolveSpaceCardEmbedData).toHaveBeenCalledWith([
      "spc-1",
      "spc-2",
    ]);
    expect(mockGetPublicTaxSettings).toHaveBeenCalledTimes(1);
  });
});
