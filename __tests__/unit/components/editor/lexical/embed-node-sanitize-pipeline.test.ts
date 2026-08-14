import { describe, expect, test } from "bun:test";
import { finalizeLexicalExportedHtml } from "@/shared/lib/html/lexical-content-html-pipeline";
import { renderEditorStateJsonToHtmlCore } from "@/admin/components/editor/lexical/preview/render-editor-state-json-to-html-core";
import { HEADLESS_EDITOR_NODES } from "@/admin/components/editor/lexical/config/nodes";
import { createHeadlessEditor } from "@lexical/headless";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { editorTheme } from "@/admin/components/editor/lexical/theme";
import { $createYouTubeNode } from "@/admin/components/editor/lexical/nodes/YouTubeNode";
import { $createAudioNode } from "@/admin/components/editor/lexical/nodes/AudioNode";
import { $createFigmaNode } from "@/admin/components/editor/lexical/nodes/FigmaNode";
import { $createMapEmbedNode } from "@/admin/components/editor/lexical/nodes/MapEmbedNode";
import { $createRubyNode } from "@/admin/components/editor/lexical/nodes/RubyNode";
import { $createCollapsibleContainerNode } from "@/admin/components/editor/lexical/nodes/CollapsibleContainerNode";
import { $createCollapsibleItemNode } from "@/admin/components/editor/lexical/nodes/CollapsibleItemNode";
import { $createCollapsibleTitleNode } from "@/admin/components/editor/lexical/nodes/CollapsibleTitleNode";
import { $createCollapsibleContentNode } from "@/admin/components/editor/lexical/nodes/CollapsibleContentNode";
import { $createTabsContainerNode } from "@/admin/components/editor/lexical/nodes/TabsContainerNode";
import { $createTabListNode } from "@/admin/components/editor/lexical/nodes/TabListNode";
import { $createTabTitleNode } from "@/admin/components/editor/lexical/nodes/TabTitleNode";
import { $createTabPanelNode } from "@/admin/components/editor/lexical/nodes/TabPanelNode";

/**
 * 保存パイプライン（$generateHtmlFromNodes → enrich → sanitize）を通しても
 * 埋め込み系 node の構造が無音破綻しないことを確認する回帰テスト。
 * sanitize-content-html-core.ts の allowlist 拡張前は iframe/audio/details/summary/ruby/rt
 * が discard され本文が silent に壊れていた。
 */
function renderToFinalHtml(build: () => void): string {
  const editor = createHeadlessEditor({
    namespace: "embed-sanitize-pipeline",
    theme: editorTheme,
    nodes: [...HEADLESS_EDITOR_NODES],
    onError: () => {},
  });

  editor.update(
    () => {
      $getRoot().clear();
      build();
    },
    { discrete: true },
  );

  const json = JSON.stringify(editor.getEditorState().toJSON());
  const rawHtml = renderEditorStateJsonToHtmlCore(json);
  return finalizeLexicalExportedHtml(rawHtml);
}

function queryExported(html: string, selector: string): Element | null {
  return new DOMParser()
    .parseFromString(html, "text/html")
    .querySelector(selector);
}

const FIGMA_EMBED_URL =
  "https://www.figma.com/embed?embed_host=share&url=https%3A%2F%2Fwww.figma.com%2Ffile%2Fabc";
const MAP_EMBED_URL = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3";

describe("埋め込み系 node の保存パイプライン round-trip", () => {
  test("YouTubeNode の iframe が保存後 HTML に残る", () => {
    const html = renderToFinalHtml(() => {
      $getRoot().append($createYouTubeNode({ videoId: "dQw4w9WgXcQ" }));
    });
    expect(html).toContain("<iframe");
    expect(html).toContain("www.youtube.com/embed/dQw4w9WgXcQ");
  });

  test("AudioNode の audio タグが保存後 HTML に残る", () => {
    const html = renderToFinalHtml(() => {
      $getRoot().append(
        $createAudioNode({ url: "https://cdn.example.com/a.mp3" }),
      );
    });
    expect(html).toContain("<audio");
    expect(html).toContain("https://cdn.example.com/a.mp3");
  });

  test("Collapsible(details/summary)が保存後 HTML に残る", () => {
    const html = renderToFinalHtml(() => {
      const container = $createCollapsibleContainerNode();
      const item = $createCollapsibleItemNode(true);

      const title = $createCollapsibleTitleNode();
      const titleParagraph = $createParagraphNode();
      titleParagraph.append($createTextNode("質問"));
      title.append(titleParagraph);

      const content = $createCollapsibleContentNode();
      const contentParagraph = $createParagraphNode();
      contentParagraph.append($createTextNode("回答"));
      content.append(contentParagraph);

      item.append(title, content);
      container.append(item);
      $getRoot().append(container);
    });
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("質問");
    expect(html).toContain("回答");
  });

  test("RubyNode の ruby/rt が保存後 HTML に残る", () => {
    const html = renderToFinalHtml(() => {
      const para = $createParagraphNode();
      para.append($createRubyNode("漢字", "かんじ"));
      $getRoot().append(para);
    });
    expect(html).toContain("<ruby");
    expect(html).toContain("<rt");
    expect(html).toContain("漢字");
    expect(html).toContain("かんじ");
  });

  test("FigmaNode のラベルは可視テキストと iframe title として残る", () => {
    const html = renderToFinalHtml(() => {
      $getRoot().append(
        $createFigmaNode({ embedUrl: FIGMA_EMBED_URL, label: "プロトタイプ" }),
      );
    });
    const labelEl = queryExported(html, "[data-figma-label-text]");
    expect(labelEl?.tagName).toBe("P");
    expect(labelEl?.textContent).toBe("プロトタイプ");
    expect(
      queryExported(html, "[data-figma]")?.getAttribute("data-figma-label"),
    ).toBe("プロトタイプ");
    expect(
      queryExported(html, "[data-figma] iframe")?.getAttribute("title"),
    ).toBe("プロトタイプ");
  });

  test("FigmaNode はラベル無しでも iframe に既定 title を付ける", () => {
    const html = renderToFinalHtml(() => {
      $getRoot().append($createFigmaNode({ embedUrl: FIGMA_EMBED_URL }));
    });
    expect(queryExported(html, "[data-figma-label-text]")).toBeNull();
    expect(
      queryExported(html, "[data-figma] iframe")?.getAttribute("title"),
    ).toBe("Figma デザイン");
  });

  test("MapEmbedNode のラベルは可視テキストと iframe title として残る", () => {
    const html = renderToFinalHtml(() => {
      $getRoot().append($createMapEmbedNode(MAP_EMBED_URL, "アクセスマップ"));
    });
    const labelEl = queryExported(html, "[data-map-label-text]");
    expect(labelEl?.tagName).toBe("P");
    expect(labelEl?.textContent).toBe("アクセスマップ");
    expect(
      queryExported(html, "[data-map]")?.getAttribute("data-map-label"),
    ).toBe("アクセスマップ");
    expect(
      queryExported(html, "[data-map] iframe")?.getAttribute("title"),
    ).toBe("アクセスマップ");
  });

  test("MapEmbedNode はラベル無しでも iframe に既定 title を付ける", () => {
    const html = renderToFinalHtml(() => {
      $getRoot().append($createMapEmbedNode(MAP_EMBED_URL));
    });
    expect(queryExported(html, "[data-map-label-text]")).toBeNull();
    expect(
      queryExported(html, "[data-map] iframe")?.getAttribute("title"),
    ).toBe("Google マップ");
  });

  test("lexical-content.css に [data-map] の埋め込み規則がある", async () => {
    const css = await Bun.file("src/shared/styles/lexical-content.css").text();
    expect(css).toMatch(/\[data-map\]\s*\{/);
    expect(css).toMatch(/\[data-map\]\s*>\s*iframe\s*\{/);
  });

  test('TabTitleNode の button は type="button" のまま残る', () => {
    const html = renderToFinalHtml(() => {
      const container = $createTabsContainerNode();
      const tabList = $createTabListNode();
      const title = $createTabTitleNode(0, true);
      const titleParagraph = $createParagraphNode();
      titleParagraph.append($createTextNode("タブ"));
      title.append(titleParagraph);
      tabList.append(title);

      const panel = $createTabPanelNode(0, true);
      const panelParagraph = $createParagraphNode();
      panelParagraph.append($createTextNode("内容"));
      panel.append(panelParagraph);

      container.append(tabList, panel);
      $getRoot().append(container);
    });
    const button = queryExported(html, 'button[role="tab"]');
    expect(button).not.toBeNull();
    expect(button?.getAttribute("type")).toBe("button");
  });
});
