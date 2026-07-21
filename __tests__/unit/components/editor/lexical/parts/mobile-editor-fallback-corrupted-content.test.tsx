/**
 * @description `MobileEditorFallback` に未登録 node type を含む EditorState JSON を
 * 実際に渡し、`renderEditorStateJsonToHtmlClient`（内部で editor.parseEditorState +
 * editor.setEditorState を実行する）に到達する前に事前検証で弾かれ、
 * クラッシュせず `LexicalCorruptedContentNotice` が表示されることを確認する。
 *
 * `registered-node-types.test.ts` で実測した通り、この JSON をそのまま
 * `renderEditorStateJsonToHtmlClient` に渡すと isEmpty invariant（Lexical error #38）が
 * 同期 throw する（root の唯一の子が未登録 type のため import 段階でドロップされ、
 * root の子が 0 件になる）。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installJSDOMForTests } from "../../../../../setup-dom";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

// MobileEditorFallback → LexicalCorruptedContentNotice が useConfirm() /
// sonner の toast を無条件に参照する（onChange 未指定でもボタンを出さないだけで
// hook 自体は呼ぶ）ため、Radix AlertDialog 一式を持ち込まないよう mock する。
mock.module("@/admin/contexts/confirm-context", () => ({
  useConfirm: () => mock(async () => true),
}));
mock.module("sonner", () => ({
  toast: { success: mock(() => undefined), error: mock(() => undefined) },
  Toaster: () => null,
}));

const { MobileEditorFallback } =
  await import("@/admin/components/editor/lexical/parts/MobileEditorFallback");

/** root 直下の唯一の子が未登録 type（実害シナリオ A: 同期 throw） */
const SOLE_CHILD_UNKNOWN_JSON = JSON.stringify({
  root: {
    children: [{ type: "totally-unknown-widget", version: 1 }],
    direction: null,
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});

describe("MobileEditorFallback: 未登録 node type を含む JSON", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    installJSDOMForTests();
  });

  function unmount() {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
  }

  test("クラッシュせず LexicalCorruptedContentNotice を表示する（リセットボタンなし）", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const localRoot = createRoot(container);
    root = localRoot;

    expect(() => {
      act(() => {
        localRoot.render(
          <MobileEditorFallback contentJson={SOLE_CHILD_UNKNOWN_JSON} />,
        );
      });
    }).not.toThrow();

    expect(container.textContent).toContain("本文を読み込めません");
    expect(container.textContent).toContain("totally-unknown-widget");

    // MobileEditorFallback は onChange を受け取らないため、
    // 破棄不能な読み取り専用プレビューとしてリセットボタンは出さない
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(
      buttons.some((button) =>
        button.textContent?.includes("リセットして編集を続ける"),
      ),
    ).toBe(false);

    unmount();
  });
});
