/**
 * Disable Plugin
 *
 * @description エディタの編集を無効化するプラグイン
 */

"use client";

import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

export function DisablePlugin({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  return null;
}
