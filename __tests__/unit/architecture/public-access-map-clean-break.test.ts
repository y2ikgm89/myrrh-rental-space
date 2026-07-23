import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";

const ROOT = process.cwd();

function read(path: string): string {
  return readFileSync(join(ROOT, ...path.split("/")), "utf8");
}

describe("public access map clean break", () => {
  test("AccessMap requires explicit location input and does not fallback to organization settings", () => {
    const source = read("src/app/(public)/_components/access-map.tsx");

    expect(source).not.toContain("getOrganizationSettings");
    expect(source).not.toContain("props 未指定");
    expect(source).not.toContain("フォールバック");
    expect(source).not.toMatch(/AccessMapProps\s*=\s*\{\}/u);
  });

  test("LocationListSection passes location address explicitly", () => {
    const source = read("src/app/(public)/_components/LocationListSection.tsx");

    expect(source).toContain("<AccessMap");
    expect(source).toContain("address={location.address}");
  });
});

// grep ベースのテストは「特定の文字列/import が存在しない」ことしか保証せず、
// エイリアス import や別文言での再導入をすり抜ける。実際に AccessMap を呼び出し、
// APIキー未設定（≒ DB フォールバック / 未設定）時に組織横断のフォールバック先が
// 一切参照されず、渡された住所のみを使った空状態が描画されることを検証する。
describe("public access map clean break (behavioral)", () => {
  mock.module("next/server", () => ({
    connection: mock(() => Promise.resolve()),
  }));

  const mockGetDecryptedGoogleMapsApiKey = mock<() => Promise<string | null>>(
    () => Promise.resolve(null),
  );
  mock.module("@/shared/domain/settings/api-key-queries", () => ({
    getDecryptedGoogleMapsApiKey: mockGetDecryptedGoogleMapsApiKey,
  }));

  test("API キー未設定時は組織設定を経由せず、渡された住所のみを使った空状態を描画する", async () => {
    const { AccessMap } = await import("@/app/(public)/_components/access-map");

    const element = (await AccessMap({
      address: "東京都渋谷区1-1-1",
    })) as ReactElement<{ children?: ReactElement }>;

    const paragraph = element.props.children as ReactElement<{
      children?: unknown;
    }>;
    const text = JSON.stringify(paragraph.props.children);

    expect(text).toContain("東京都渋谷区1-1-1");
    expect(text).not.toContain("管理画面");
    expect(text).not.toContain("API");
  });
});
