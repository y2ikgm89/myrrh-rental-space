import type { ReactElement } from "react";
import { pageHeroConfigSchema } from "@/shared/lib/sections/definitions/page-hero";
import { EditorialSplitHero } from "./EditorialSplitHero";
import { CompactHero } from "./CompactHero";
import { MinimalHero } from "./MinimalHero";
import { MediaHero } from "./MediaHero";

interface PageHeroProps {
  readonly config: unknown;
}

/**
 * page-hero セクション config（unknown）の Server 側ディスパッチャ。
 * - `pageHeroConfigSchema.safeParse` で variant 別 discriminated union に正規化
 * - 無効な config は `null` を return（hero スキップ）
 */
export function PageHero({ config }: PageHeroProps): ReactElement | null {
  const result = pageHeroConfigSchema.safeParse(config);
  if (!result.success) return null;

  const hero = result.data;
  switch (hero.variant) {
    case "editorial-split": {
      const { variant: _v, ...rest } = hero;
      return <EditorialSplitHero {...rest} />;
    }
    case "compact": {
      const { variant: _v, ...rest } = hero;
      return <CompactHero {...rest} />;
    }
    case "minimal": {
      const { variant: _v, layout: _l, ...rest } = hero;
      return <MinimalHero {...rest} />;
    }
    case "media": {
      const { variant: _v, layout: _l, ...rest } = hero;
      return <MediaHero {...rest} />;
    }
    default:
      return null;
  }
}
