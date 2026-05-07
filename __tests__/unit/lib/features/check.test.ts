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

// react cache はテスト環境では single-call wrapper として振る舞えば十分
mock.module("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
}));

const { getEnabledFeatures, isFeatureEnabled, requireFeatureEnabled } =
  await import("@/shared/lib/features/check");

describe("getEnabledFeatures", () => {
  beforeEach(() => {
    mockGetFeatureModulesSettings.mockReset();
    mockNotFound.mockClear();
  });

  test("全 module true の場合、全 module を返す", async () => {
    mockGetFeatureModulesSettings.mockResolvedValue({
      spaces: true,
      reservation: true,
      events: true,
      posts: true,
      news: true,
      faq: true,
      access: true,
      contact: true,
      reviews: true,
    });

    const enabled = await getEnabledFeatures();
    expect(enabled.size).toBe(9);
    expect(enabled.has("spaces")).toBe(true);
    expect(enabled.has("reviews")).toBe(true);
  });

  test("空 map の場合、何も有効化されない（fail-closed）", async () => {
    mockGetFeatureModulesSettings.mockResolvedValue({});

    const enabled = await getEnabledFeatures();
    expect(enabled.size).toBe(0);
  });

  test("spaces OFF の場合、reservation / reviews も自動 OFF（依存解決）", async () => {
    mockGetFeatureModulesSettings.mockResolvedValue({
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
    mockGetFeatureModulesSettings.mockResolvedValue({
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
    mockGetFeatureModulesSettings.mockResolvedValue({
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
  beforeEach(() => {
    mockGetFeatureModulesSettings.mockReset();
  });

  test("有効 module で true", async () => {
    mockGetFeatureModulesSettings.mockResolvedValue({ spaces: true });
    expect(await isFeatureEnabled("spaces")).toBe(true);
  });

  test("無効 module で false", async () => {
    mockGetFeatureModulesSettings.mockResolvedValue({ spaces: false });
    expect(await isFeatureEnabled("spaces")).toBe(false);
  });

  test("DB に key が無い場合 false（fail-closed）", async () => {
    mockGetFeatureModulesSettings.mockResolvedValue({});
    expect(await isFeatureEnabled("spaces")).toBe(false);
  });
});

describe("requireFeatureEnabled", () => {
  beforeEach(() => {
    mockGetFeatureModulesSettings.mockReset();
    mockNotFound.mockClear();
  });

  test("有効 module では何もしない", async () => {
    mockGetFeatureModulesSettings.mockResolvedValue({ contact: true });
    await requireFeatureEnabled("contact");
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  test("無効 module では notFound() を呼ぶ", async () => {
    mockGetFeatureModulesSettings.mockResolvedValue({ contact: false });
    await expect(requireFeatureEnabled("contact")).rejects.toThrow(
      "notFound called",
    );
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  test("依存先が OFF の場合も notFound() を呼ぶ", async () => {
    mockGetFeatureModulesSettings.mockResolvedValue({
      spaces: false,
      reservation: true,
    });
    await expect(requireFeatureEnabled("reservation")).rejects.toThrow(
      "notFound called",
    );
  });
});
