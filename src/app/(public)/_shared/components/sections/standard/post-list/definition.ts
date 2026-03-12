import type { SectionDefinition } from "@/shared/lib/sections/types";
import {
  postListConfigSchema,
  postListMeta,
} from "./config";

export { postListConfigSchema, type PostListConfig } from "./config";

export const postListDefinition: SectionDefinition<
  typeof postListConfigSchema
> = {
  ...postListMeta,
  component: {
    type: "server",
    load: () =>
      import("../../../../../_components/PostListSection").then((m) => ({
        default: m.PostListSection,
      })),
  },
  dataLoader: async (config) => {
    const { getPublishedPosts } = await import(
      "@/shared/domain/posts/queries"
    );
    const posts = await getPublishedPosts(config.maxItems, config.categoryId);
    return { posts };
  },
};
