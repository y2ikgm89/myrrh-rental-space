"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import type { LexicalEditor } from "lexical";
import {
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_LOW,
  PASTE_COMMAND,
} from "lexical";
import { useEffect } from "react";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import { logger } from "@/shared/lib/logger";
import { $createBookmarkNode } from "../nodes/BookmarkNode";

const URL_PATTERN = /^https?:\/\/[^\s]+$/;

type OgpPreview = {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string;
  siteName: string | null;
};

/**
 * 空段落に URL を単独ペーストすると OGP を取得して外部リンクカード
 * （{@link $createBookmarkNode}）に変換する。
 *
 * OGP 取得は非同期だが、ペースト自体は同期的に `preventDefault` してプレーン
 * テキスト挿入を抑止する（取得完了後に `editor.update` でカードを挿入）。
 */
export function PasteUrlPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const clipboardData =
          event instanceof ClipboardEvent ? event.clipboardData : null;
        const text = clipboardData?.getData("text/plain")?.trim();

        if (!text || !URL_PATTERN.test(text)) return false;

        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed())
          return false;
        const node = selection.anchor.getNode();
        const parent = node.getParent();
        const isEmptyParagraph =
          parent != null &&
          $isRootOrShadowRoot(parent.getParent()) &&
          node.getTextContent() === "";

        if (!isEmptyParagraph) return false;

        event.preventDefault();
        void insertBookmarkFromUrl(editor, text);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}

async function insertBookmarkFromUrl(
  editor: LexicalEditor,
  url: string,
): Promise<void> {
  try {
    const ogp = await fetchAdminJson<OgpPreview>("/admin/api/ogp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    editor.update(() => {
      $insertNodeToNearestRoot(
        $createBookmarkNode({
          url: ogp.url,
          ...(ogp.title != null && { title: ogp.title }),
          ...(ogp.description != null && { description: ogp.description }),
          ...(ogp.imageUrl != null && { imageUrl: ogp.imageUrl }),
          faviconUrl: ogp.faviconUrl,
          ...(ogp.siteName != null && { siteName: ogp.siteName }),
        }),
      );
    });
  } catch {
    logger.warn("PasteUrlPlugin: OGP fetch failed", { url });
  }
}
