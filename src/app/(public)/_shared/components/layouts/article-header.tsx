import type { ReactElement, ReactNode } from "react";
import { Heading } from "../design-system/heading";

interface ArticleHeaderProps {
  /** Eyebrow ラベル ("Space" / "Event" / category 名等)。小文字英数 / 日本語可。 */
  readonly eyebrow?: string;
  readonly title: string;
  /**
   * h1 下の hairline divider の下に配置する meta 行。
   * 日時 / 著者 / 容量 / 会場等を inline で組み立てて渡す。
   * 渡されない場合は hairline のみ表示（typographic rhythm を維持）。
   */
  readonly meta?: ReactNode;
  /** thumbnail / gallery 等のメイン画像。h1 + meta の下に配置。 */
  readonly media?: ReactNode;
}

/**
 * ArticleHeader — 公開記事 / リソース詳細ページ共通ヘッダー
 *
 * Editorial Magazine の Kinfolk hairline パターン:
 *   eyebrow → h1 → hairline rule → meta line → media
 *
 * 5 系統 (spaces / events / news / posts / terms) の詳細ページで共通利用。
 * 各 page で meta / media を組み立てて slot に流す。
 */
export function ArticleHeader({
  eyebrow,
  title,
  meta,
  media,
}: ArticleHeaderProps): ReactElement {
  return (
    <header className="mb-12 space-y-8">
      <div className="space-y-6">
        {eyebrow ? (
          <p className="text-[0.7rem] uppercase tracking-[0.18em] text-accent">
            {eyebrow}
          </p>
        ) : null}
        <Heading level={1}>{title}</Heading>
        <hr
          aria-hidden="true"
          className="w-16 border-0 border-t border-divider"
        />
        {meta ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {meta}
          </div>
        ) : null}
      </div>
      {media ? <div className="mx-auto max-w-3xl">{media}</div> : null}
    </header>
  );
}
