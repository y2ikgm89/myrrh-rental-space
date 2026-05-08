/**
 * useNodeUpdater Hook Tests
 *
 * @description ノード更新パターンのユニットテスト
 *
 * Note: useNodeUpdaterフック自体はReactコンポーネントコンテキストが必要なため、
 * ここではフックが依存する基盤（$getNodeByKey、型ガード、editor.update）の
 * 動作を検証する。
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import {
  $getRoot,
  $getNodeByKey,
  $getState,
  $setState,
  type LexicalEditor,
} from "lexical";

// テスト対象ノード
import {
  ButtonNode,
  $createButtonNode,
  $isButtonNode,
  buttonLabelState,
  buttonHrefState,
  buttonVariantState,
} from "@/admin/components/editor/lexical/nodes/ButtonNode";
import {
  ImageNode,
  $isImageNode,
} from "@/admin/components/editor/lexical/nodes/ImageNode";
import { createSpan, spansToPlainText } from "@/shared/lib/portable-text";

// =============================================================================
// Test Setup
// =============================================================================

function createTestEditor(): LexicalEditor {
  return createHeadlessEditor({
    namespace: "test",
    nodes: [ButtonNode, ImageNode],
    onError: (error) => {
      throw error;
    },
  });
}

// =============================================================================
// Tests
// =============================================================================

describe("useNodeUpdater pattern", () => {
  describe("$getNodeByKeyを使用したノード取得", () => {
    let editor: LexicalEditor;
    let buttonNodeKey: string;

    beforeEach(async () => {
      editor = createTestEditor();

      // ノードを作成してキーを取得
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        const buttonNode = $createButtonNode({
          label: [createSpan("初期テキスト")],
          href: "https://example.com",
          variant: "primary",
        });
        root.append(buttonNode);
        buttonNodeKey = buttonNode.getKey();
      });
    });

    test("nodeKeyからノードを取得できる", async () => {
      await editor.update(() => {
        const retrievedNode = $getNodeByKey(buttonNodeKey);

        expect(retrievedNode).not.toBeNull();
        expect($isButtonNode(retrievedNode)).toBe(true);
      });
    });

    test("型ガードが成功した場合、$setStateで更新できる", async () => {
      await editor.update(() => {
        const targetNode = $getNodeByKey(buttonNodeKey);
        if ($isButtonNode(targetNode)) {
          $setState(targetNode, buttonLabelState, [
            createSpan("更新後テキスト"),
          ]);
        }
      });

      // 更新が反映されていることを確認
      editor.getEditorState().read(() => {
        const node = $getNodeByKey(buttonNodeKey);
        if ($isButtonNode(node)) {
          expect(spansToPlainText($getState(node, buttonLabelState))).toBe(
            "更新後テキスト",
          );
        }
      });
    });

    test("型ガードが失敗した場合、更新は実行されない", async () => {
      let updaterCalled = false;

      await editor.update(() => {
        const targetNode = $getNodeByKey(buttonNodeKey);

        // 間違った型ガード（ImageNode）を使用
        if ($isImageNode(targetNode)) {
          updaterCalled = true;
        }
      });

      expect(updaterCalled).toBe(false);
    });

    test("存在しないnodeKeyの場合、nullが返る", async () => {
      await editor.update(() => {
        const targetNode = $getNodeByKey("non-existent-key");
        expect(targetNode).toBeNull();
      });
    });

    test("複数のプロパティを一度に更新できる", async () => {
      await editor.update(() => {
        const targetNode = $getNodeByKey(buttonNodeKey);
        if ($isButtonNode(targetNode)) {
          $setState(targetNode, buttonLabelState, [
            createSpan("新しいテキスト"),
          ]);
          $setState(targetNode, buttonHrefState, "https://new-url.com");
          $setState(targetNode, buttonVariantState, "secondary");
        }
      });

      editor.getEditorState().read(() => {
        const node = $getNodeByKey(buttonNodeKey);
        if ($isButtonNode(node)) {
          expect(spansToPlainText($getState(node, buttonLabelState))).toBe(
            "新しいテキスト",
          );
          expect($getState(node, buttonHrefState)).toBe("https://new-url.com");
          expect($getState(node, buttonVariantState)).toBe("secondary");
        }
      });
    });
  });

  describe("$setState/$getStateパターン", () => {
    let editor: LexicalEditor;

    beforeEach(() => {
      editor = createTestEditor();
    });

    test("$setStateでプロパティを更新し$getStateで読み取れる", async () => {
      let nodeKey: string;

      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        const buttonNode = $createButtonNode({
          label: [createSpan("テスト")],
          href: "#",
        });
        root.append(buttonNode);
        nodeKey = buttonNode.getKey();
      });

      // 更新前の状態を取得
      let originalText = "";
      editor.getEditorState().read(() => {
        const node = $getNodeByKey(nodeKey!);
        if ($isButtonNode(node)) {
          originalText = spansToPlainText($getState(node, buttonLabelState));
        }
      });

      expect(originalText).toBe("テスト");

      // 更新
      await editor.update(() => {
        const node = $getNodeByKey(nodeKey!);
        if ($isButtonNode(node)) {
          $setState(node, buttonLabelState, [createSpan("更新後")]);
        }
      });

      // 更新後の状態を確認
      editor.getEditorState().read(() => {
        const node = $getNodeByKey(nodeKey!);
        if ($isButtonNode(node)) {
          const updatedText = spansToPlainText(
            $getState(node, buttonLabelState),
          );
          expect(updatedText).toBe("更新後");
          expect(updatedText).not.toBe(originalText);
        }
      });
    });

    test("$getStateは最新の値を返す", async () => {
      let nodeKey: string;

      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        const buttonNode = $createButtonNode({
          label: [createSpan("初期値")],
          href: "#",
        });
        root.append(buttonNode);
        nodeKey = buttonNode.getKey();
      });

      // 複数回更新
      await editor.update(() => {
        const node = $getNodeByKey(nodeKey!);
        if ($isButtonNode(node)) {
          $setState(node, buttonLabelState, [createSpan("更新1")]);
        }
      });

      await editor.update(() => {
        const node = $getNodeByKey(nodeKey!);
        if ($isButtonNode(node)) {
          $setState(node, buttonLabelState, [createSpan("更新2")]);
        }
      });

      // 最新の値が取得できることを確認
      editor.getEditorState().read(() => {
        const node = $getNodeByKey(nodeKey!);
        if ($isButtonNode(node)) {
          expect(spansToPlainText($getState(node, buttonLabelState))).toBe(
            "更新2",
          );
        }
      });
    });
  });
});
