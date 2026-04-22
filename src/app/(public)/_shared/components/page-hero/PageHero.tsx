import type { ReactElement } from "react";
import { parsePageHero } from "@/shared/lib/sections/page-hero/schema";
import { defaultPageHeroHome } from "@/shared/lib/sections/page-hero/defaults";
import { EditorialSplitHero } from "./EditorialSplitHero";
import { CompactHero } from "./CompactHero";
import { MinimalHero } from "./MinimalHero";

interface PageHeroProps {
  readonly data: unknown;
}

/**
 * Page.pageHero JSON のサーバー側ディスパッチャ（variant 別に Client / RSC を切替）
 */
export function PageHero({ data }: PageHeroProps): ReactElement | null {
  const hero = parsePageHero(data) ?? defaultPageHeroHome;

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
      const { variant: _v, ...rest } = hero;
      return <MinimalHero {...rest} />;
    }
    default:
      return null;
  }
}
