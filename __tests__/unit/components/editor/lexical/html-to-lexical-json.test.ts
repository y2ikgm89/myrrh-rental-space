/**
 * @description `tryConvertHtmlStringToLexicalJsonString` の smoke テスト
 * + ImageNode/ButtonNode/CustomTableCellNode/CustomHeadingNode の exportDOM→importDOM round-trip テスト
 */

import { beforeEach, describe, expect, test } from "bun:test";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getState,
  $setState,
} from "lexical";
import { $dfs } from "@lexical/utils";
import { $createTableRowNode } from "@lexical/table";

import { tryConvertHtmlStringToLexicalJsonString } from "@/admin/components/editor/lexical/html-to-lexical-json";
import { tryConvertHtmlStringToLexicalJsonCore } from "@/admin/components/editor/lexical/html-to-lexical-json-core";
import { renderEditorStateJsonToHtmlCore } from "@/admin/components/editor/lexical/preview/render-editor-state-json-to-html-core";
import { deriveLexicalContentHtmlFromJsonCore } from "@/admin/components/editor/lexical/preview/derive-lexical-content-html-core";
import { createProjectHeadlessEditor } from "@/admin/components/editor/lexical/create-headless-lexical-editor";
import {
  $createImageNode,
  $isImageNode,
  alignmentState,
  captionState,
  srcState,
} from "@/admin/components/editor/lexical/nodes/ImageNode";
import {
  $createButtonNode,
  $isButtonNode,
  buttonHrefState,
  buttonLabelState,
} from "@/admin/components/editor/lexical/nodes/ButtonNode";
import {
  $createCustomTableCellNode,
  $isCustomTableCellNode,
  cellBackgroundColorState,
} from "@/admin/components/editor/lexical/nodes/CustomTableCellNode";
import { $createCustomTableNode } from "@/admin/components/editor/lexical/nodes/CustomTableNode";
import {
  $createCustomHeadingNode,
  $isCustomHeadingNode,
  anchorIdState,
} from "@/admin/components/editor/lexical/nodes/CustomHeadingNode";
import {
  $createYouTubeNode,
  $isYouTubeNode,
  videoIdState as youTubeVideoIdState,
} from "@/admin/components/editor/lexical/nodes/YouTubeNode";
import {
  $createVimeoNode,
  $isVimeoNode,
  vimeoVideoIdState,
} from "@/admin/components/editor/lexical/nodes/VimeoNode";
import {
  $createXNode,
  $isXNode,
  tweetIdState,
} from "@/admin/components/editor/lexical/nodes/XNode";
import {
  $createInstagramNode,
  $isInstagramNode,
  postIdState,
} from "@/admin/components/editor/lexical/nodes/InstagramNode";
import {
  $isBookmarkNode,
  bookmarkUrlState,
} from "@/admin/components/editor/lexical/nodes/BookmarkNode";
import {
  $isFileNode,
  fileUrlState,
} from "@/admin/components/editor/lexical/nodes/FileNode";
import {
  $isInlineImageNode,
  inlineSrcState,
} from "@/admin/components/editor/lexical/nodes/InlineImageNode";
import { createInlineIcon, createSpan } from "@/shared/lib/portable-text";
import {
  EMPTY_LEXICAL_EDITOR_STATE_JSON,
  isLexicalComposerReadyEditorStateJson,
} from "@/shared/lib/validations/lexical";
import { installJSDOMForTests } from "../../../../setup-dom";

beforeEach(() => {
  installJSDOMForTests();
});

describe("tryConvertHtmlStringToLexicalJsonString", () => {
  test("空入力は意図した空ドキュメント（EMPTY）で成功", () => {
    expect(tryConvertHtmlStringToLexicalJsonString("")).toEqual({
      ok: true,
      json: EMPTY_LEXICAL_EDITOR_STATE_JSON,
    });
    expect(tryConvertHtmlStringToLexicalJsonString("   \n")).toEqual({
      ok: true,
      json: EMPTY_LEXICAL_EDITOR_STATE_JSON,
    });
  });

  test("単純な HTML は lexicalJsonSchema 準拠の JSON で成功", () => {
    const result = tryConvertHtmlStringToLexicalJsonString("<p>Hello</p>");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(isLexicalComposerReadyEditorStateJson(result.json)).toBe(true);
    }
  });
});

// =============================================================================
// exportDOM / importDOM round-trip parity (H)
//
// node 作成 → exportDOM で HTML 化 (renderEditorStateJsonToHtmlCore) →
// tryConvertHtmlStringToLexicalJsonCore で再度 JSON 化 → 元の state が
// 復元されていることを検証する。
// =============================================================================

describe("exportDOM/importDOM round-trip parity", () => {
  test("ImageNode: alignment と caption が round-trip で復元される", () => {
    const editor = createProjectHeadlessEditor();

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        root.append(
          $createImageNode({
            src: "https://example.com/photo.jpg",
            alt: "テスト画像",
            alignment: "right",
            caption: "写真のキャプション",
          }),
        );
      },
      { discrete: true },
    );

    const json = JSON.stringify(editor.getEditorState().toJSON());
    const html = renderEditorStateJsonToHtmlCore(json);
    expect(html).toContain('data-image-alignment="right"');
    expect(html).toContain("写真のキャプション");

    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    editor.setEditorState(editor.parseEditorState(result.json));
    editor.read(() => {
      const imageNode = $dfs()
        .map(({ node }) => node)
        .find($isImageNode);
      expect(imageNode).toBeDefined();
      if (!imageNode) return;
      expect($getState(imageNode, alignmentState)).toBe("right");
      expect($getState(imageNode, captionState)).toBe("写真のキャプション");
    });
  });

  test("ButtonNode: icon span + 複数 text span が round-trip で復元される", () => {
    const editor = createProjectHeadlessEditor();

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        root.append(
          $createButtonNode({
            label: [
              createSpan("予約する"),
              createInlineIcon("IconArrowRight"),
              createSpan("今すぐ"),
            ],
            href: "/book",
          }),
        );
      },
      { discrete: true },
    );

    const json = JSON.stringify(editor.getEditorState().toJSON());
    const html = renderEditorStateJsonToHtmlCore(json);
    expect(html).toContain("data-button-icon");
    expect(html).toContain('data-icon-name="IconArrowRight"');

    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    editor.setEditorState(editor.parseEditorState(result.json));
    editor.read(() => {
      const buttonNode = $dfs()
        .map(({ node }) => node)
        .find($isButtonNode);
      expect(buttonNode).toBeDefined();
      if (!buttonNode) return;
      const label = $getState(buttonNode, buttonLabelState).map((span) =>
        span._type === "span"
          ? { _type: span._type, text: span.text }
          : { _type: span._type, name: span.name },
      );
      expect(label).toEqual([
        { _type: "span", text: "予約する" },
        { _type: "iconInline", name: "IconArrowRight" },
        { _type: "span", text: "今すぐ" },
      ]);
    });
  });

  test("CustomTableCellNode: cellBackgroundColorState が round-trip で復元される", () => {
    const editor = createProjectHeadlessEditor();

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $createCustomTableNode();
        const row = $createTableRowNode();
        const cell = $createCustomTableCellNode();
        $setState(cell, cellBackgroundColorState, "rgb(255, 0, 0)");
        cell.append($createParagraphNode().append($createTextNode("セル本文")));
        row.append(cell);
        table.append(row);
        root.append(table);
      },
      { discrete: true },
    );

    const json = JSON.stringify(editor.getEditorState().toJSON());
    const html = renderEditorStateJsonToHtmlCore(json);
    expect(html).toContain("background-color");

    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    editor.setEditorState(editor.parseEditorState(result.json));
    editor.read(() => {
      const cellNode = $dfs()
        .map(({ node }) => node)
        .find($isCustomTableCellNode);
      expect(cellNode).toBeDefined();
      if (!cellNode) return;
      expect($getState(cellNode, cellBackgroundColorState)).toBe(
        "rgb(255, 0, 0)",
      );
    });
  });

  test("CustomHeadingNode: anchorId が round-trip で復元される", () => {
    const editor = createProjectHeadlessEditor();

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        root.append(
          $createCustomHeadingNode("h2", "my-anchor").append(
            $createTextNode("見出し"),
          ),
        );
      },
      { discrete: true },
    );

    const json = JSON.stringify(editor.getEditorState().toJSON());
    const html = renderEditorStateJsonToHtmlCore(json);
    expect(html).toContain('id="my-anchor"');

    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    editor.setEditorState(editor.parseEditorState(result.json));
    editor.read(() => {
      const headingNode = $dfs()
        .map(({ node }) => node)
        .find($isCustomHeadingNode);
      expect(headingNode).toBeDefined();
      if (!headingNode) return;
      expect($getState(headingNode, anchorIdState)).toBe("my-anchor");
    });
  });

  test("YouTube/Vimeo/X/Instagram: 混在ドキュメントでも各iframeが自ノード型として round-trip で復元される", () => {
    const editor = createProjectHeadlessEditor();

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        root.append(
          $createYouTubeNode({ videoId: "dQw4w9WgXcQ" }),
          $createVimeoNode({ videoId: "76979871" }),
          $createXNode({ tweetId: "1234567890123456" }),
          $createInstagramNode({ postId: "CqIbCzYMi5C" }),
        );
      },
      { discrete: true },
    );

    const json = JSON.stringify(editor.getEditorState().toJSON());
    const html = renderEditorStateJsonToHtmlCore(json);
    expect(html).toContain("youtube.com/embed/dQw4w9WgXcQ");
    expect(html).toContain("player.vimeo.com/video/76979871");
    expect(html).toContain("Tweet.html?id=1234567890123456");
    expect(html).toContain("instagram.com/p/CqIbCzYMi5C/embed");

    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    editor.setEditorState(editor.parseEditorState(result.json));
    editor.read(() => {
      const nodes = $dfs().map(({ node }) => node);

      const youTubeNode = nodes.find($isYouTubeNode);
      expect(youTubeNode).toBeDefined();
      if (youTubeNode) {
        expect($getState(youTubeNode, youTubeVideoIdState)).toBe("dQw4w9WgXcQ");
      }

      const vimeoNode = nodes.find($isVimeoNode);
      expect(vimeoNode).toBeDefined();
      if (vimeoNode) {
        expect($getState(vimeoNode, vimeoVideoIdState)).toBe("76979871");
      }

      const xNode = nodes.find($isXNode);
      expect(xNode).toBeDefined();
      if (xNode) {
        expect($getState(xNode, tweetIdState)).toBe("1234567890123456");
      }

      const instagramNode = nodes.find($isInstagramNode);
      expect(instagramNode).toBeDefined();
      if (instagramNode) {
        expect($getState(instagramNode, postIdState)).toBe("CqIbCzYMi5C");
      }
    });
  });
});

// =============================================================================
// XSS対策: 汎用HTMLペースト (Word/Google Docs等からの貼り付けを想定)
//
// tryConvertHtmlStringToLexicalJsonCore (importDOM のアローリスト式パース) と
// deriveLexicalContentHtmlFromJsonCore (保存/公開用の派生 HTML。sanitize-html の
// allowedTags/allowedAttributes/allowedSchemes/allowedIframeHostnames による
// 二重サニタイズを含む) の実パイプラインへ実際に XSS ベクタを通し、危険な
// マークアップ/属性/URL スキームが除去・無効化されることを固定化する回帰テスト。
// =============================================================================

describe("XSS対策: 汎用HTMLペースト", () => {
  test("<script> タグは JSON にも最終 HTML にも一切残らない（@lexical/html の IGNORE_TAGS）", () => {
    const html = "<p>本文</p><script>alert('xss')</script>";

    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.json.toLowerCase()).not.toContain("script");
    expect(result.json).not.toContain("alert");

    const finalHtml = deriveLexicalContentHtmlFromJsonCore(result.json);
    expect(finalHtml.toLowerCase()).not.toContain("<script");
    expect(finalHtml).not.toContain("alert(");
  });

  test("<img onerror> は importDOM が src/alt 以外を読まないため JSON にも最終 HTML にも残らない", () => {
    const html =
      '<img src="https://example.com/photo.png" alt="写真" onerror="alert(1)">';

    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.json).not.toContain("onerror");
    expect(result.json).not.toContain("alert");

    const editor = createProjectHeadlessEditor();
    editor.setEditorState(editor.parseEditorState(result.json));
    editor.read(() => {
      const imageNode = $dfs()
        .map(({ node }) => node)
        .find($isImageNode);
      expect(imageNode).toBeDefined();
      if (!imageNode) return;
      // src は正規の許可属性として保持される（onerror だけが無視される）
      expect($getState(imageNode, srcState)).toBe(
        "https://example.com/photo.png",
      );
    });

    const finalHtml = deriveLexicalContentHtmlFromJsonCore(result.json);
    expect(finalHtml).toContain("https://example.com/photo.png");
    expect(finalHtml).not.toContain("onerror");
    expect(finalHtml).not.toContain("alert(");
  });

  test('<a href="javascript:...">: LinkNode.sanitizeUrl が about:blank に強制変換し、sanitize-html の allowedSchemes 外として最終 HTML から href 属性ごと消える', () => {
    const html = '<a href="javascript:alert(1)">クリック</a>';

    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const finalHtml = deriveLexicalContentHtmlFromJsonCore(result.json);
    expect(finalHtml).not.toContain("javascript:");
    expect(finalHtml).not.toContain("href=");
    expect(finalHtml).toContain("クリック");
  });

  test("allowlist 外ホストの <iframe> は埋め込みノード化されず JSON にも最終 HTML にも残らない", () => {
    const html =
      '<p>前</p><iframe src="https://evil.example.com/payload"></iframe><p>後</p>';

    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.json).not.toContain("evil.example.com");

    const finalHtml = deriveLexicalContentHtmlFromJsonCore(result.json);
    expect(finalHtml).not.toContain("evil.example.com");
    expect(finalHtml.toLowerCase()).not.toContain("<iframe");
    // 前後のテキストは正常に残る
    expect(finalHtml).toContain("前");
    expect(finalHtml).toContain("後");
  });

  // ---------------------------------------------------------------------------
  // 再監査で発見: BookmarkNode/ButtonNode/FileNode は自ノードの marker 属性
  // (data-bookmark/data-button/data-file) を持つ <a href> を LinkNode.sanitizeUrl
  // 相当の検証なしで importDOM に取り込んでいた。汎用 <a href="javascript:...">
  // は既存の LinkNode 経路で保護されるが（上記テスト）、この3ノードは自ノードの
  // marker 属性さえ持たせれば同じ検証をバイパスできたため、node 側にも
  // sanitizeLexicalUrlScheme（LinkNode.sanitizeUrl と同じパターン）を追加した。
  // ---------------------------------------------------------------------------

  test('BookmarkNode: data-bookmark を持つ <a href="javascript:...">はimportDOM側でabout:blankに無害化され、最終HTMLからもhref属性が消える', () => {
    const html =
      '<div data-bookmark="true"><a href="javascript:alert(1)">クリック</a></div>';

    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.json).not.toContain("javascript:");
    expect(result.json).not.toContain("alert(");

    const editor = createProjectHeadlessEditor();
    editor.setEditorState(editor.parseEditorState(result.json));
    editor.read(() => {
      const bookmarkNode = $dfs()
        .map(({ node }) => node)
        .find($isBookmarkNode);
      expect(bookmarkNode).toBeDefined();
      if (!bookmarkNode) return;
      expect($getState(bookmarkNode, bookmarkUrlState)).toBe("about:blank");
    });

    const finalHtml = deriveLexicalContentHtmlFromJsonCore(result.json);
    expect(finalHtml).not.toContain("javascript:");
    expect(finalHtml).not.toContain("href=");
  });

  test('ButtonNode: data-button を持つ <a href="javascript:...">はimportDOM側でabout:blankに無害化され、最終HTMLからもhref属性が消える', () => {
    const html =
      '<div data-button="true"><a href="javascript:alert(1)">ボタン</a></div>';

    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.json).not.toContain("javascript:");
    expect(result.json).not.toContain("alert(");

    const editor = createProjectHeadlessEditor();
    editor.setEditorState(editor.parseEditorState(result.json));
    editor.read(() => {
      const buttonNode = $dfs()
        .map(({ node }) => node)
        .find($isButtonNode);
      expect(buttonNode).toBeDefined();
      if (!buttonNode) return;
      expect($getState(buttonNode, buttonHrefState)).toBe("about:blank");
    });

    const finalHtml = deriveLexicalContentHtmlFromJsonCore(result.json);
    expect(finalHtml).not.toContain("javascript:");
    expect(finalHtml).not.toContain("href=");
  });

  test('FileNode: data-file を持つ <a href="javascript:...">はimportDOM側でabout:blankに無害化され、最終HTMLからもhref属性が消える', () => {
    const html =
      '<a data-file="true" href="javascript:alert(1)" data-file-name="evil.txt">ダウンロード</a>';

    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.json).not.toContain("javascript:");
    expect(result.json).not.toContain("alert(");

    const editor = createProjectHeadlessEditor();
    editor.setEditorState(editor.parseEditorState(result.json));
    editor.read(() => {
      const fileNode = $dfs()
        .map(({ node }) => node)
        .find($isFileNode);
      expect(fileNode).toBeDefined();
      if (!fileNode) return;
      expect($getState(fileNode, fileUrlState)).toBe("about:blank");
    });

    const finalHtml = deriveLexicalContentHtmlFromJsonCore(result.json);
    expect(finalHtml).not.toContain("javascript:");
    expect(finalHtml).not.toContain("href=");
  });

  // ---------------------------------------------------------------------------
  // 再監査（PR #1367 の範囲外だった DecoratorNode 系）: ImageNode / InlineImageNode の
  // src は $convertImageElement / $convertImageFigureElement / $convertInlineImageElement
  // が getAttribute の生値を検証なしで読み、srcState も parseString のみだった
  // （CoverNode.backgroundImageUrl と同型のギャップ）。実測で確認した実際の挙動:
  // - contentJson（正本）には javascript: が生のまま残る（ImageNode/InlineImageNode 共通）
  // - <img src> は sanitize-html の allowedSchemesAppliedToAttributes が "src" を
  //   対象にしているため最終 HTML では属性ごと消える（ImageNode は最終出力上は無害）
  // - InlineImageNode の外側 <span data-src="..."> は "src" ではなく data-* 属性のため
  //   スキーム検証対象外で、javascript: が最終 HTML にも生き残る（実測で確認）
  // 既存の sanitizeLexicalUrlScheme（LinkNode.sanitizeUrl 相当、BookmarkNode/ButtonNode/
  // FileNode が使用）を import 時・state parse 時の両方に適用して閉じる。
  // ---------------------------------------------------------------------------

  test('ImageNode: <img src="javascript:...">はimportDOM側でabout:blankに無害化され、contentJson・最終HTMLのどちらにもjavascript:が残らない', () => {
    const html = '<img src="javascript:alert(1)" alt="probe">';
    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.json).not.toContain("javascript:");
    expect(result.json).not.toContain("alert(");

    const editor = createProjectHeadlessEditor();
    editor.setEditorState(editor.parseEditorState(result.json));
    editor.read(() => {
      const imageNode = $dfs()
        .map(({ node }) => node)
        .find($isImageNode);
      expect(imageNode).toBeDefined();
      if (!imageNode) return;
      expect($getState(imageNode, srcState)).toBe("about:blank");
    });

    const finalHtml = deriveLexicalContentHtmlFromJsonCore(result.json);
    expect(finalHtml).not.toContain("javascript:");
  });

  test('ImageNode: data-image figure 経由の <img src="javascript:...">も同様にimportDOM側で無害化される（$convertImageFigureElement 側の回帰確認）', () => {
    const html =
      '<figure data-image="true" data-image-alignment="center"><img src="javascript:alert(2)" alt="probe2" /></figure>';
    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.json).not.toContain("javascript:");

    const finalHtml = deriveLexicalContentHtmlFromJsonCore(result.json);
    expect(finalHtml).not.toContain("javascript:");
  });

  test("ImageNode: 通常の https 画像 URL は round-trip で保持される（allowlist の回帰確認）", () => {
    const html = '<img src="https://example.com/photo.png" alt="写真">';
    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const editor = createProjectHeadlessEditor();
    editor.setEditorState(editor.parseEditorState(result.json));
    editor.read(() => {
      const imageNode = $dfs()
        .map(({ node }) => node)
        .find($isImageNode);
      expect(imageNode).toBeDefined();
      if (!imageNode) return;
      expect($getState(imageNode, srcState)).toBe(
        "https://example.com/photo.png",
      );
    });
  });

  test('InlineImageNode: data-src="javascript:...">はimportDOM側でabout:blankに無害化され、contentJson・最終HTMLのどちらにもjavascript:が残らない（外側 span の data-src は sanitize-html の scheme 検証対象外のため import 時の無害化が唯一のガード）', () => {
    const html =
      '<span data-inline-image="true" data-src="javascript:alert(3)" data-alt="probe3" data-position="full" data-width="200"><img src="javascript:alert(3)" alt="probe3" style="width:100%;display:block;" /></span>';
    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.json).not.toContain("javascript:");
    expect(result.json).not.toContain("alert(");

    const editor = createProjectHeadlessEditor();
    editor.setEditorState(editor.parseEditorState(result.json));
    editor.read(() => {
      const inlineImageNode = $dfs()
        .map(({ node }) => node)
        .find($isInlineImageNode);
      expect(inlineImageNode).toBeDefined();
      if (!inlineImageNode) return;
      expect($getState(inlineImageNode, inlineSrcState)).toBe("about:blank");
    });

    const finalHtml = deriveLexicalContentHtmlFromJsonCore(result.json);
    expect(finalHtml).not.toContain("javascript:");
  });

  test("InlineImageNode: 通常の https 画像 URL は round-trip で保持される（allowlist の回帰確認）", () => {
    const html =
      '<span data-inline-image="true" data-src="https://example.com/inline.png" data-alt="inline" data-position="full" data-width="200"><img src="https://example.com/inline.png" alt="inline" style="width:100%;display:block;" /></span>';
    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const editor = createProjectHeadlessEditor();
    editor.setEditorState(editor.parseEditorState(result.json));
    editor.read(() => {
      const inlineImageNode = $dfs()
        .map(({ node }) => node)
        .find($isInlineImageNode);
      expect(inlineImageNode).toBeDefined();
      if (!inlineImageNode) return;
      expect($getState(inlineImageNode, inlineSrcState)).toBe(
        "https://example.com/inline.png",
      );
    });
  });
});
