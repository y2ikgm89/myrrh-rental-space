/**
 * 区切り線の挿入を、**ロジックと配線の両方**で固定する。
 *
 * `@lexical/react/LexicalHorizontalRulePlugin` は `@deprecated` だが、案内される
 * 移行先（`@lexical/extension` の `HorizontalRuleExtension`）は extension host 前提で、
 * `LexicalComposer` で組んだこのエディタには当てはまらない。そこで同等の
 * コマンド登録をローカルに置き直した。
 *
 * テストが 2 段あるのは意図的:
 *
 * 1. `$insertHorizontalRuleAtSelection` — 挿入ロジック（headless）
 * 2. `HorizontalRulePlugin` を **mount して dispatch** — 配線
 *
 * 1 だけだと、コマンドの登録先を間違えても（別のコマンドオブジェクト・
 * priority 違い・effect が動かない）テストは緑のままになる。insert メニューの
 * 「区切り線」は `config/insert-items/structure.ts` が
 * `INSERT_HORIZONTAL_RULE_COMMAND` を dispatch する経路なので、そこを 2 で通す。
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, createRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createHeadlessEditor } from "@lexical/headless";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import {
  HorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND,
  $isHorizontalRuleNode,
} from "@lexical/extension";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setSelection,
  type LexicalEditor,
} from "lexical";

import { installJSDOMForTests } from "../../../../setup-dom";
import { EditorRefPlugin } from "@/admin/components/editor/lexical/internal-plugins/EditorRefPlugin";
import {
  $insertHorizontalRuleAtSelection,
  HorizontalRulePlugin,
} from "@/admin/components/editor/lexical/plugins/HorizontalRulePlugin";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

function seedParagraphWithSelection(): void {
  const paragraph = $createParagraphNode();
  paragraph.append($createTextNode("本文"));
  $getRoot().clear().append(paragraph);
  paragraph.selectEnd();
}

/**
 * `editor.getEditorState().read()` ではなく `editor.read()` を使う。
 *
 * `dispatchCommand` は handler を pending update の中で走らせるだけで、その場では
 * commit しない。`getEditorState()` は **commit 済みの状態**を返すので、dispatch
 * 直後に読むと挿入前の状態が見え、「配線は動いているのに挿入されていない」と
 * 誤読する（実際にそう読み違えた）。`editor.read()` は pending を flush してから
 * 読む。
 */
function hasHorizontalRule(editor: LexicalEditor): boolean {
  return editor.read(() =>
    $getRoot().getChildren().some($isHorizontalRuleNode),
  );
}

// =============================================================================
// 1. 挿入ロジック（headless）
// =============================================================================

describe("$insertHorizontalRuleAtSelection", () => {
  const createEditor = () =>
    createHeadlessEditor({
      namespace: "horizontal-rule-test",
      nodes: [HorizontalRuleNode],
      onError: (error) => {
        throw error;
      },
    });

  test("range 選択があれば root 直下に HorizontalRuleNode を挿入して true を返す", () => {
    const editor = createEditor();
    let returned: boolean | undefined;

    editor.update(
      () => {
        seedParagraphWithSelection();
        returned = $insertHorizontalRuleAtSelection();
      },
      { discrete: true },
    );

    expect(returned).toBe(true);
    expect(hasHorizontalRule(editor)).toBe(true);
  });

  test("選択が無ければ挿入せず false を返す（他の handler に委ねる）", () => {
    const editor = createEditor();
    let returned: boolean | undefined;

    editor.update(
      () => {
        seedParagraphWithSelection();
        $setSelection(null);
        returned = $insertHorizontalRuleAtSelection();
      },
      { discrete: true },
    );

    expect(returned).toBe(false);
    expect(hasHorizontalRule(editor)).toBe(false);
  });
});

// =============================================================================
// 2. 配線（mount して dispatch）
// =============================================================================

describe("HorizontalRulePlugin の配線", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    installJSDOMForTests();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
  });

  function mount(editorRef: RefObject<LexicalEditor | null>): void {
    const el = document.createElement("div");
    document.body.appendChild(el);
    container = el;
    const localRoot = createRoot(el);
    root = localRoot;
    act(() => {
      localRoot.render(
        <LexicalComposer
          initialConfig={{
            namespace: "HorizontalRulePluginWiringTest",
            nodes: [HorizontalRuleNode],
            onError: (error: Error) => {
              throw error;
            },
          }}
        >
          <EditorRefPlugin editorRef={editorRef} />
          <HorizontalRulePlugin />
        </LexicalComposer>,
      );
    });
  }

  test("INSERT_HORIZONTAL_RULE_COMMAND の dispatch が区切り線を挿入する", () => {
    const editorRef = createRef<LexicalEditor | null>();
    mount(editorRef);

    const editor = editorRef.current;
    if (!editor) throw new Error("editor not mounted");

    act(() => {
      editor.update(seedParagraphWithSelection, { discrete: true });
    });
    expect(hasHorizontalRule(editor)).toBe(false);

    let handled = false;
    act(() => {
      handled = editor.dispatchCommand(
        INSERT_HORIZONTAL_RULE_COMMAND,
        undefined,
      );
    });

    // handler が登録されていなければ dispatch は false を返し、何も挿入されない。
    expect(handled).toBe(true);
    expect(hasHorizontalRule(editor)).toBe(true);
  });
});
