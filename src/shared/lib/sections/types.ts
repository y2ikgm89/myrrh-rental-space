import type { z } from "zod";
import type { SectionDesign } from "@/shared/lib/validations/section-design";
import type React from "react";

/** Zod .meta() に埋め込む UI ヒント */
export type FieldUIHint = {
  readonly description: string;
  readonly fieldType?: string;
  readonly placeholder?: string;
  readonly visibleWhen?: {
    readonly field: string;
    readonly value: string | boolean;
  };
};

/** セクションカテゴリ */
export type SectionCategory =
  | "hero"
  | "content"
  | "list"
  | "interactive"
  | "media"
  | "utility";

/** セクションテーブルの共通フィールド（config 外） */
export type SectionFields = {
  readonly title: string | null;
  readonly contentHtml: string | null;
};

/** セクションコンポーネントの props */
export type SectionComponentProps<TConfig = Record<string, unknown>> = {
  readonly config: TConfig;
  readonly design: SectionDesign;
  readonly extraData?: Record<string, unknown>;
  readonly section?: SectionFields;
};

/** Server Component ローダー */
export type ServerComponentLoader = {
  readonly type: "server";
  readonly load: () => Promise<{
    default: React.ComponentType<SectionComponentProps>;
  }>;
};

/** Client Component ローダー */
export type ClientComponentLoader = {
  readonly type: "client" | "client-only";
  readonly load: () => Promise<{
    default: React.ComponentType<SectionComponentProps>;
  }>;
};

export type ComponentLoader = ServerComponentLoader | ClientComponentLoader;

/** データローダー（リスト系セクション用） */
export type SectionDataLoader<TConfig = Record<string, unknown>> = (
  config: TConfig,
) => Promise<Record<string, unknown>>;

/** セクション定義 */
export type SectionDefinition<TSchema extends z.ZodType = z.ZodType> = {
  readonly id: string;
  readonly meta: {
    readonly label: string;
    readonly description: string;
    readonly icon: string;
    readonly category: SectionCategory;
  };
  readonly configSchema: TSchema;
  readonly defaultConfig: z.output<TSchema>;
  readonly component: ComponentLoader;
  readonly dataLoader?: SectionDataLoader<z.output<TSchema>>;
  readonly effects?: {
    readonly supportsOverlay?: boolean;
    readonly requiresExperienceShell?: boolean;
  };
};
