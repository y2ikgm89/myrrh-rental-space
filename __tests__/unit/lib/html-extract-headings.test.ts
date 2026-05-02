import { describe, expect, test } from "bun:test";
import {
  extractHeadingsFromHtml,
  injectHeadingAnchors,
  slugifyHeading,
} from "@/shared/lib/html/extract-headings";

describe("slugifyHeading", () => {
  test("ASCII 英数を小文字化しハイフン区切りにする", () => {
    expect(slugifyHeading("Hello World")).toBe("hello-world");
    expect(slugifyHeading("API Reference")).toBe("api-reference");
  });

  test("CJK 文字を保持する（GFM 互換）", () => {
    expect(slugifyHeading("事業者情報")).toBe("事業者情報");
    expect(slugifyHeading("Cookie ポリシー")).toBe("cookie-ポリシー");
  });

  test("記号・連続空白を整理する", () => {
    // GFM / rehype-slug 互換: 記号は除去し、空白由来のハイフンを連結
    expect(slugifyHeading("Q & A コーナー")).toBe("q-a-コーナー");
    expect(slugifyHeading("Q&A コーナー")).toBe("qa-コーナー");
    expect(slugifyHeading("  leading and trailing  ")).toBe(
      "leading-and-trailing",
    );
    expect(slugifyHeading("hello---world")).toBe("hello-world");
  });

  test("空文字は空文字を返す", () => {
    expect(slugifyHeading("")).toBe("");
    expect(slugifyHeading("   ")).toBe("");
    expect(slugifyHeading("!!!")).toBe("");
  });

  test("数字・アンダースコアを保持", () => {
    expect(slugifyHeading("section_1")).toBe("section_1");
    expect(slugifyHeading("Step 2: 申込")).toBe("step-2-申込");
  });
});

describe("extractHeadingsFromHtml", () => {
  test("h2 / h3 をドキュメント順に抽出する", () => {
    const html = "<h2>第1条</h2><p>本文</p><h3>1.1 詳細</h3><h2>第2条</h2>";
    expect(extractHeadingsFromHtml(html)).toEqual([
      { id: "第1条", text: "第1条", level: 2 },
      { id: "11-詳細", text: "1.1 詳細", level: 3 },
      { id: "第2条", text: "第2条", level: 2 },
    ]);
  });

  test("既存 id 属性を尊重する（Lexical CustomHeadingNode 経由）", () => {
    const html = '<h2 id="cancellation-policy">キャンセルポリシー</h2>';
    expect(extractHeadingsFromHtml(html)).toEqual([
      { id: "cancellation-policy", text: "キャンセルポリシー", level: 2 },
    ]);
  });

  test("重複 slug は -2, -3 で採番", () => {
    const html = "<h2>事業者情報</h2><h2>事業者情報</h2><h2>事業者情報</h2>";
    expect(extractHeadingsFromHtml(html).map((h) => h.id)).toEqual([
      "事業者情報",
      "事業者情報-2",
      "事業者情報-3",
    ]);
  });

  test("既存 id を予約して新規 slug と衝突回避", () => {
    const html = '<h2 id="foo">A</h2><h2>foo</h2>';
    expect(extractHeadingsFromHtml(html).map((h) => h.id)).toEqual([
      "foo",
      "foo-2",
    ]);
  });

  test("h1 / h4 / h5 / h6 は対象外", () => {
    const html = "<h1>タイトル</h1><h2>章</h2><h4>小見出し</h4>";
    expect(extractHeadingsFromHtml(html).map((h) => h.level)).toEqual([2]);
  });

  test("内側のインラインタグを strip してテキスト抽出", () => {
    const html = "<h2>第1条 <em>利用</em>規約</h2>";
    expect(extractHeadingsFromHtml(html)).toEqual([
      { id: "第1条-利用規約", text: "第1条 利用規約", level: 2 },
    ]);
  });

  test("HTML エンティティをデコードしてテキスト抽出", () => {
    const html = "<h2>Q&amp;A &nbsp; コーナー</h2>";
    const result = extractHeadingsFromHtml(html);
    expect(result[0]?.text).toBe("Q&A コーナー");
    expect(result[0]?.id).toBe("qa-コーナー");
  });

  test("空文字 / heading なし HTML は空配列", () => {
    expect(extractHeadingsFromHtml("")).toEqual([]);
    expect(extractHeadingsFromHtml("<p>段落のみ</p>")).toEqual([]);
  });

  test("空テキストの heading（タグだけ）はスキップ", () => {
    const html = "<h2></h2><h2>有効な見出し</h2>";
    expect(extractHeadingsFromHtml(html).map((h) => h.text)).toEqual([
      "有効な見出し",
    ]);
  });
});

describe("injectHeadingAnchors", () => {
  test("h2 / h3 に id 属性を自動付与する", () => {
    const html = "<h2>事業者情報</h2><h3>連絡先</h3>";
    expect(injectHeadingAnchors(html)).toBe(
      '<h2 id="事業者情報">事業者情報</h2><h3 id="連絡先">連絡先</h3>',
    );
  });

  test("既存 id を上書きしない", () => {
    const html = '<h2 id="custom-id">タイトル</h2>';
    expect(injectHeadingAnchors(html)).toBe(html);
  });

  test("重複 heading は -2, -3 で採番", () => {
    const html = "<h2>同じタイトル</h2><h2>同じタイトル</h2>";
    expect(injectHeadingAnchors(html)).toBe(
      '<h2 id="同じタイトル">同じタイトル</h2><h2 id="同じタイトル-2">同じタイトル</h2>',
    );
  });

  test("h1 / h4 は対象外（id 付与なし）", () => {
    const html = "<h1>タイトル</h1><h4>小見出し</h4>";
    expect(injectHeadingAnchors(html)).toBe(html);
  });

  test("extractHeadingsFromHtml と injectHeadingAnchors は同じ id を生成（SSR/Client 同期）", () => {
    const html =
      '<h2>事業者情報</h2><h2>事業者情報</h2><h2 id="reserved">予約済み</h2>';

    const extracted = extractHeadingsFromHtml(html).map((h) => h.id);
    const injected = injectHeadingAnchors(html);

    // 抽出した id がすべて inject 後の HTML に含まれる
    for (const id of extracted) {
      expect(injected).toContain(`id="${id}"`);
    }
  });

  test("空文字は空文字を返す", () => {
    expect(injectHeadingAnchors("")).toBe("");
  });
});
