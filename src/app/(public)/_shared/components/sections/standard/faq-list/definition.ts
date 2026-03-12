import type { SectionDefinition } from "@/shared/lib/sections/types";
import {
  faqListConfigSchema,
  faqListMeta,
} from "./config";

export { faqListConfigSchema, type FaqListConfig } from "./config";

export const faqListDefinition: SectionDefinition<
  typeof faqListConfigSchema
> = {
  ...faqListMeta,
  component: {
    type: "server",
    load: () =>
      // @ts-expect-error -- migration: component uses typed props; will adopt SectionComponentProps<TConfig> in Task 13
      import("../../../../../_components/FaqListSection").then((m) => ({
        default: m.FaqListSection,
      })),
  },
  dataLoader: async (config) => {
    const { getPublishedFaqItems } = await import(
      "@/shared/domain/sections/queries"
    );
    const faqItems = await getPublishedFaqItems(
      config.maxItems,
      config.categoryId,
    );
    return { faqItems };
  },
};
