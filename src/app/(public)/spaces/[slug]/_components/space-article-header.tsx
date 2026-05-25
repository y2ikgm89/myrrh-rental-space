import type { ReactElement } from "react";
import { Heading } from "@/public/components/design-system/heading";
import { SpaceGallery } from "./space-gallery";

interface SpaceArticleHeaderProps {
  readonly title: string;
  readonly mainImage: string;
  readonly images: unknown;
}

/**
 * SpaceArticleHeader — 公開スペース詳細ページのヘッダー
 *
 * Editorial Magazine の記事型ヘッダー（events / posts / news の ArticleHeader と
 * 同パターン）。eyebrow ラベル "SPACE" → h1 → gallery の順で配置。
 * 容量 / 広さ / 住所 / 料金等の詳細メタは本文 (`SpaceInfo`) と右サイド sticky の
 * `ReservationWidget` に集約するため、ヘッダーには含めない。
 */
export function SpaceArticleHeader({
  title,
  mainImage,
  images,
}: SpaceArticleHeaderProps): ReactElement {
  return (
    <header className="mb-12 space-y-8">
      <div className="space-y-6">
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-accent">
          Space
        </p>
        <Heading level={1}>{title}</Heading>
      </div>
      <SpaceGallery mainImage={mainImage} images={images} name={title} />
    </header>
  );
}
