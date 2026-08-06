import { z } from "zod";

export const galleryItemSchema = z.object({
  url: z.url(),
  alt: z.string().trim().max(200).default(""),
  caption: z.string().trim().max(500).default(""),
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
        input: items,
        message: "URL が重複しています",
        path: [dupIndex, "url"],
      });
    }
  });

/** `tryParseGallery` の結果（失敗側はデータを持たない）。 */
export type TryParseGalleryResult =
  { success: true; data: GalleryItem[] } | { success: false };

/**
 * ギャラリーの strict parse — 読み取り失敗を呼び出し側に伝える。
 *
 * `parseGallery` は「読めた分だけ返す」ので、戻り値が `[]` でも
 * **「元から写真なし」と「保存値が丸ごと読めなかった」を区別できない**。
 * 管理画面の編集フォームは写真 1 件につき hidden input を 1 つしか出さないため、
 * 後者を空配列として扱うと、価格や説明文だけを直して保存した操作で
 * `gallery` が空配列に上書きされる。**管理者にも顧客にも通知は出ない。**
 * `tryParseFacilities` / `tryParseSidebarWidgets` と同じ役割をここで担う。
 *
 * `success: false` は「本当に何も読めなかった」ときだけ:
 * - 配列でない値が保存されている（object / string / number）
 * - 空でない配列なのに 1 件も検証を通らなかった
 *
 * null / undefined（未設定）と空配列は「写真なし」であって読み取り失敗ではない。
 * 一部だけ壊れた配列は読めた分を返す（`success: true`）— 生き残った写真を
 * 編集できる状態のほうが被害が小さいため（設備と同じ方針）。
 */
export function tryParseGallery(value: unknown): TryParseGalleryResult {
  if (value === null || value === undefined) return { success: true, data: [] };
  if (!Array.isArray(value)) return { success: false };

  const data: GalleryItem[] = [];
  for (const item of value) {
    const parsed = galleryItemSchema.safeParse(item);
    if (parsed.success) data.push(parsed.data);
  }
  if (value.length > 0 && data.length === 0) return { success: false };
  return { success: true, data };
}

/** 読めた分だけ返す緩い parse。**編集フォームからは使わない**（上を使う）。 */
export function parseGallery(value: unknown): GalleryItem[] {
  const result = tryParseGallery(value);
  return result.success ? result.data : [];
}
