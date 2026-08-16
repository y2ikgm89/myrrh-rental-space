/**
 * EditorRefPlugin
 *
 * LexicalComposer 外へ editor インスタンスを渡す公式パターン
 * （https://lexical.dev/docs/react/plugins — EditorRefPlugin）。
 * mount 時に ref を束縛し、unmount 時に null にする。OnChange 駆動ではない。
 */

"use client";

import { useLayoutEffect, type RefObject } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { LexicalEditor } from "lexical";

export function EditorRefPlugin({
  editorRef,
}: {
  editorRef: RefObject<LexicalEditor | null>;
}) {
  const [editor] = useLexicalComposerContext();

  useLayoutEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  return null;
}
