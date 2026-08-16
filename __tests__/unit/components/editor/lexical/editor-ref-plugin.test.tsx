/**
 * EditorRefPlugin は mount 駆動で editor を束縛する。
 *
 * 旧実装は OnChangePlugin 経由でのみ ref を更新していたため、
 * 下書き復元（key remount）直後は unmount 済みの旧 editor を指したまま
 * persist できた（Codex P1 / PR#2398 残件）。
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, createRef, useState, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import type { LexicalEditor } from "lexical";

import { installJSDOMForTests } from "../../../../setup-dom";
import { EditorRefPlugin } from "@/admin/components/editor/lexical/internal-plugins/EditorRefPlugin";
import { resolvePersistableEditorJson } from "@/admin/components/editor/lexical/read-latest-editor-json";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

const STALE_BODY = "復元前の本文";
const RESTORED_BODY = "復元した下書き本文";

function editorStateJsonWithText(text: string): string {
  return JSON.stringify({
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: "normal",
              style: "",
              text,
              type: "text",
              version: 1,
            },
          ],
          direction: null,
          format: "",
          indent: 0,
          type: "paragraph",
          version: 1,
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  });
}

const STALE_JSON = editorStateJsonWithText(STALE_BODY);
const RESTORED_JSON = editorStateJsonWithText(RESTORED_BODY);

function composerConfig(editorState: string) {
  return {
    namespace: "EditorRefPluginTest",
    onError: (error: Error) => {
      throw error;
    },
    nodes: [],
    editorState,
  };
}

function MountedEditor({
  editorRef,
  editorState,
  resetKey,
}: {
  editorRef: RefObject<LexicalEditor | null>;
  editorState: string;
  resetKey: number;
}) {
  return (
    <LexicalComposer key={resetKey} initialConfig={composerConfig(editorState)}>
      <EditorRefPlugin editorRef={editorRef} />
    </LexicalComposer>
  );
}

function RemountHarness({
  editorRef,
  onReady,
}: {
  editorRef: RefObject<LexicalEditor | null>;
  onReady: (remount: () => void) => void;
}) {
  const [resetKey, setResetKey] = useState(0);
  const [editorState, setEditorState] = useState(STALE_JSON);
  onReady(() => {
    setEditorState(RESTORED_JSON);
    setResetKey((prev) => prev + 1);
  });
  return (
    <MountedEditor
      editorRef={editorRef}
      editorState={editorState}
      resetKey={resetKey}
    />
  );
}

describe("EditorRefPlugin", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    installJSDOMForTests();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
  });

  test("key remount 後は onChange なしで新しい editor を persist する", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    container = el;
    const localRoot = createRoot(el);
    root = localRoot;
    const editorRef = createRef<LexicalEditor | null>();
    let remount = (): void => {
      throw new Error("remount not ready");
    };

    act(() => {
      localRoot.render(
        <RemountHarness
          editorRef={editorRef}
          onReady={(next) => {
            remount = next;
          }}
        />,
      );
    });

    expect(editorRef.current).not.toBeNull();
    const preRestoreEditor = editorRef.current;
    expect(
      JSON.stringify(preRestoreEditor?.getEditorState().toJSON()),
    ).toContain(STALE_BODY);

    act(() => {
      preRestoreEditor?.update(() => {
        const rootNode = $getRoot();
        rootNode.clear();
        rootNode.append(
          $createParagraphNode().append($createTextNode("復元前の追記")),
        );
      });
    });

    act(() => {
      remount();
    });

    expect(editorRef.current).not.toBe(preRestoreEditor);
    const persisted = resolvePersistableEditorJson({
      editor: editorRef.current,
      reactJson: STALE_JSON,
    });
    expect(persisted).toContain(RESTORED_BODY);
    expect(persisted).not.toContain(STALE_BODY);
    expect(persisted).not.toContain("復元前の追記");
  });
});
