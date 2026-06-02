/**
 * デフォルト Twitter Card 画像 — 動的生成（next/og）
 *
 * og:image と同一のブランド既定カードを twitter:image としても出力する。
 * twitter-image ファイルが無いと Next.js は twitter:image meta を生成せず、
 * 一部クライアントで og:image フォールバックが効かないため明示する。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image#twitter-image
 */

export { default, size, contentType, alt } from "./opengraph-image";
