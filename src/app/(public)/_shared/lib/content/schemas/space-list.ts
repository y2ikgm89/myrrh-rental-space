import { z } from "zod/v4";

export const spaceListContentSchema = z.object({
  hero: z.object({
    title: z.string(),
    description: z.string(),
  }),
});

export type SpaceListContent = z.infer<typeof spaceListContentSchema>;
