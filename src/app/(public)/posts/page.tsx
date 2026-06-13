import { permanentRedirect } from "next/navigation";

/**
 * 旧ブログ一覧 URL。一覧は `/blog` に統一したため恒久リダイレクト（308）。
 * 記事詳細 `posts/[...segments]/page.tsx` の redirect と対称で、既存リンク・
 * ブックマーク・被リンクの SEO 価値を `/blog` に引き継ぐ。
 */
export default function PostsListRedirect(): never {
  permanentRedirect("/blog");
}
