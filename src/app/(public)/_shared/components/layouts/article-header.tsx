import type { ReactElement, ReactNode } from "react";
import { Heading } from "../design-system/heading";
import { cn } from "@/shared/lib/cn";

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
  /**
   * 配置スタイル。
   *
   * - `"left"`（default）: ArticleLayout 通常の左寄せ。posts / news / terms 用。
   * - `"center"`: Kinfolk magazine cover pattern。eyebrow を `— word —` の em-dash 装飾で囲み、
   *   tracking を `0.24em` に拡げ、hairline を w-12 + `border-accent` に絞る。
   *   spaces 詳細 (`page.tsx` 内直接構築) と同じ visual hierarchy を共有する。
   */
  readonly align?: "left" | "center";
}

/**
 * ArticleHeader — 公開記事 / リソース詳細ページ共通ヘッダー
 *
 * Editorial Magazine の Kinfolk hairline パターン:
 *   eyebrow → h1 → hairline rule → meta line → media
 *
 * 5 系統 (spaces / events / news / posts / terms) の詳細ページで共通利用。
 * 各 page で meta / media を組み立てて slot に流す。`align="center"` は events 等で
 * Kinfolk magazine cover に揃えるための variant。
 */
export function ArticleHeader({
  eyebrow,
  title,
  meta,
  media,
  align = "left",
}: ArticleHeaderProps): ReactElement {
  const isCenter = align === "center";
  return (
    <header className={cn("mb-12 space-y-8", isCenter && "text-center")}>
      <div className="space-y-6">
        {eyebrow ? (
          <p
            className={cn(
              "text-[0.7rem] uppercase text-accent",
              isCenter ? "tracking-eyebrow-wide" : "tracking-eyebrow",
            )}
          >
            {isCenter ? `— ${eyebrow} —` : eyebrow}
          </p>
        ) : null}
        <Heading level={1}>{title}</Heading>
        <hr
          aria-hidden="true"
          className={cn(
            "border-0 border-t",
            isCenter ? "mx-auto w-12 border-accent" : "w-16 border-divider",
          )}
        />
        {meta ? (
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground",
              isCenter && "justify-center",
            )}
          >
            {meta}
          </div>
        ) : null}
      </div>
      {media ? <div className="mx-auto max-w-3xl">{media}</div> : null}
    </header>
  );
}
