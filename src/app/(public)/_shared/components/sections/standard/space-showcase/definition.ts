import type { SectionDefinition } from "@/shared/lib/sections/types";
import {
  spaceShowcaseConfigSchema,
  spaceShowcaseMeta,
} from "./config";

export {
  spaceShowcaseConfigSchema,
  type SpaceShowcaseConfig,
} from "./config";

export const spaceShowcaseDefinition: SectionDefinition<
  typeof spaceShowcaseConfigSchema
> = {
  ...spaceShowcaseMeta,
  component: {
    type: "server",
    load: () =>
      // @ts-expect-error -- migration: component uses typed props; will adopt SectionComponentProps<TConfig> in Task 13
      import("../../../../../_components/SpaceShowcase").then((m) => ({
        default: m.SpaceShowcase,
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
