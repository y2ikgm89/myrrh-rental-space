import { z } from "zod/v4";

export const spaceListContentSchema = z.object({
  hero: z.object({
    title: z.string(),
    description: z.string(),
  }),
});

export type SpaceListContent = z.infer<typeof spaceListContentSchema>;

export const defaultSpaceListContent: SpaceListContent = {
  hero: {
    title: "スペース一覧",
    description: "ご利用シーンに合わせた多彩なスペースをご用意しています",
  },
};
