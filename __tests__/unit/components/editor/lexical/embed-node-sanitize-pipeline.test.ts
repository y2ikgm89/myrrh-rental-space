import { describe, expect, test } from "bun:test";
import { finalizeLexicalExportedHtml } from "@/shared/lib/html/lexical-content-html-pipeline";
import { renderEditorStateJsonToHtmlCore } from "@/admin/components/editor/lexical/preview/render-editor-state-json-to-html-core";
import { HEADLESS_EDITOR_NODES } from "@/admin/components/editor/lexical/config/nodes";
import { createHeadlessEditor } from "@lexical/headless";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { editorTheme } from "@/admin/components/editor/lexical/theme";
import { $createYouTubeNode } from "@/admin/components/editor/lexical/nodes/YouTubeNode";
import { $createAudioNode } from "@/admin/components/editor/lexical/nodes/AudioNode";
import { $createRubyNode } from "@/admin/components/editor/lexical/nodes/RubyNode";
import { $createCollapsibleContainerNode } from "@/admin/components/editor/lexical/nodes/CollapsibleContainerNode";
import { $createCollapsibleItemNode } from "@/admin/components/editor/lexical/nodes/CollapsibleItemNode";
import { $createCollapsibleTitleNode } from "@/admin/components/editor/lexical/nodes/CollapsibleTitleNode";
import { $createCollapsibleContentNode } from "@/admin/components/editor/lexical/nodes/CollapsibleContentNode";

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
});
