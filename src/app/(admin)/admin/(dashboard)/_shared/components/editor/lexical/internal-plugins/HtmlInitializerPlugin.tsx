/**
 * HTML Initializer Plugin
 *
 * @description HTMLコンテンツからエディタ初期状態を生成するプラグイン
 */

"use client";

import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $generateNodesFromDOM } from "@lexical/html";
import { $getRoot, $insertNodes } from "lexical";

import { getErrorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";

type HtmlInitializerPluginProps = {
  content?: string;
};

export function HtmlInitializerPlugin({ content }: HtmlInitializerPluginProps) {
  const [editor] = useLexicalComposerContext();
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (hasInitializedRef.current || !content) return;

    try {
      editor.update(() => {
        const parser = new DOMParser();
        const dom = parser.parseFromString(content, "text/html");
        const nodes = $generateNodesFromDOM(editor, dom);
        const root = $getRoot();
        root.clear();
        root.select();
        $insertNodes(nodes);
      });
    } catch (error) {
      logger.error("Failed to initialize editor from HTML", {
        error: getErrorMessage(error),
      });
    }

    hasInitializedRef.current = true;
  }, [editor, content]);

  return null;
}
