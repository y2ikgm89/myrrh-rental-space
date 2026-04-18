import { describe, test, expect } from "bun:test";
import { extractHeadings } from "@/shared/lib/lexical/extract-headings";

type Node = {
  type?: string;
  tag?: string;
  text?: string;
  anchorId?: string;
  children?: readonly Node[];
};

function serialize(root: Node): string {
  return JSON.stringify({ root });
}

function headingNode(tag: string, text: string, anchorId: string): Node {
  return {
    type: "heading",
    tag,
    anchorId,
    children: [{ type: "text", text }],
  };
}

function paragraphNode(text: string): Node {
  return {
    type: "paragraph",
    children: [{ type: "text", text }],
  };
}

describe("extractHeadings", () => {
  describe("正常系", () => {
    test("h2 と h3 を抽出する（anchorId 付与済み）", () => {
      const json = serialize({
        type: "root",
        children: [
          headingNode("h2", "序章", "prologue"),
          paragraphNode("本文"),
          headingNode("h3", "詳細", "details"),
          headingNode("h2", "まとめ", "summary"),
        ],
      });

      const result = extractHeadings(json);
      expect(result).toEqual([
        { id: "prologue", text: "序章", level: 2 },
        { id: "details", text: "詳細", level: 3 },
        { id: "summary", text: "まとめ", level: 2 },
      ]);
    });

    test("ドキュメント順序を保持する", () => {
      const json = serialize({
        type: "root",
        children: [
          headingNode("h3", "A", "a"),
          headingNode("h2", "B", "b"),
          headingNode("h3", "C", "c"),
        ],
      });
      expect(extractHeadings(json).map((h) => h.id)).toEqual(["a", "b", "c"]);
    });

    test("カラムレイアウト等のネストされた heading も抽出する", () => {
      const json = serialize({
        type: "root",
        children: [
          {
            type: "layout-container",
            children: [
              {
                type: "layout-item",
                children: [headingNode("h2", "カラム内見出し", "col1")],
              },
            ],
          },
        ],
      });
      expect(extractHeadings(json)).toEqual([
        { id: "col1", text: "カラム内見出し", level: 2 },
      ]);
    });

    test("heading text 内の複数 text ノードを連結する", () => {
      const json = serialize({
        type: "root",
        children: [
          {
            type: "heading",
            tag: "h2",
            anchorId: "mixed",
            children: [
              { type: "text", text: "強調" },
              { type: "text", text: "された" },
              { type: "text", text: "見出し" },
            ],
          },
        ],
      });
      expect(extractHeadings(json)).toEqual([
        { id: "mixed", text: "強調された見出し", level: 2 },
      ]);
    });
  });

  describe("除外条件", () => {
    test("h1 / h4 / h5 / h6 は抽出しない", () => {
      const json = serialize({
        type: "root",
        children: [
          headingNode("h1", "大見出し", "h1a"),
          headingNode("h4", "小見出し", "h4a"),
          headingNode("h5", "さらに小", "h5a"),
          headingNode("h6", "最小", "h6a"),
          headingNode("h2", "通常", "h2a"),
        ],
      });
      expect(extractHeadings(json).map((h) => h.level)).toEqual([2]);
    });

    test("anchorId が空の heading は除外する（未マイグレーション記事）", () => {
      const json = serialize({
        type: "root",
        children: [
          headingNode("h2", "序章", ""),
          headingNode("h2", "まとめ", "summary"),
        ],
      });
      expect(extractHeadings(json)).toEqual([
        { id: "summary", text: "まとめ", level: 2 },
      ]);
    });

    test("anchorId フィールドが存在しない heading は除外する（legacy JSON）", () => {
      const json = serialize({
        type: "root",
        children: [
          {
            type: "heading",
            tag: "h2",
            children: [{ type: "text", text: "旧" }],
          },
        ],
      });
      expect(extractHeadings(json)).toEqual([]);
    });

    test("text が空の heading は除外する", () => {
      const json = serialize({
        type: "root",
        children: [
          { type: "heading", tag: "h2", anchorId: "empty", children: [] },
          headingNode("h2", "valid", "v"),
        ],
      });
      expect(extractHeadings(json).map((h) => h.id)).toEqual(["v"]);
    });
  });

  describe("異常系", () => {
    test("空文字列は空配列を返す", () => {
      expect(extractHeadings("")).toEqual([]);
    });

    test("不正な JSON は空配列を返す", () => {
      expect(extractHeadings("not json {")).toEqual([]);
    });

    test("root フィールドがない JSON は空配列を返す", () => {
      expect(extractHeadings(JSON.stringify({ notRoot: {} }))).toEqual([]);
    });

    test("heading ゼロの文書は空配列を返す", () => {
      const json = serialize({
        type: "root",
        children: [paragraphNode("本文のみ"), paragraphNode("見出しなし")],
      });
      expect(extractHeadings(json)).toEqual([]);
    });
  });
});
