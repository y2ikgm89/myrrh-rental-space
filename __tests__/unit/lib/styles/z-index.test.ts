import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { PORTAL_LAYER_CLASS, Z_INDEX } from "@/admin/lib/styles/z-index";

/**
 * admin z-index — レイヤー設計の gate。
 *
 * ## なぜ
 *
 * `document.body` へ Portal された要素は**互いに兄弟**で、同じ root stacking
 * context に並ぶ。ここで要素ごとに別々の z-index を振ると、「ページ内での序列」が
 * そのまま「Portal 先での序列」として効いてしまう。
 *
 * 実測した欠陥は 2 つあり、どちらも同じ形だった（2026-08-19）:
 *
 * 1. 設定 > 外部連携 > SwitchBot のデバイス編集ダイアログ。dialogOverlay 85 /
 *    dialog 90 に対し Select は dropdown 25 で、ドロップダウンが必ずダイアログの
 *    背後に沈んだ。Radix Popper は content の computed z-index を
 *    `[data-radix-popper-content-wrapper]` へ複写するので、content 側だけを
 *    持ち上げても抜けられない。
 * 2. Lexical のリンクホバープレビュー。`document.body` へ `createPortal` する側が
 *    `fixed z-50` のリテラルで、フルスクリーンエディタのコンテナ
 *    （`fixed inset-0` + `bg-card` + editorFullscreen 80）の背後に完全に隠れた。
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
 * 3. 実装: **admin 配下で body へ Portal する tsx を走査して探し**、それらが
 *    `PORTAL_LAYER_CLASS` 以外の重なり順の決め方を持たないこと
 *
 * 3 が走査なのは、前身が対象 6 ファイルを直書きしていて、**リストに載っていない
 * `LinkHoverPreviewPlugin` の欠陥（上記 2）を素通りさせた**から。対象は名前で
 * 数えるものではなく「body へ Portal するかどうか」で決まる。
 *
 * ## 走査範囲
 *
 * `src/app/(admin)` のみ。`Z_INDEX` は admin 専用のトークンで、公開側は
 * 素の shadcn と同じく Dialog の overlay / content を同値（`z-50`）に揃える
 * 別の流儀を採っている。公開側をここで縛らない。
 *
 * ## 既知の限界
 *
 * Radix の `Portal` に `container` を渡すと行き先は body ではなくなるが、
 * ここではその区別をしていない（admin に該当箇所が無いため）。渡す実装を
 * 足すときはこの gate の判定も一緒に直す。
 *
 * ## 直し方
 *
 * body へ Portal するものに固有の重なり順を持たせない。「これだけ上に出したい」が
 * 必要になったら、それは Portal 先での DOM 順が期待とずれている合図で、z-index では
 * なく開閉順やマウント位置の問題として見る。
 */

const ADMIN_DIR = join(process.cwd(), "src/app/(admin)");

/** Portal 層に固有の重なり順を持ち込む機構。1 つでも残っていたら設計が崩れる。 */
const OWN_LAYERING_MECHANISMS = [
  "adminZIndexClassName",
  "useAdminZIndexImperative",
  "zIndex",
  "Z_INDEX.",
] as const;

/** `z-50` のような素の z-index utility（`PORTAL_LAYER_CLASS` を経由しないもの）。 */
const RAW_Z_INDEX_CLASS = /\bz-(?:\d+|\[[^\]\s]+\])/u;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|\s)\/\/.*$/gmu, "");
}

/**
 * `document.body` へ Portal しているか。
 *
 * - Radix: `XPrimitive.Portal`（`container` 未指定の既定が body）
 * - react-dom: `createPortal(node, document.body)`
 *
 * Lexical の浮遊 UI の大半は `createPortal(node, anchorElem)` でエディタ内へ出す。
 * それらは別 stacking context の中なので対象外にする必要がある。
 */
function portalsToBody(code: string): boolean {
  if (/Primitive\.Portal\b/u.test(code)) return true;
  return code.includes("createPortal(") && code.includes("document.body");
}

function listAdminComponents(): string[] {
  return [...new Bun.Glob("**/*.tsx").scanSync({ cwd: ADMIN_DIR })].sort();
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

describe("body へ Portal するものは単一の Portal 層に乗る", () => {
  const files = listAdminComponents();
  const portalled = files.filter((file) =>
    portalsToBody(stripComments(readFileSync(join(ADMIN_DIR, file), "utf8"))),
  );

  test("gate が空振りしていない", () => {
    expect(files.length).toBeGreaterThan(100);

    // 走査が壊れて 0 件になっていないことの下限。admin の Portal 系プリミティブ
    // だけで 6 つあるので、これを大きく割るなら判定の側が壊れている。
    expect(portalled.length).toBeGreaterThanOrEqual(5);

    // 判定の見本。**元の 2 つの欠陥そのものの形**が対象と判定されること。
    expect(
      portalsToBody(
        "return createPortal(<LinkHoverPreview {...previewState} />, document.body);",
      ),
    ).toBe(true);
    expect(portalsToBody("<SelectPrimitive.Portal>")).toBe(true);
    expect(portalsToBody("const DialogPortal = DialogPrimitive.Portal;")).toBe(
      true,
    );

    // 対象にしてはいけない形: エディタ内へ出す Portal と、単なる利用側。
    expect(portalsToBody("return createPortal(<Toolbar />, anchorElem);")).toBe(
      false,
    );
    expect(
      portalsToBody("<DropdownMenu><DropdownMenuContent /></DropdownMenu>"),
    ).toBe(false);

    // 素の z-index utility の検出も、見本で両側を固定する。
    expect(RAW_Z_INDEX_CLASS.test('className="fixed z-50 rounded-lg"')).toBe(
      true,
    );
    expect(RAW_Z_INDEX_CLASS.test('className="fixed z-[90] rounded-lg"')).toBe(
      true,
    );
    expect(
      RAW_Z_INDEX_CLASS.test("className={cn(PORTAL_LAYER_CLASS, className)}"),
    ).toBe(false);
  });

  test("Portal 層クラスだけで重なり順を決める", () => {
    const offenders: string[] = [];

    for (const file of portalled) {
      const code = stripComments(readFileSync(join(ADMIN_DIR, file), "utf8"));

      if (!code.includes("PORTAL_LAYER_CLASS")) {
        offenders.push(
          `${file}: body へ Portal しているのに PORTAL_LAYER_CLASS が無い`,
        );
      }
      if (RAW_Z_INDEX_CLASS.test(code)) {
        offenders.push(
          `${file}: 素の z-index utility を持っている — Portal 層は 1 値だけ`,
        );
      }
      for (const mechanism of OWN_LAYERING_MECHANISMS) {
        if (code.includes(mechanism)) {
          offenders.push(`${file}: ${mechanism} で固有の重なり順を持っている`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
