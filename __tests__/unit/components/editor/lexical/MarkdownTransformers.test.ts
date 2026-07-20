/**
 * MarkdownTransformers Tests
 *
 * @description EDITOR_TRANSFORMERS（CheckList / Table / Callout / PullQuote /
 * Highlight / Ruby）の export → import round-trip、および
 * $hasUnrepresentableMarkdownContent の検出ロジックを検証する
 */

import { describe, test, expect } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  $isTextNode,
  $isElementNode,
  $getState,
} from "lexical";
import {
  $convertToMarkdownString,
  $convertFromMarkdownString,
} from "@lexical/markdown";
import {
  $createListNode,
  $createListItemNode,
  $isListNode,
  $isListItemNode,
} from "@lexical/list";
import {
  $createTableRowNode,
  $isTableNode,
  $isTableRowNode,
  $isTableCellNode,
} from "@lexical/table";
import { HEADLESS_EDITOR_NODES } from "@/admin/components/editor/lexical/config/nodes";
import { EDITOR_TRANSFORMERS } from "@/admin/components/editor/lexical/MarkdownTransformers";
import { $hasUnrepresentableMarkdownContent } from "@/admin/components/editor/lexical/markdown-loss-detection";
import { $createCustomTableNode } from "@/admin/components/editor/lexical/nodes/CustomTableNode";
import { $createCustomTableCellNode } from "@/admin/components/editor/lexical/nodes/CustomTableCellNode";
import {
  $createCalloutNode,
  $isCalloutNode,
  calloutTypeState,
} from "@/admin/components/editor/lexical/nodes/CalloutNode";
import {
  $createPullQuoteNode,
  $isPullQuoteNode,
} from "@/admin/components/editor/lexical/nodes/PullQuoteNode";
import {
  $createPullQuoteTextNode,
  $isPullQuoteTextNode,
} from "@/admin/components/editor/lexical/nodes/PullQuoteTextNode";
import {
  $createPullQuoteCitationNode,
  $isPullQuoteCitationNode,
} from "@/admin/components/editor/lexical/nodes/PullQuoteCitationNode";
import {
  $createRubyNode,
  $isRubyNode,
  rubyBaseTextState,
  rubyTextState,
} from "@/admin/components/editor/lexical/nodes/RubyNode";
import { $createButtonNode } from "@/admin/components/editor/lexical/nodes/ButtonNode";
import { createSpan } from "@/shared/lib/portable-text";

function createEditor() {
  return createHeadlessEditor({
    namespace: "markdown-transformers-test",
    nodes: [...HEADLESS_EDITOR_NODES],
    onError: (error) => {
      throw error;
    },
  });
}

function readMarkdown(editor: ReturnType<typeof createEditor>): string {
  let markdown = "";
  editor.read(() => {
    markdown = $convertToMarkdownString(EDITOR_TRANSFORMERS);
  });
  return markdown;
}

function importMarkdown(
  editor: ReturnType<typeof createEditor>,
  markdown: string,
): void {
  editor.update(
    () => {
      $convertFromMarkdownString(markdown, EDITOR_TRANSFORMERS);
    },
    { discrete: true },
  );
}

describe("EDITOR_TRANSFORMERS round-trip", () => {
  test("CheckList: チェック状態がインポート/エクスポートで失われない", () => {
    const editor = createEditor();
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const list = $createListNode("check");
        const done = $createListItemNode(true);
        done.append($createTextNode("done"));
        const todo = $createListItemNode(false);
        todo.append($createTextNode("todo"));
        list.append(done, todo);
        root.append(list);
      },
      { discrete: true },
    );

    const markdown = readMarkdown(editor);
    expect(markdown).toContain("[x] done");
    expect(markdown).toContain("[ ] todo");

    importMarkdown(editor, markdown);

    editor.read(() => {
      const list = $getRoot().getFirstChild();
      expect($isListNode(list)).toBe(true);
      if (!$isListNode(list)) return;
      expect(list.getListType()).toBe("check");
      const [item1, item2] = list.getChildren();
      expect($isListItemNode(item1) && item1.getChecked()).toBe(true);
      expect(item1?.getTextContent()).toBe("done");
      expect($isListItemNode(item2) && item2.getChecked()).toBe(false);
      expect(item2?.getTextContent()).toBe("todo");
    });
  });

  test("Table: 単純な table が pipe-table 形式で round-trip する", () => {
    const editor = createEditor();
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();

        function buildRow(texts: string[]) {
          const row = $createTableRowNode();
          for (const text of texts) {
            const cell = $createCustomTableCellNode();
            const paragraph = $createParagraphNode();
            paragraph.append($createTextNode(text));
            cell.append(paragraph);
            row.append(cell);
          }
          return row;
        }

        const table = $createCustomTableNode();
        table.append(buildRow(["Fruit", "Color"]), buildRow(["Apple", "Red"]));
        root.append(table);
      },
      { discrete: true },
    );

    const markdown = readMarkdown(editor);
    expect(markdown).toContain("| Fruit | Color |");
    expect(markdown).toContain("| --- | --- |");
    expect(markdown).toContain("| Apple | Red |");

    importMarkdown(editor, markdown);

    editor.read(() => {
      const table = $getRoot().getFirstChild();
      expect($isTableNode(table)).toBe(true);
      if (!$isTableNode(table)) return;
      const rows = table.getChildren().filter($isTableRowNode);
      expect(rows).toHaveLength(2);
      const headerCells = rows[0]?.getChildren().filter($isTableCellNode) ?? [];
      expect(headerCells.map((cell) => cell.getTextContent())).toEqual([
        "Fruit",
        "Color",
      ]);
      const dataCells = rows[1]?.getChildren().filter($isTableCellNode) ?? [];
      expect(dataCells.map((cell) => cell.getTextContent())).toEqual([
        "Apple",
        "Red",
      ]);
    });
  });

  test("Callout: type と複数段落が > [!type] 形式で round-trip する", () => {
    const editor = createEditor();
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const callout = $createCalloutNode("warning");
        const p1 = $createParagraphNode();
        p1.append($createTextNode("注意事項A"));
        const p2 = $createParagraphNode();
        p2.append($createTextNode("注意事項B"));
        callout.append(p1, p2);
        root.append(callout);
      },
      { discrete: true },
    );

    const markdown = readMarkdown(editor);
    expect(markdown).toContain("> [!warning]");
    expect(markdown).toContain("> 注意事項A");
    expect(markdown).toContain("> 注意事項B");

    importMarkdown(editor, markdown);

    editor.read(() => {
      const callout = $getRoot().getFirstChild();
      expect($isCalloutNode(callout)).toBe(true);
      if (!$isCalloutNode(callout)) return;
      expect($getState(callout, calloutTypeState)).toBe("warning");
      const paragraphs = callout.getChildren();
      expect(paragraphs).toHaveLength(2);
      expect(paragraphs[0]?.getTextContent()).toBe("注意事項A");
      expect(paragraphs[1]?.getTextContent()).toBe("注意事項B");
    });
  });

  test("PullQuote: 引用テキストと出典が round-trip する", () => {
    const editor = createEditor();
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const pullQuote = $createPullQuoteNode();
        const textNode = $createPullQuoteTextNode();
        const textParagraph = $createParagraphNode();
        textParagraph.append($createTextNode("名言その1"));
        textNode.append(textParagraph);
        const citation = $createPullQuoteCitationNode();
        const citationParagraph = $createParagraphNode();
        citationParagraph.append($createTextNode("著者名"));
        citation.append(citationParagraph);
        pullQuote.append(textNode, citation);
        root.append(pullQuote);
      },
      { discrete: true },
    );

    const markdown = readMarkdown(editor);
    expect(markdown).toContain("> [!pull-quote]");
    expect(markdown).toContain("> 名言その1");
    expect(markdown).toContain("> [!pull-quote-citation]");
    expect(markdown).toContain("> 著者名");

    importMarkdown(editor, markdown);

    editor.read(() => {
      const pullQuote = $getRoot().getFirstChild();
      expect($isPullQuoteNode(pullQuote)).toBe(true);
      if (!$isPullQuoteNode(pullQuote)) return;
      const textNode = pullQuote.getChildren().find($isPullQuoteTextNode);
      const citation = pullQuote.getChildren().find($isPullQuoteCitationNode);
      expect(textNode?.getTextContent()).toBe("名言その1");
      expect(citation?.getTextContent()).toBe("著者名");
    });
  });

  test("Highlight: background-color の style が ==text== として round-trip する", () => {
    const editor = createEditor();
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        const highlighted = $createTextNode("重要");
        highlighted.setStyle("background-color: rgba(255, 235, 59, 0.4)");
        paragraph.append(
          $createTextNode("前"),
          highlighted,
          $createTextNode("後"),
        );
        root.append(paragraph);
      },
      { discrete: true },
    );

    const markdown = readMarkdown(editor);
    expect(markdown).toContain("==重要==");

    importMarkdown(editor, markdown);

    editor.read(() => {
      const paragraph = $getRoot().getFirstChild();
      expect($isElementNode(paragraph)).toBe(true);
      if (!$isElementNode(paragraph)) return;
      const highlighted = paragraph
        .getChildren()
        .find(
          (child) => $isTextNode(child) && child.getTextContent() === "重要",
        );
      expect($isTextNode(highlighted)).toBe(true);
      if ($isTextNode(highlighted)) {
        expect(highlighted.getStyle()).toContain("background-color");
      }
    });
  });

  test("Ruby: baseText/rubyText が @[ruby](base|ruby) として round-trip する", () => {
    const editor = createEditor();
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createRubyNode("漢字", "かんじ"));
        root.append(paragraph);
      },
      { discrete: true },
    );

    const markdown = readMarkdown(editor);
    expect(markdown).toContain("@[ruby](漢字|かんじ)");

    importMarkdown(editor, markdown);

    editor.read(() => {
      const paragraph = $getRoot().getFirstChild();
      expect($isElementNode(paragraph)).toBe(true);
      if (!$isElementNode(paragraph)) return;
      const ruby = paragraph.getChildren().find($isRubyNode);
      expect($isRubyNode(ruby)).toBe(true);
      if ($isRubyNode(ruby)) {
        expect($getState(ruby, rubyBaseTextState)).toBe("漢字");
        expect($getState(ruby, rubyTextState)).toBe("かんじ");
      }
    });
  });
});

describe("$hasUnrepresentableMarkdownContent", () => {
  test("通常のコンテンツのみなら false を返す", () => {
    const editor = createEditor();
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode("本文"));
        root.append(paragraph);
      },
      { discrete: true },
    );

    let result = true;
    editor.read(() => {
      result = $hasUnrepresentableMarkdownContent();
    });
    expect(result).toBe(false);
  });

  test("ButtonNode のような embed 系ノードが含まれる場合 true を返す", () => {
    const editor = createEditor();
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        root.append(
          $createButtonNode({ label: [createSpan("予約")], href: "/book" }),
        );
      },
      { discrete: true },
    );

    let result = false;
    editor.read(() => {
      result = $hasUnrepresentableMarkdownContent();
    });
    expect(result).toBe(true);
  });
});
