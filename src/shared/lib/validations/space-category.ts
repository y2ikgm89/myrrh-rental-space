import { z } from "zod";

/**
 * スペースカテゴリー（SpaceCategory）バリデーションスキーマ
 */

export const spaceCategoryFormSchema = z.object({
  name: z
    .string()
    .min(1, { error: "カテゴリー名を入力してください" })
    .max(50, { error: "カテゴリー名は50文字以内で入力してください" }),
  description: z
    .string()
    .max(500, { error: "説明は500文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  icon: z
    .string()
    .max(50, { error: "アイコン名は50文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  color: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
      error: "有効なカラーコードを入力してください",
    })
    .optional()
    .or(z.literal("")),
  // sortOrder はシステム管理（D&D 並び替えが SSoT、手動入力なし）
});

export type SpaceCategoryFormInput = z.input<typeof spaceCategoryFormSchema>;
export type SpaceCategoryFormData = z.output<typeof spaceCategoryFormSchema>;

export const defaultSpaceCategoryFormValues: SpaceCategoryFormInput = {
  name: "",
  description: "",
  icon: "",
  color: "",
};

// カテゴリー詳細型（スペース数を含む）
export type SpaceCategoryWithStats = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    spaces: number;
  };
};

export type GetSpaceCategoriesResult = {
  categories: SpaceCategoryWithStats[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
