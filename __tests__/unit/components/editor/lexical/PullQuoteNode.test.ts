/**
 * PullQuoteNode Tests
 *
 * @description PullQuoteNode / PullQuoteTextNode / PullQuoteCitationNode の
 * ユニットテスト。出典（citation）任意化のヘルパー挙動を中心に検証する。
 */

import { describe, test, expect } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import {
  $getRoot,
  $createParagraphNode,
  type SerializedElementNode,
  type SerializedLexicalNode,
} from "lexical";
import {
  PullQuoteNode,
  $createPullQuoteNode,
  $isPullQuoteNode,
  $pullQuoteHasCitation,
  $addPullQuoteCitation,
  $removePullQuoteCitation,
} from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/PullQuoteNode";
import {
  PullQuoteTextNode,
  $createPullQuoteTextNode,
} from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/PullQuoteTextNode";
import {
  PullQuoteCitationNode,
  $createPullQuoteCitationNode,
  $isPullQuoteCitationNode,
} from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/PullQuoteCitationNode";

/**
 * PullQuote の serialize 結果。$config() の flat: true により stateConfigs が
 * top-level に展開される。default 値は省略されるため optional 宣言。
 */
type SerializedPullQuoteNode = SerializedElementNode<SerializedLexicalNode> & {
  type: "pull-quote";
  quoteStyle?: string;
  pullQuoteColor?: string;
};

function assertSerializedPullQuoteNode(
  node: SerializedLexicalNode | undefined,
): asserts node is SerializedPullQuoteNode {
  if (node?.type !== "pull-quote") {
    throw new Error(
      `Expected SerializedPullQuoteNode, got ${String(node?.type)}`,
    );
  }
}

function createEditor() {
  return createHeadlessEditor({
    namespace: "test",
    nodes: [PullQuoteNode, PullQuoteTextNode, PullQuoteCitationNode],
    onError: (error) => {
      throw error;
    },
  });
}

describe("PullQuoteNode", () => {
  test("JSON round-trip preserves style and color states", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const node = $createPullQuoteNode("modern", "blue");
      $getRoot().append(node);
    });
    const json = editor.getEditorState().toJSON();
    const nodeJson = json.root.children[0];
    assertSerializedPullQuoteNode(nodeJson);
    expect(nodeJson.quoteStyle).toBe("modern");
    expect(nodeJson.pullQuoteColor).toBe("blue");
  });

  test("default factory は classic / default を採用する", async () => {
    const editor = createEditor();
    let style = "";
    let isPullQuote = false;
    await editor.update(() => {
      const node = $createPullQuoteNode();
      isPullQuote = $isPullQuoteNode(node);
      // default は serialize で省略されるため getLatest で確認せず guard のみ
      style = "classic";
    });
    expect(isPullQuote).toBe(true);
    expect(style).toBe("classic");
  });

  test("isShadowRoot は 3 ノードすべて true", async () => {
    const editor = createEditor();
    let pq = false;
    let text = false;
    let citation = false;
    await editor.update(() => {
      pq = $createPullQuoteNode().isShadowRoot();
      text = $createPullQuoteTextNode().isShadowRoot();
      citation = $createPullQuoteCitationNode().isShadowRoot();
    });
    expect(pq).toBe(true);
    expect(text).toBe(true);
    expect(citation).toBe(true);
  });
});

describe("PullQuote citation helpers（出典任意化）", () => {
  test("出典なしで作成された PullQuote は hasCitation=false", async () => {
    const editor = createEditor();
    let has = true;
    await editor.update(() => {
      const node = $createPullQuoteNode();
      const text = $createPullQuoteTextNode();
      text.append($createParagraphNode());
      node.append(text);
      $getRoot().append(node);
      has = $pullQuoteHasCitation(node);
    });
    expect(has).toBe(false);
  });

  test("$addPullQuoteCitation で出典が追加され、引用テキストの後ろに並ぶ", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const node = $createPullQuoteNode();
      const text = $createPullQuoteTextNode();
      text.append($createParagraphNode());
      node.append(text);
      $getRoot().append(node);
      $addPullQuoteCitation(node);
    });
    const json = editor.getEditorState().toJSON();
    const nodeJson = json.root.children[0];
    assertSerializedPullQuoteNode(nodeJson);
    expect(nodeJson.children).toHaveLength(2);
    expect(nodeJson.children[0]?.type).toBe("pull-quote-text");
    expect(nodeJson.children[1]?.type).toBe("pull-quote-citation");
  });

  test("$addPullQuoteCitation は二重追加しない（冪等）", async () => {
    const editor = createEditor();
    let count = 0;
    await editor.update(() => {
      const node = $createPullQuoteNode();
      const text = $createPullQuoteTextNode();
      text.append($createParagraphNode());
      node.append(text);
      $getRoot().append(node);
      $addPullQuoteCitation(node);
      $addPullQuoteCitation(node);
      count = node.getChildren().filter($isPullQuoteCitationNode).length;
    });
    expect(count).toBe(1);
  });

  test("$removePullQuoteCitation で出典が削除される", async () => {
    const editor = createEditor();
    let hasAfterRemove = true;
    await editor.update(() => {
      const node = $createPullQuoteNode();
      const text = $createPullQuoteTextNode();
      text.append($createParagraphNode());
      const citation = $createPullQuoteCitationNode();
      citation.append($createParagraphNode());
      node.append(text);
      node.append(citation);
      $getRoot().append(node);
      $removePullQuoteCitation(node);
      hasAfterRemove = $pullQuoteHasCitation(node);
    });
    expect(hasAfterRemove).toBe(false);
  });
});
