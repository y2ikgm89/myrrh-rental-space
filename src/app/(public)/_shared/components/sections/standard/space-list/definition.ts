import type { SectionDefinition } from "@/shared/lib/sections/types";
import {
  spaceListConfigSchema,
  spaceListMeta,
} from "./config";

export { spaceListConfigSchema, type SpaceListConfig } from "./config";

export const spaceListDefinition: SectionDefinition<
  typeof spaceListConfigSchema
> = {
  ...spaceListMeta,
  component: {
    type: "server",
    load: () =>
      // @ts-expect-error -- migration: component uses typed props; will adopt SectionComponentProps<TConfig> in Task 13
      import("../../../../../_components/SpaceListSection").then((m) => ({
        default: m.SpaceListSection,
      })),
  },
  dataLoader: async (config) => {
    const { getShowcaseSpaces } = await import(
      "@/shared/domain/sections/queries"
    );
    const spaces = await getShowcaseSpaces(
      config.maxItems,
      config.showOnlyPublished,
    );
    return { spaces };
  },
};
