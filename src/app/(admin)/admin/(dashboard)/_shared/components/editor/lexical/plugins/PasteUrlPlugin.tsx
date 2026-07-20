"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import type { LexicalEditor, LexicalNode } from "lexical";
import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_LOW,
  PASTE_COMMAND,
} from "lexical";
import { useEffect } from "react";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import { logger } from "@/shared/lib/errors/logger-core";
import {
  detectPasteEmbed,
  type PasteEmbedMatch,
} from "../config/paste-embed-detector";
import { $createBookmarkNode } from "../nodes/BookmarkNode";
import { $createFigmaNode } from "../nodes/FigmaNode";
import { $createSpotifyNode } from "../nodes/SpotifyNode";
import { $createVimeoNode } from "../nodes/VimeoNode";
import { $createYouTubeNode } from "../nodes/YouTubeNode";

/**
 * ペースト可能な URL かどうかを判定する
 *
 * `new URL()` でパース可能、かつ hostname がドット区切りの妥当な形式（または
 * localhost）であることを確認する。厳密な公開サフィックス検証までは行わず、
 * `https://a` や `https://` のような明らかに不正な形式だけを弾く簡易チェック。
 */
function isPasteableUrl(text: string): boolean {
  if (!/^https?:\/\//.test(text)) return false;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return false;
  }
  return parsed.hostname === "localhost" || parsed.hostname.includes(".");
}

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

        if (!text || !isPasteableUrl(text)) return false;

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

        const embed = detectPasteEmbed(text);
        if (embed) {
          editor.update(() => {
            $insertNodeToNearestRoot($createEmbedNode(embed));
          });
        } else {
          void insertBookmarkFromUrl(editor, text);
        }
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}

/**
 * 埋め込み種別判定結果（{@link detectPasteEmbed}）から対応する DecoratorNode を生成する
 */
function $createEmbedNode(embed: PasteEmbedMatch): LexicalNode {
  switch (embed.type) {
    case "youtube":
      return $createYouTubeNode({ videoId: embed.videoId });
    case "vimeo":
      return $createVimeoNode({ videoId: embed.videoId });
    case "spotify":
      return $createSpotifyNode({
        embedUrl: embed.embedUrl,
        contentType: embed.contentType,
      });
    case "figma":
      return $createFigmaNode({ embedUrl: embed.embedUrl });
  }
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
    // OGP 取得失敗時もペースト内容を消失させないよう、プレーンテキストとして URL を挿入する
    logger.warn(
      "PasteUrlPlugin: OGP fetch failed, inserting URL as plain text",
      {
        url,
      },
    );
    editor.update(() => {
      $insertNodeToNearestRoot(
        $createParagraphNode().append($createTextNode(url)),
      );
    });
  }
}
