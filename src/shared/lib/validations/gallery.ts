import { z } from "zod";

export const galleryItemSchema = z.object({
  url: z.string().url(),
  alt: z.string().max(200).default(""),
  caption: z.string().max(500).default(""),
});

export type GalleryItem = z.infer<typeof galleryItemSchema>;

export const gallerySchema = z
  .array(galleryItemSchema)
  .max(20, { error: "ギャラリーは最大20件まで" })
  .default([])
  .superRefine((items, ctx) => {
    const urls = items.map((i) => i.url);
    const dupIndex = urls.findIndex((u, i) => urls.indexOf(u) !== i);
    if (dupIndex !== -1) {
      ctx.addIssue({
        code: "custom",
        message: "URL が重複しています",
        path: [dupIndex, "url"],
      });
    }
  });

export function parseGallery(value: unknown): GalleryItem[] {
  if (!Array.isArray(value)) return [];
  const result: GalleryItem[] = [];
  for (const item of value) {
    const parsed = galleryItemSchema.safeParse(item);
    if (parsed.success) result.push(parsed.data);
  }
  return result;
}
