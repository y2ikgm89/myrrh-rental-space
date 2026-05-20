import type { ReactElement } from "react";
import { Heading } from "@/public/components/design-system/heading";
import { ImageFrame } from "@/public/components/design-system/image-frame";

interface EventArticleHeaderProps {
  readonly title: string;
  readonly thumbnail?: { readonly url: string; readonly alt: string } | null;
}

/**
 * EventArticleHeader — 公開イベント詳細ページのヘッダー
 *
 * Editorial Magazine の記事型ヘッダー（posts / news の ArticleHeader と同パターン）。
 * eyebrow ラベル "EVENT" → h1 → サムネ画像の順で配置。日時 / 会場 / 料金等の
 * 詳細メタは右サイド sticky の `EventInfoPanel` に集約するため、ヘッダーには
 * 含めない（一覧で既に表示されているメタ情報の重複ノイズを避ける）。
 */
export function EventArticleHeader({
  title,
  thumbnail,
}: EventArticleHeaderProps): ReactElement {
  return (
    <header className="mb-12 space-y-8">
      <div className="space-y-6">
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-accent">
          Event
        </p>
        <Heading level={1}>{title}</Heading>
      </div>
      {thumbnail ? (
        <ImageFrame
          src={thumbnail.url}
          alt={thumbnail.alt}
          aspect="video"
          fill
          sizes="(min-width: 1024px) 60vw, 100vw"
          rounded
          priority
        />
      ) : null}
    </header>
  );
}
