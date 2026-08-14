/**
 * PasteUrlPlugin の埋め込み種別判定と空段落ゲートのテスト
 *
 * @description `PasteUrlPlugin` は "use client" + useEffect の React component
 * のため直接 unit test しづらい。埋め込み種別判定は `detectPasteEmbed`、
 * 空段落ゲートは `$isEmptyRootLevelBlock` に抽出して検証する。
 */

import { describe, expect, test } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { $createQuoteNode, QuoteNode } from "@lexical/rich-text";
import { $createParagraphNode, $getRoot, type LexicalNode } from "lexical";
import { $isEmptyRootLevelBlock } from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/is-empty-root-level-block";
import { detectPasteEmbed } from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/paste-embed-detector";

function readEmptyRootLevelBlock(build: () => LexicalNode): boolean {
  const editor = createHeadlessEditor({
    nodes: [QuoteNode],
    onError: (error) => {
      throw error;
    },
  });
  let result = false;
  editor.update(
    () => {
      result = $isEmptyRootLevelBlock(build());
    },
    { discrete: true },
  );
  return result;
}

describe("detectPasteEmbed", () => {
  test("YouTube の通常URLをYouTubeと判定する", () => {
    const result = detectPasteEmbed(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(result).toEqual({ type: "youtube", videoId: "dQw4w9WgXcQ" });
  });

  test("YouTube の短縮URL(youtu.be)をYouTubeと判定する", () => {
    const result = detectPasteEmbed("https://youtu.be/dQw4w9WgXcQ");
    expect(result).toEqual({ type: "youtube", videoId: "dQw4w9WgXcQ" });
  });

  test("Vimeo URLをVimeoと判定する", () => {
    const result = detectPasteEmbed("https://vimeo.com/123456789");
    expect(result).toEqual({ type: "vimeo", videoId: "123456789" });
  });

  test("Spotify URL(track)をSpotifyと判定する", () => {
    const result = detectPasteEmbed(
      "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    );
    expect(result).toEqual({
      type: "spotify",
      embedUrl: "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC",
      contentType: "track",
    });
  });

  test("Spotify URL(episode)をSpotifyと判定する", () => {
    const result = detectPasteEmbed("https://open.spotify.com/episode/abc123");
    expect(result).toEqual({
      type: "spotify",
      embedUrl: "https://open.spotify.com/embed/episode/abc123",
      contentType: "episode",
    });
  });

  test("Figma URLをFigmaと判定する", () => {
    const url = "https://www.figma.com/file/abc123/My-Design";
    const result = detectPasteEmbed(url);
    expect(result).toEqual({
      type: "figma",
      embedUrl: `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`,
    });
  });

  test("どの埋め込み種別にもマッチしない一般URLはnullを返す", () => {
    expect(detectPasteEmbed("https://example.com/article")).toBeNull();
  });

  test("空文字列や無関係なパスもnullを返す", () => {
    expect(detectPasteEmbed("")).toBeNull();
    expect(detectPasteEmbed("https://example.com/")).toBeNull();
  });

  test("優先順位: YouTubeが最初にマッチする(Vimeo等より先に判定される)", () => {
    // YouTube判定がVimeo/Spotify/Figmaより先に評価されることを、
    // YouTubeの?v=パターンにマッチするURLで確認する
    const result = detectPasteEmbed("https://www.youtube.com/watch?v=abc123");
    expect(result?.type).toBe("youtube");
  });
});

describe("$isEmptyRootLevelBlock", () => {
  test("root 直下の空 ParagraphNode（element-type anchor）は対象になる", () => {
    const isEmpty = readEmptyRootLevelBlock(() => {
      const paragraph = $createParagraphNode();
      $getRoot().append(paragraph);
      return paragraph;
    });
    expect(isEmpty).toBe(true);
  });

  test("ネストした空段落は対象にならない", () => {
    const isEmpty = readEmptyRootLevelBlock(() => {
      const nested = $createParagraphNode();
      $getRoot().append($createQuoteNode().append(nested));
      return nested;
    });
    expect(isEmpty).toBe(false);
  });
});
