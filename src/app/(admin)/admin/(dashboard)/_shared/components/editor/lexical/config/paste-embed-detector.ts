/**
 * ペースト URL の埋め込み種別判定
 *
 * @description `PasteUrlPlugin` が空段落に URL を単独ペーストされた際、OGP フェッチ
 * （外部リンクカード = BookmarkNode）より先に判定する埋め込み種別。
 * YouTube → Vimeo → Spotify → Figma の優先順位で判定し、どれにもマッチしない場合は
 * 呼び出し側で従来どおり OGP フェッチにフォールバックする。
 *
 * 各判定ロジックは対応する Node ファイルの export 済み関数をそのまま再利用する
 * （重複実装しない）:
 * - YouTube: `extractYouTubeVideoId`（../nodes/YouTubeNode）
 * - Vimeo: `extractVimeoId`（../nodes/VimeoNode）
 * - Spotify: `toSpotifyEmbedUrl`（../nodes/SpotifyNode）
 * - Figma: `toFigmaEmbedUrl`（../nodes/FigmaNode）
 */

import { extractYouTubeVideoId } from "../nodes/YouTubeNode";
import { extractVimeoId } from "../nodes/VimeoNode";
import {
  toSpotifyEmbedUrl,
  type SpotifyContentType,
} from "../nodes/SpotifyNode";
import { toFigmaEmbedUrl } from "../nodes/FigmaNode";

export type PasteEmbedMatch =
  | { type: "youtube"; videoId: string }
  | { type: "vimeo"; videoId: string }
  | { type: "spotify"; embedUrl: string; contentType: SpotifyContentType }
  | { type: "figma"; embedUrl: string };

/**
 * ペーストされた URL を埋め込み種別として判定する（YouTube → Vimeo → Spotify → Figma の順）
 *
 * @param url - 判定対象の URL 文字列
 * @returns マッチした埋め込み種別。どれにもマッチしない場合は null
 */
export function detectPasteEmbed(url: string): PasteEmbedMatch | null {
  const youtubeVideoId = extractYouTubeVideoId(url);
  if (youtubeVideoId) {
    return { type: "youtube", videoId: youtubeVideoId };
  }

  const vimeoVideoId = extractVimeoId(url);
  if (vimeoVideoId) {
    return { type: "vimeo", videoId: vimeoVideoId };
  }

  const spotify = toSpotifyEmbedUrl(url);
  if (spotify) {
    return {
      type: "spotify",
      embedUrl: spotify.embedUrl,
      contentType: spotify.contentType,
    };
  }

  const figmaEmbedUrl = toFigmaEmbedUrl(url);
  if (figmaEmbedUrl) {
    return { type: "figma", embedUrl: figmaEmbedUrl };
  }

  return null;
}
