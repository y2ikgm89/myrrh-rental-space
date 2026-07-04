import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { $createImageNode } from "@/admin/components/editor/lexical/nodes/ImageNode";
import { tryConvertHtmlStringToLexicalJsonCore } from "@/admin/components/editor/lexical/html-to-lexical-json-core";
import { renderEditorStateJsonToHtmlCore } from "@/admin/components/editor/lexical/preview/render-editor-state-json-to-html-core";
import {
  EDITOR_NODES,
  HEADLESS_EDITOR_NODES,
} from "@/admin/components/editor/lexical/config/nodes";
import { collectLexicalEditorStateNodeTypes } from "@/shared/lib/lexical/collect-editor-state-node-types";
import { createHeadlessEditor } from "@lexical/headless";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { $createCalloutNode } from "@/admin/components/editor/lexical/nodes/CalloutNode";
import { editorTheme } from "@/admin/components/editor/lexical/theme";

const LEXICAL_NODES_DIR =
  "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes";

describe("Lexical editor nodes SSoT", () => {
  test("HEADLESS_EDITOR_NODES と EDITOR_NODES は同一参照", () => {
    expect(HEADLESS_EDITOR_NODES).toBe(EDITOR_NODES);
  });

  test("node class modules は server/headless で実体 import できるよう client boundary にしない", () => {
    const offenders: string[] = [];
    const glob = new Bun.Glob("*.{ts,tsx}");

    for (const rel of glob.scanSync({ cwd: LEXICAL_NODES_DIR })) {
      const normalized = rel.replaceAll("\\", "/");
      if (
        normalized.includes(".client.") ||
        normalized === "register-decorator-components.client.ts"
      ) {
        continue;
      }

      const source = readFileSync(`${LEXICAL_NODES_DIR}/${normalized}`, "utf8");
      if (source.includes('"use client";')) {
        offenders.push(normalized);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("headless で ImageNode を含む JSON → HTML が exportDOM 経由で出力される", () => {
    const editor = createHeadlessEditor({
      namespace: "test",
      theme: editorTheme,
      nodes: [...HEADLESS_EDITOR_NODES],
      onError: () => {},
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        root.append(
          $createImageNode({
            src: "https://example.com/test.jpg",
            alt: "test alt",
          }),
        );
      },
      { discrete: true },
    );

    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(collectLexicalEditorStateNodeTypes(json).has("image")).toBe(true);

    const html = renderEditorStateJsonToHtmlCore(json);
    expect(html).toContain('data-image="true"');
    expect(html).toContain("https://example.com/test.jpg");
    expect(html).toContain("test alt");
  });

  test("callout JSON → HTML で data-callout-type が出力される", () => {
    const editor = createHeadlessEditor({
      namespace: "test-callout",
      theme: editorTheme,
      nodes: [...HEADLESS_EDITOR_NODES],
      onError: () => {},
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const callout = $createCalloutNode("warning");
        callout.append($createParagraphNode().append($createTextNode("重要")));
        root.append(callout);
      },
      { discrete: true },
    );

    const json = JSON.stringify(editor.getEditorState().toJSON());
    const html = renderEditorStateJsonToHtmlCore(json);
    expect(html).toContain('data-callout-type="warning"');
  });

  test("HTML import で hr と table を Lexical ノード化できる", () => {
    const html = `<hr><table><tr><td>セル</td></tr></table>`;
    const result = tryConvertHtmlStringToLexicalJsonCore(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const types = collectLexicalEditorStateNodeTypes(result.json);
    expect(types.has("horizontalrule")).toBe(true);
    expect(types.has("table") || types.has("custom-table")).toBe(true);
  });
});
