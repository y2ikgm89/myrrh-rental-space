/**
 * LocationsOverview — /access ページの上部 intro + 拠点アンカーナビ
 *
 * TKP の page-top anchor index パターン: 拠点が 2 件以上ある場合に
 * 各拠点へジャンプできるアンカーリンクを提供（モバイル skip-to-section）。
 */

import type { ReactElement } from "react";
import { IconArrowDown } from "@tabler/icons-react";

interface LocationLink {
  readonly anchorId: string;
  readonly name: string;
  readonly index: number;
}

interface LocationsOverviewProps {
  readonly locations: readonly LocationLink[];
  readonly headline?: string;
  readonly description?: string;
}

export function LocationsOverview({
  locations,
  headline = "全拠点のご案内",
  description,
}: LocationsOverviewProps): ReactElement {
  const hasMultiple = locations.length > 1;

  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-eyebrow uppercase text-muted-foreground">
        Our Locations / 拠点一覧
      </p>
      <h1 className="mt-4 font-heading text-[clamp(2rem,4.5vw,3rem)] font-light italic leading-tight text-foreground">
        {headline}
      </h1>
      {description && (
        <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
          {description}
        </p>
      )}

      {hasMultiple && (
        <nav
          aria-label="拠点ナビゲーション"
          className="mt-10 border-y border-border py-8"
        >
          <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5 md:gap-x-14">
            {locations.map((loc) => (
              <li key={loc.anchorId}>
                <a
                  href={`#${loc.anchorId}`}
                  className="group inline-flex min-h-11 items-center gap-3 py-2 transition-opacity hover:opacity-60"
                >
                  <span
                    aria-hidden="true"
                    className="font-heading text-2xl font-light italic leading-none text-accent md:text-3xl"
                  >
                    {String(loc.index).padStart(2, "0")}
                  </span>
                  <span className="border-b border-transparent pb-0.5 text-base text-foreground transition-colors group-hover:border-foreground md:text-lg">
                    {loc.name}
                  </span>
                  <IconArrowDown
                    aria-hidden="true"
                    className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-y-0.5 md:h-5 md:w-5"
                  />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
