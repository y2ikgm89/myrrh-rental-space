import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { PORTAL_LAYER_CLASS, Z_INDEX } from "@/admin/lib/styles/z-index";

const UI_DIR = "src/app/(admin)/admin/(dashboard)/_shared/components/ui";

/**
 * admin z-index — レイヤー設計の gate。
 *
 * ## なぜ
 *
 * Radix の Dialog / AlertDialog / Select / DropdownMenu / Popover / Tooltip は
 * すべて `document.body` 直下へ Portal される。つまり**互いに兄弟**で、同じ root
 * stacking context に並ぶ。ここで各コンポーネントに別々の z-index を振ると、
 * 「ページ内での序列」がそのまま「Portal 先での序列」として効いてしまう。
 *
 * 実測した欠陥（2026-08-19 / admin 設定 > 外部連携 > SwitchBot のデバイス編集）:
 * dialogOverlay=85 / dialog=90 に対して Select は dropdown=25 だったため、
 * ダイアログ内で開いた「機種」ドロップダウンが**必ずダイアログの背後に沈み**、
 * ダイアログ枠からはみ出した数行しか見えなかった。Radix Popper は content の
 * computed z-index を `[data-radix-popper-content-wrapper]` へ複写するので、
 * content 側だけを持ち上げても抜けられない。
 *
 * Radix 公式の案内（radix-ui/primitives discussions#1985）はこう:
 *
 * > If you use the `Portal` part on all of these, you shouldn't even really need
 * > to fiddle with `z-index` as they will be appended naturally one after the
 * > other in `document.body`, so layering will be correct by default.
 *
 * よって Portal 層は `Z_INDEX.portal` 1 値のみ。番号の役割は「ページ内レイヤーより
 * 上へ持ち上げる」ことだけで、Portal 同士の順序は DOM 追加順（= 開いた順）に委ねる。
 *
 * ## 何を見るか
 *
 * 1. トークン: ページ内レイヤーがすべて `portal` より下にあること
 * 2. クラス: `PORTAL_LAYER_CLASS` が `portal` の値と一致すること
 *    （Tailwind v4 は実行時補間の arbitrary value を生成しないのでリテラル固定）
 * 3. 実装: Portal されるプリミティブが `PORTAL_LAYER_CLASS` 以外の z-index 機構を
 *    持たないこと
 *
 * ## 直し方
 *
 * Portal されるプリミティブに固有の重なり順を持たせない。「この Content だけ上に
 * 出したい」が必要になったら、それは Portal 先での DOM 順が期待とずれている合図で、
 * z-index ではなく開閉順やマウント位置の問題として見る。
 */

/** body へ Portal される admin プリミティブ。 */
const PORTALLED_PRIMITIVES = [
  "alert-dialog.tsx",
  "dialog.tsx",
  "dropdown-menu.tsx",
  "popover.tsx",
  "select.tsx",
  "tooltip.tsx",
] as const;

/** Portal 層に固有の重なり順を持ち込む機構。1 つでも残っていたら設計が崩れる。 */
const FORBIDDEN_LAYERING_MECHANISMS = [
  "adminZIndexClassName",
  "assignAdminZIndex",
  "useAdminZIndexImperative",
  "zIndex",
  "Z_INDEX.",
] as const;

function stripComments(source: string): string {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//gu, "")
    .replaceAll(/(^|[^:])\/\/.*$/gmu, "$1");
}

describe("admin z-index tokens", () => {
  test("ページ内レイヤーはすべて Portal 層より下にある", () => {
    const inPageLayers = Object.entries(Z_INDEX).filter(
      ([key]) => key !== "portal",
    );

    expect(inPageLayers.length).toBeGreaterThan(0);
    expect(inPageLayers.filter(([, value]) => value >= Z_INDEX.portal)).toEqual(
      [],
    );
  });

  test("モバイルドロワーはページ内 chrome の上に出る", () => {
    expect(Z_INDEX.header).toBeGreaterThan(Z_INDEX.sidebar);
    expect(Z_INDEX.overlay).toBeGreaterThan(Z_INDEX.header);
    expect(Z_INDEX.sidebarDrawer).toBeGreaterThan(Z_INDEX.overlay);
  });

  test("PORTAL_LAYER_CLASS はトークンの値と一致する", () => {
    expect(PORTAL_LAYER_CLASS).toBe(`z-[${Z_INDEX.portal}]`);
  });
});

describe("portal されるプリミティブは単一の Portal 層に乗る", () => {
  for (const file of PORTALLED_PRIMITIVES) {
    test(`${file} は PORTAL_LAYER_CLASS だけで重なり順を決める`, () => {
      const source = readFileSync(join(process.cwd(), UI_DIR, file), "utf8");
      const code = stripComments(source);

      expect(source).toContain("Portal>");

      // ソース全文を吐かせないよう、判定結果だけを比較する
      expect({
        usesPortalLayerClass: code.includes("PORTAL_LAYER_CLASS"),
        ownLayering: FORBIDDEN_LAYERING_MECHANISMS.filter((mechanism) =>
          code.includes(mechanism),
        ),
      }).toEqual({ usesPortalLayerClass: true, ownLayering: [] });
    });
  }
});
