import { z } from "zod";

export const spaceListContentSchema = z.object({
  hero: z.object({
    title: z.string(),
    description: z.string(),
  }),
});

export type SpaceListContent = z.infer<typeof spaceListContentSchema>;
