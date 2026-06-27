import { describe, expect, test } from "bun:test";
import { sanitizeLexicalContentHtml } from "@/shared/lib/html/sanitize-content-html-core";
import { finalizeLexicalExportedHtml } from "@/shared/lib/html/lexical-content-html-pipeline.server";
import { enrichLexicalContentHtmlWithCuratedIcons } from "@/shared/lib/html/enrich-lexical-content-html-icons.server";
import { renderEditorStateJsonToHtmlCore } from "@/admin/components/editor/lexical/preview/render-editor-state-json-to-html-core";
import { HEADLESS_EDITOR_NODES } from "@/admin/components/editor/lexical/config/nodes";
import { createHeadlessEditor } from "@lexical/headless";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { editorTheme } from "@/admin/components/editor/lexical/theme";
import { $createInlineIconNode } from "@/admin/components/editor/lexical/nodes/InlineIconNode";
import {
  $createFeatureIconItemNode,
  $createFeatureIconListContainerNode,
} from "@/admin/components/editor/lexical/nodes/FeatureIconListNode";
import { $createButtonNode } from "@/admin/components/editor/lexical/nodes/ButtonNode";
import { createSpan, createInlineIcon } from "@/shared/lib/portable-text";

describe("Lexical icon export + sanitize pipeline", () => {
  test("exportDOM は SVG を含まず data-icon-name のみ出力する", () => {
    const editor = createHeadlessEditor({
      namespace: "icon-export",
      theme: editorTheme,
      nodes: [...HEADLESS_EDITOR_NODES],
      onError: () => {},
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();

        const list = $createFeatureIconListContainerNode({ iconSize: "md" });
        const item = $createFeatureIconItemNode({ iconName: "IconStar" });
        item.append($createParagraphNode().append($createTextNode("設備")));
        list.append(item);

        const para = $createParagraphNode();
        para.append($createTextNode("本文"));
        para.append($createInlineIconNode("IconHeart"));
        para.append($createTextNode("続き"));

        root.append(list);
        root.append(para);
        root.append(
          $createButtonNode({
            label: [createSpan("予約"), createInlineIcon("IconArrowRight")],
            href: "/book",
          }),
        );
      },
      { discrete: true },
    );

    const json = JSON.stringify(editor.getEditorState().toJSON());
    const html = renderEditorStateJsonToHtmlCore(json);

    expect(html).toContain('data-icon-name="IconStar"');
    expect(html).toContain('data-icon-name="IconHeart"');
    expect(html).toContain("data-button-icon");
    expect(html).not.toMatch(/<svg[\s>]/);
  });

  test("enrich + sanitize で curated SVG が保持される", () => {
    const placeholder =
      '<span data-lexical-inline-icon data-icon-name="IconStar" aria-hidden="true"></span>';

    const enriched = enrichLexicalContentHtmlWithCuratedIcons(placeholder);
    expect(enriched).toMatch(/<svg[\s>]/);
    expect(enriched).toContain("data-icon-svg");

    const finalized = finalizeLexicalExportedHtml(placeholder);
    expect(finalized).toMatch(/<svg[\s>]/);
    expect(finalized).toContain('data-icon-name="IconStar"');
  });

  test("sanitize は非 curated の SVG を除去する", () => {
    const malicious =
      '<span data-lexical-inline-icon data-icon-name="IconStar">' +
      '<svg onload="alert(1)"><script>alert(1)</script><path d="M0 0"/></svg></span>';

    const sanitized = sanitizeLexicalContentHtml(malicious);
    expect(sanitized).not.toMatch(/<script[\s>]/);
    expect(sanitized).not.toContain("onload");
  });

  test("ButtonNode exportDOM は label icon を data-button-icon トークンとして出力する", () => {
    const editor = createHeadlessEditor({
      namespace: "button-icon",
      theme: editorTheme,
      nodes: [...HEADLESS_EDITOR_NODES],
      onError: () => {},
    });

    editor.update(
      () => {
        $getRoot().append(
          $createButtonNode({
            label: [createSpan("CTA"), createInlineIcon("IconArrowRight")],
          }),
        );
      },
      { discrete: true },
    );

    const json = JSON.stringify(editor.getEditorState().toJSON());
    const html = renderEditorStateJsonToHtmlCore(json);
    expect(html).toContain("data-button-icon");
    expect(html).toContain('data-icon-name="IconArrowRight"');
  });
});
