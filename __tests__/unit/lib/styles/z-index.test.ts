import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { Z_INDEX } from "@/admin/lib/styles/z-index";

const UI_DIR = "src/app/(admin)/admin/(dashboard)/_shared/components/ui";

/** Radix Portal 越しに描画される admin プリミティブ（token を CSS var で当てるもの）。 */
const PORTALLED_PRIMITIVES = [
  "alert-dialog.tsx",
  "dialog.tsx",
  "dropdown-menu.tsx",
  "popover.tsx",
  "select.tsx",
  "tooltip.tsx",
] as const;

describe("admin z-index tokens", () => {
  test("mobile drawer sits above page overlay and layout chrome", () => {
    expect(Z_INDEX.header).toBeGreaterThan(Z_INDEX.sidebar);
    expect(Z_INDEX.overlay).toBeGreaterThan(Z_INDEX.header);
    expect(Z_INDEX.sidebarDrawer).toBeGreaterThan(Z_INDEX.overlay);
  });

  test("interactive popups stay below page overlay", () => {
    expect(Z_INDEX.dropdown).toBeGreaterThan(Z_INDEX.header);
    expect(Z_INDEX.popover).toBeGreaterThan(Z_INDEX.dropdown);
    expect(Z_INDEX.overlay).toBeGreaterThan(Z_INDEX.popover);
  });

  test("dialog layers render above fullscreen editors", () => {
    expect(Z_INDEX.dialogOverlay).toBeGreaterThan(Z_INDEX.editorFullscreen);
    expect(Z_INDEX.dialog).toBeGreaterThan(Z_INDEX.dialogOverlay);
    expect(Z_INDEX.toast).toBeGreaterThan(Z_INDEX.dialog);
  });
});

/**
 * Radix の `Portal` は `useState(false)` + layout effect で mount を 1 render 遅らせる。
 * そのため `<XContent>` を返すコンポーネント自身の mount effect はノード未生成の状態で
 * 走り、`useAdminZIndexImperative` だけでは `--admin-z-index` が永久に未設定になる
 * （= `z-index: auto`）。overlay(85) が content(auto) を覆い、admin の Dialog は
 * クリックを受け付けなくなる。ref callback で attach 時に当てる契約を固定する。
 */
describe("portalled admin primitives apply the z-index token on ref attach", () => {
  for (const file of PORTALLED_PRIMITIVES) {
    test(`${file} assigns the token from its ref callback`, () => {
      const source = readFileSync(join(process.cwd(), UI_DIR, file), "utf8");

      expect(source).toContain("Portal>");

      const refCallbacks = [
        ...source.matchAll(/ref=\{\(node\) => \{([\s\S]*?)\n\s*\}\}/gu),
      ].map((match) => match[1] ?? "");

      expect(refCallbacks.length).toBeGreaterThan(0);
      for (const body of refCallbacks) {
        expect(body).toContain("assignAdminZIndex(node,");
      }
    });
  }
});
