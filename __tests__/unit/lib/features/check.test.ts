import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { FeatureModulesMap } from "@/shared/domain/settings/queries/features";

// `getFeatureModulesSettings` を差し替えて DB アクセスを切る
const mockGetFeatureModulesSettings = mock<() => Promise<FeatureModulesMap>>(
  () => Promise.resolve({}),
);

mock.module("@/shared/domain/settings/queries/features", () => ({
  getFeatureModulesSettings: mockGetFeatureModulesSettings,
}));

// notFound() を観測可能にする
const mockNotFound = mock<() => never>(() => {
  throw new Error("notFound called");
});
mock.module("next/navigation", () => ({
  notFound: mockNotFound,
}));

const {
  getEnabledFeatures,
  isFeatureEnabled,
  requireFeatureEnabled,
  isUrlDisabled,
} = await import("@/shared/lib/features/check");

const setStored = (stored: FeatureModulesMap): void => {
  mockGetFeatureModulesSettings.mockImplementation(() =>
    Promise.resolve(stored),
  );
};

describe("getEnabledFeatures", () => {
  beforeEach(() => {
    mockNotFound.mockClear();
  });

  test("全 module true の場合、全 module を返す", async () => {
    setStored({
      spaces: true,
      reservation: true,
      events: true,
      posts: true,
      news: true,
      faq: true,
      access: true,
      contact: true,
      reviews: true,
      "data-retention": true,
    });

    const enabled = await getEnabledFeatures();
    expect(enabled.size).toBe(10);
    expect(enabled.has("spaces")).toBe(true);
    expect(enabled.has("reviews")).toBe(true);
    expect(enabled.has("data-retention")).toBe(true);
  });

  test("空 map の場合、何も有効化されない（fail-closed）", async () => {
    setStored({});

    const enabled = await getEnabledFeatures();
    expect(enabled.size).toBe(0);
  });

  test("spaces OFF の場合、reservation / reviews も自動 OFF（依存解決）", async () => {
    setStored({
      spaces: false,
      reservation: true,
      reviews: true,
      events: true,
      posts: true,
      news: true,
      faq: true,
      access: true,
      contact: true,
    });

    const enabled = await getEnabledFeatures();
    expect(enabled.has("spaces")).toBe(false);
    expect(enabled.has("reservation")).toBe(false);
    expect(enabled.has("reviews")).toBe(false);
    expect(enabled.has("events")).toBe(true);
    expect(enabled.has("posts")).toBe(true);
  });

  test("explicit false は即時 OFF", async () => {
    setStored({
      spaces: true,
      reservation: true,
      events: false,
      posts: true,
      news: true,
      faq: true,
      access: true,
      contact: true,
      reviews: true,
    });

    const enabled = await getEnabledFeatures();
    expect(enabled.has("events")).toBe(false);
    expect(enabled.has("spaces")).toBe(true);
  });

  test("未知 key は無視する（registry にない module は OFF）", async () => {
    setStored({
      spaces: true,
      unknown_module: true,
    });

    const enabled = await getEnabledFeatures();
    expect(enabled.has("spaces")).toBe(true);
    // unknown_module は FEATURE_MODULES_LIST に無いため enabled に入らない
    expect(enabled.size).toBe(1);
  });
});

describe("isFeatureEnabled", () => {
  test("有効 module で true", async () => {
    setStored({ spaces: true });
    expect(await isFeatureEnabled("spaces")).toBe(true);
  });

  test("無効 module で false", async () => {
    setStored({ spaces: false });
    expect(await isFeatureEnabled("spaces")).toBe(false);
  });

  test("DB に key が無い場合 false（fail-closed）", async () => {
    setStored({});
    expect(await isFeatureEnabled("spaces")).toBe(false);
  });
});

describe("requireFeatureEnabled", () => {
  beforeEach(() => {
    mockNotFound.mockClear();
  });

  test("有効 module では何もしない", async () => {
    setStored({ contact: true });
    await requireFeatureEnabled("contact");
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  test("無効 module では notFound() を呼ぶ", async () => {
    setStored({ contact: false });
    await expect(requireFeatureEnabled("contact")).rejects.toThrow(
      "notFound called",
    );
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  test("依存先が OFF の場合も notFound() を呼ぶ", async () => {
    setStored({
      spaces: false,
      reservation: true,
    });
    await expect(requireFeatureEnabled("reservation")).rejects.toThrow(
      "notFound called",
    );
  });
});

/**
 * `isUrlDisabled` は sitemap / navigation の filter で公開ルートが
 * disabled module の publicRoutes に hit するかを判定する純粋関数。
 * 偽陽性（`/spacesfoo` を `/spaces` の子と誤判定）を防ぐため、
 * exact match と「`/` 区切りの子ルート」のみマッチする。
 */
describe("isUrlDisabled", () => {
  test("exact match で hit する", () => {
    expect(isUrlDisabled("/spaces", ["/spaces"])).toBe(true);
  });

  test("child route で hit する（`/route/` プレフィックス）", () => {
    expect(isUrlDisabled("/spaces/room-a", ["/spaces"])).toBe(true);
    expect(isUrlDisabled("/spaces/room-a/edit", ["/spaces"])).toBe(true);
  });

  test("偽陽性 guard — `/spacesfoo` は `/spaces` の子ではない", () => {
    // startsWith("/spaces") だけだと misfire するが、startsWith("/spaces/") なので safe
    expect(isUrlDisabled("/spacesfoo", ["/spaces"])).toBe(false);
    expect(isUrlDisabled("/spaces-archive", ["/spaces"])).toBe(false);
  });

  test("空 disabledRoutes は常に false", () => {
    expect(isUrlDisabled("/spaces", [])).toBe(false);
    expect(isUrlDisabled("/anything", [])).toBe(false);
  });

  test("multi-route で 1 つに hit すれば true（OR 評価）", () => {
    expect(isUrlDisabled("/contact", ["/spaces", "/contact", "/faq"])).toBe(
      true,
    );
  });

  test("multi-route のいずれにも該当しなければ false", () => {
    expect(isUrlDisabled("/about", ["/spaces", "/contact", "/faq"])).toBe(
      false,
    );
  });

  test("trailing slash 付き URL は exact match しない（仕様：呼び側の責任）", () => {
    // disabledRoutes は trailing slash 無しを契約とする — `/spaces/` は `/spaces` と別物
    expect(isUrlDisabled("/spaces/", ["/spaces"])).toBe(true); // child 扱いで hit する
  });

  test("root `/` は exact match のみ — `${route}/` concat で `//` になり child 誤吸収を防ぐ", () => {
    // 実装 `url === route || url.startsWith(`${route}/`)` で root の child match は
    // url.startsWith("//") となり常に false。registry に root を誤登録しても
    // 副作用は最小（root 自身が disable になるだけで他全 URL は保護される）。
    expect(isUrlDisabled("/", ["/"])).toBe(true);
    expect(isUrlDisabled("/spaces", ["/"])).toBe(false);
    expect(isUrlDisabled("/about", ["/"])).toBe(false);
  });
});
