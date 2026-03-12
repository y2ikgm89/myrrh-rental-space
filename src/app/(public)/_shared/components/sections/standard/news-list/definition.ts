import type { SectionDefinition } from "@/shared/lib/sections/types";
import {
  newsListConfigSchema,
  newsListMeta,
} from "./config";

export { newsListConfigSchema, type NewsListConfig } from "./config";

export const newsListDefinition: SectionDefinition<
  typeof newsListConfigSchema
> = {
  ...newsListMeta,
  component: {
    type: "server",
    load: () =>
      // @ts-expect-error -- migration: component uses typed props; will adopt SectionComponentProps<TConfig> in Task 13
      import("../../../../../_components/NewsListSection").then((m) => ({
        default: m.NewsListSection,
      })),
  },
  dataLoader: async (config) => {
    const { getPublishedNews } = await import("@/shared/domain/news/queries");
    const news = await getPublishedNews(config.maxItems);
    return { news };
  },
};
