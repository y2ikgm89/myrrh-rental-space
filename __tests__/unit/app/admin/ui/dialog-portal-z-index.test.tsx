/**
 * admin Dialog / AlertDialog — Portal 層に乗ることの regression test。
 *
 * ## なぜ
 *
 * Dialog は overlay と content を**別々に** `document.body` へ Portal する。両者は
 * 同じ root stacking context の兄弟なので、`z-index` が等しければ重なり順は
 * DOM 順で決まる（overlay が先、content が後 = content が上）。
 *
 * ここが崩れると overlay が content を覆い、**ダイアログがクリックを一切受け付け
 * なくなる**。過去に実際そうなっている: content 側の z-index を mount 後の effect で
 * 当てていたため、Radix `Portal` の 1 render 遅れ mount（`useState(false)` +
 * layout effect）で content だけ値が付かず `z-index: auto` に落ちていた
 * （Playwright の "intercepts pointer events"、run 30569714860 の content-preview /
 * lexical-inline-icon / space-rate-plan-crud 失敗）。
 *
 * 現在は両者とも静的な `PORTAL_LAYER_CLASS` を持つだけなので、mount タイミングに
 * 依存する経路自体が無い。本テストはその形（同一クラス・DOM 順・命令的 z-index を
 * 持たないこと）を固定する。レイヤー設計そのものの gate は
 * `__tests__/unit/lib/styles/z-index.test.ts`。
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
import { PORTAL_LAYER_CLASS } from "@/admin/lib/styles/z-index";

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

function classListOf(element: Element | null): string[] {
  return element instanceof HTMLElement ? [...element.classList] : [];
}

function inlineZIndexOf(element: Element | null): string {
  if (!(element instanceof HTMLElement)) return "";
  return [
    element.style.zIndex,
    element.style.getPropertyValue("--admin-z-index"),
  ]
    .join("")
    .trim();
}

describe("admin dialog は Portal 層に乗る", () => {
  test("overlay と content の双方が同じ Portal 層クラスを持つ", async () => {
    await renderNode(
      <Dialog open>
        <DialogContent>
          <DialogTitle>料金プランを追加</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const content = window.document.querySelector('[role="dialog"]');
    const overlay = window.document.querySelector("div.bg-overlay");

    expect(classListOf(content)).toContain(PORTAL_LAYER_CLASS);
    expect(classListOf(overlay)).toContain(PORTAL_LAYER_CLASS);
  });

  test("content は overlay より DOM 順で後ろにある", async () => {
    await renderNode(
      <Dialog open>
        <DialogContent>
          <DialogTitle>重なり順</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const content = window.document.querySelector('[role="dialog"]');
    const overlay = window.document.querySelector("div.bg-overlay");

    expect(content).not.toBeNull();
    expect(overlay).not.toBeNull();

    const position =
      content && overlay ? overlay.compareDocumentPosition(content) : 0;
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  test("命令的な z-index を持たない", async () => {
    await renderNode(
      <Dialog open>
        <DialogContent>
          <DialogTitle>命令的 z-index なし</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(
      inlineZIndexOf(window.document.querySelector('[role="dialog"]')),
    ).toBe("");
    expect(
      inlineZIndexOf(window.document.querySelector("div.bg-overlay")),
    ).toBe("");
  });

  test("AlertDialogContent も同じ Portal 層クラスを持つ", async () => {
    await renderNode(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>匿名化しますか？</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    );

    expect(
      classListOf(window.document.querySelector('[role="alertdialog"]')),
    ).toContain(PORTAL_LAYER_CLASS);
  });
});
