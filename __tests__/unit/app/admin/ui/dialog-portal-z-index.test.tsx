/**
 * admin Dialog / AlertDialog — portal 越しの z-index token 適用 regression test.
 *
 * Radix の `Portal` は `useState(false)` + layout effect で mount を 1 render 遅らせる
 * (`@radix-ui/react-portal`: `container ? createPortal(...) : null`)。そのため
 * `<DialogContent>` を返すコンポーネント自身の mount effect は **ノードがまだ無い状態**で
 * 走り、`useAdminZIndexImperative` は early return する。2 render 目でノードが生えても
 * effect の deps は変わらないため再実行されず、content の `--admin-z-index` は永久に
 * 未設定 = `z-index: auto` になる。
 *
 * 一方 overlay は「2 render 目に初めて mount される子コンポーネント」なので自分の
 * effect が正しく走り、`--admin-z-index: 85` を得る。結果として overlay が content の
 * 上に乗り、admin の全 Dialog がクリックを受け付けなくなる（Playwright の
 * "intercepts pointer events"、run 30569714860 の content-preview /
 * lexical-inline-icon / space-rate-plan-crud 失敗）。
 *
 * 本テストは content と overlay の双方に token が載ることを実 DOM で固定する。
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/app/(admin)/admin/(dashboard)/_shared/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
} from "@/app/(admin)/admin/(dashboard)/_shared/components/ui/alert-dialog";
import { Z_INDEX } from "@/admin/lib/styles/z-index";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeEach(() => {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

async function renderNode(node: React.ReactNode): Promise<void> {
  await act(async () => root?.render(node));
}

function readZIndexVar(element: Element | null): string {
  if (!(element instanceof HTMLElement)) return "";
  return element.style.getPropertyValue("--admin-z-index").trim();
}

describe("admin dialog z-index token survives Radix portal mount", () => {
  test("DialogContent と overlay の双方に token が載る", async () => {
    await renderNode(
      <Dialog open>
        <DialogContent>
          <DialogTitle>料金プランを追加</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const content = window.document.querySelector('[role="dialog"]');
    const overlay = window.document.querySelector("div.bg-overlay");

    expect(content).not.toBeNull();
    expect(overlay).not.toBeNull();

    expect(readZIndexVar(content)).toBe(Z_INDEX.dialog.toString());
    expect(readZIndexVar(overlay)).toBe(Z_INDEX.dialogOverlay.toString());
  });

  test("content は overlay より上のレイヤーに解決される", async () => {
    await renderNode(
      <Dialog open>
        <DialogContent>
          <DialogTitle>重なり順</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const content = Number(
      readZIndexVar(window.document.querySelector('[role="dialog"]')),
    );
    const overlay = Number(
      readZIndexVar(window.document.querySelector("div.bg-overlay")),
    );

    expect(Number.isNaN(content)).toBe(false);
    expect(Number.isNaN(overlay)).toBe(false);
    expect(content).toBeGreaterThan(overlay);
  });

  test("AlertDialogContent にも同じ token が載る", async () => {
    await renderNode(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>匿名化しますか？</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    );

    const content = window.document.querySelector('[role="alertdialog"]');

    expect(content).not.toBeNull();
    expect(readZIndexVar(content)).toBe(Z_INDEX.dialog.toString());
  });
});
