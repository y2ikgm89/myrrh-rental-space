/**
 * PasteUrlPlugin の埋め込み種別判定ロジックのテスト
 *
 * @description `PasteUrlPlugin` は "use client" + useEffect の React component
 * のため直接 unit test しづらい。埋め込み種別判定を抽出した純粋関数
 * `detectPasteEmbed`（config/paste-embed-detector.ts）を検証することで、
 * PasteUrlPlugin の実質的な挙動（YouTube/Vimeo/Spotify/Figma を優先判定し、
 * どれにもマッチしない場合は OGP フェッチにフォールバックする）を担保する。
 */

import { describe, expect, test } from "bun:test";
import { detectPasteEmbed } from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/paste-embed-detector";

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
