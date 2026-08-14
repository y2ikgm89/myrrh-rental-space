import type { InstagramMediaType } from "@/shared/lib/validations/enums/prisma-types";

/**
 * Instagram タイルに出す**画像**の URL を決める。
 *
 * ## なぜ分岐が要るのか
 *
 * Graph API は VIDEO メディアの `media_url` に **.mp4 の CDN URL** を返し、
 * 画像は `thumbnail_url` にしか無い（IMAGE / CAROUSEL_ALBUM は `media_url` が画像）。
 *
 * mp4 をそのまま `<Image src>` に渡すと、ブラウザが `/_next/image?url=<mp4>` を
 * 叩き、Next の image-optimizer が `detectContentType` で `video/mp4` を得て
 * **400 "The requested resource isn't a valid image."** を返す。結果、リール /
 * 動画投稿のタイルは空箱に再生アイコンだけが載った状態で公開トップに並ぶ
 * （監査 F-37）。管理画面に差し替え手段は無い。
 *
 * `null` を返したときは呼び出し側の fallback（Instagram アイコン）に落とす。
 */
export function resolveInstagramTileImageUrl(post: {
  readonly mediaType: InstagramMediaType;
  readonly mediaUrl: string | null;
  readonly thumbnailUrl: string | null;
}): string | null {
  if (post.mediaType === "VIDEO") return post.thumbnailUrl;
  return post.mediaUrl ?? post.thumbnailUrl;
}
