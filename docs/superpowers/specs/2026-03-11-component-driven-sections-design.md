# Component-Driven Section Architecture

> 公開ページのセクションシステムを Prisma enum ベースから、コンポーネントレジストリ駆動のアーキテクチャに全面移行する設計。

## 目的

1. **デザイン自由度の最大化** — GSAP / Three.js / PixiJS / 多層パララックスを自由に使えるカスタムセクションを CLI で生成可能にする
2. **Prisma マイグレーション不要の拡張** — `SectionType` enum を廃止し、`componentId: String` で新セクション追加を DB 変更なしに実現
3. **管理画面の自動化** — Zod 4 `.meta()` によるスキーマ駆動フォーム自動生成で、17 個の個別フォームファイルを廃止
4. **既存 Three.js / PixiJS 資産の活用** — 死蔵状態のエフェクトコンポーネントをエフェクトレジストリとして接続

## 決定事項

| 判断                 | 選択                                                   | 根拠                                         |
| -------------------- | ------------------------------------------------------ | -------------------------------------------- |
| セクション型管理     | Prisma enum 廃止 → `componentId: String`               | マイグレーション不要で無制限拡張             |
| TypeScript 型安全    | `as const` オブジェクト + `satisfies`                  | 既存 Prisma mapped enum パターン準拠         |
| メタデータ           | Zod 4 `.meta()` + カスタム `FieldUIHint` 型            | Zod 4 公式推奨、`z.toJSONSchema()` と統合    |
| コンポーネント配置   | コロケーション型（definition + component 同居）        | CLI 生成と相性最高、自己完結                 |
| 管理画面フォーム     | スキーマ駆動自動生成 + カスタムエスケープハッチ        | 60-70% 自動化、残り 30% は専用コンポーネント |
| エフェクト層         | セクション単位 overlay + ページ単位 background/overlay | 既存 Three.js / PixiJS 資産をそのまま活用    |
| コンポーネントロード | `next/dynamic` + `ssr: false`（client-only）           | Next.js 16 公式 lazy-loading パターン        |
| ExperienceShell      | public `layout.tsx` に移動                             | 全公開ページで Three.js / PixiJS 利用可能に  |
| 粒度                 | セクション単位 + ページエフェクト層（C2）              | デザイン自由度最高かつ管理画面操作可能       |
| 既存セクション       | 全 17 種を新レジストリに統一移行（D2）                 | クリーンな単一パス、後方互換ハック不要       |

## アーキテクチャ

### ディレクトリ構造

```
src/shared/lib/sections/
├── types.ts                    # SectionDefinition 型、FieldUIHint 型
├── component-ids.ts            # StandardComponentId as const（Prisma enum 代替）
├── registry.ts                 # 全 definition 集約、satisfies で型安全保証
├── schema-utils.ts             # Zod 4 meta → フォームフィールド定義抽出
└── effects/
    ├── types.ts                # EffectId, SectionEffectConfig, PageEffectConfig
    └── schemas.ts              # 各エフェクトの params Zod スキーマ

src/app/(public)/_shared/components/sections/
├── SectionRenderer.tsx         # レジストリベースの動的コンポーネント解決
├── SectionWrapper/             # 既存 design 適用（維持）
├── standard/                   # 既存 17 種を移行
│   ├── hero-parallax/
│   │   ├── HeroParallax.tsx
│   │   ├── definition.ts       # スキーマ + メタ + デフォルト値 + コンポーネント参照
│   │   └── index.ts
│   ├── cta/
│   ├── features/
│   └── ...（17 フォルダ）
├── custom/                     # CLI 生成コンポーネント（初期は空）
└── effects/                    # 既存エフェクト層維持 + レジストリ追加
    ├── registry.ts             # EffectDefinition の集約
    ├── EffectOverlayRenderer.tsx
    ├── PageEffectRenderer.tsx
    ├── core/                   # 既存（VisualEffectsProvider 等）
    ├── three/                  # 既存（FloatingGeometry 等）
    └── pixi/                   # 既存（PixiGrain 等）

src/app/(admin)/admin/(dashboard)/_shared/components/
├── schema-form/                # NEW: スキーマ駆動フォーム
│   ├── SchemaForm.tsx          # メインコンポーネント
│   ├── FieldRenderer.tsx       # fieldType ディスパッチ
│   ├── fields/                 # 各フィールドタイプのレンダラー
│   │   ├── AutoTextField.tsx
│   │   ├── AutoTextareaField.tsx
│   │   ├── AutoNumberField.tsx
│   │   ├── AutoSliderField.tsx
│   │   ├── AutoSelectField.tsx
│   │   ├── AutoSwitchField.tsx
│   │   ├── AutoColorField.tsx
│   │   ├── MediaPickerField.tsx      # 既存 useSingleMediaPicker ラッパー
│   │   ├── MultiMediaPickerField.tsx # 既存 useMultipleMediaPicker ラッパー
│   │   ├── CTAButtonEditorField.tsx  # 既存 CTAButtonEditor ラッパー
│   │   └── IconSelectField.tsx
│   └── ConditionalWrapper.tsx  # visibleWhen 条件表示
└── effect-editor/              # NEW: エフェクト設定 UI
    ├── EffectSelector.tsx
    └── EffectParamsForm.tsx     # SchemaForm を再利用
```

### コア型定義

```ts
// src/shared/lib/sections/types.ts
import type { z } from "zod";

/**
 * Zod 4 .meta() に格納するフィールド UI ヒント。
 * SchemaForm が .meta() からこの型を抽出してフォームを自動生成する。
 */
export type FieldUIHint = {
  /** フォームで使用する UI コンポーネント種別 */
  fieldType?:
    | "text"
    | "textarea"
    | "url"
    | "color"
    | "number"
    | "slider"
    | "select"
    | "switch"
    | "media"
    | "media-multiple"
    | "cta-buttons"
    | "icon-select";
  /** プレースホルダーテキスト */
  placeholder?: string;
  /** textarea の行数 */
  rows?: number;
  /** フォーム内のグループ名（同名フィールドが横並びになる） */
  group?: string;
  /** 条件表示: 指定フィールドが指定値のときのみ表示 */
  visibleWhen?: {
    field: string;
    value: string | boolean | ReadonlyArray<string>;
  };
};

/** セクションコンポーネントの共通 props */
export type SectionComponentProps<TConfig = unknown> = {
  config: TConfig;
  design: SectionDesign;
  /** リスト系セクション等の追加データ（dataLoader の戻り値） */
  extraData?: Record<string, unknown>;
};

/** コンポーネントのロード方法 */
export type ComponentLoader = {
  /**
   * - "client": Client Component（GSAP 等、SSR 対応）— next/dynamic でロード
   * - "client-only": Client Component（Three.js / PixiJS、SSR 無効）— next/dynamic ssr:false
   *
   * NOTE: Server Component は load ではなく SectionDefinition.serverLoader で直接 import する。
   * next/dynamic は Client Component 専用のため、Server Component には使用しない。
   */
  type: "client" | "client-only";
  /** dynamic import 関数 */
  load: () => Promise<{
    default: React.ComponentType<SectionComponentProps<unknown>>;
  }>;
};

/**
 * Server Component のロード方法。
 * next/dynamic ではなく、async Server Component 内で直接 await import() する。
 */
export type ServerComponentLoader = {
  type: "server";
  load: () => Promise<{
    default: React.ComponentType<SectionComponentProps<unknown>>;
  }>;
};

/**
 * リスト系セクションなど、レンダリング前に DB からデータを取得する必要がある場合の
 * データローダー。SectionRenderer（Server Component）内で await される。
 */
export type SectionDataLoader<TConfig = unknown> = (
  config: TConfig,
) => Promise<Record<string, unknown>>;

/** セクション定義（各 definition.ts が export する型） */
export type SectionDefinition<TSchema extends z.ZodType = z.ZodType> = {
  /** 一意な識別子: "hero-parallax", "cinematic-hero" 等 */
  id: string;
  /** 管理画面表示用メタデータ */
  meta: {
    label: string;
    description: string;
    /** Lucide アイコン名（文字列）— admin 側で LucideIcon に解決 */
    icon: string;
    category: SectionCategory;
    /** 管理画面のセクション選択ダイアログ用サムネイル画像パス */
    thumbnail?: string;
  };
  /**
   * config の Zod スキーマ（.meta() に FieldUIHint を含む）。
   * 制約: 全フィールドに .default() が必須。
   * defaultConfig は configSchema.parse({}) で生成するため、
   * default のないフィールドがあるとモジュールロード時にエラーになる。
   */
  configSchema: TSchema;
  /** 新規作成時のデフォルト config 値 */
  defaultConfig: z.input<TSchema>;
  /** コンポーネントのロード方法（Client Component 用） */
  component: ComponentLoader | ServerComponentLoader;
  /**
   * レンダリング前のデータ取得関数（オプション）。
   * リスト系セクション（space-list, news-list 等）で DB クエリが必要な場合に定義。
   * SectionRenderer（Server Component）内で await される。
   */
  dataLoader?: SectionDataLoader<z.output<TSchema>>;
  /** エフェクト互換性情報 */
  effects: {
    /** エフェクトオーバーレイの重ね描画に対応するか */
    supportsOverlay: boolean;
    /** ExperienceShell（GPU 検出 + Lenis）が必要か */
    requiresExperienceShell: boolean;
  };
};

export const SectionCategory = {
  HERO: "hero",
  CONTENT: "content",
  LIST: "list",
  CTA: "cta",
  MEDIA: "media",
  CUSTOM: "custom",
} as const;

export type SectionCategory =
  (typeof SectionCategory)[keyof typeof SectionCategory];
```

### ComponentId（Prisma enum の代替）

```ts
// src/shared/lib/sections/component-ids.ts

/**
 * 標準セクションの識別子。
 * Prisma の mapped enum パターン（as const オブジェクト + 型エイリアス）に準拠。
 * DB の componentId カラムに格納される値。
 */
export const StandardComponentId = {
  HERO: "hero",
  HERO_PARALLAX: "hero-parallax",
  CUSTOM: "custom",
  CONCEPT: "concept",
  SPACE_LIST: "space-list",
  SPACE_SHOWCASE: "space-showcase",
  NEWS_LIST: "news-list",
  POST_LIST: "post-list",
  FAQ_LIST: "faq-list",
  FEATURES: "features",
  TESTIMONIAL: "testimonial",
  GALLERY: "gallery",
  CTA: "cta",
  CONTACT_FORM: "contact-form",
  MAP: "map",
  EMBED: "embed",
  INSTAGRAM: "instagram",
} as const;

export type StandardComponentId =
  (typeof StandardComponentId)[keyof typeof StandardComponentId];

/**
 * 全 componentId の型。
 * 標準 ID は型補完が効き、カスタム ID は自由文字列として許容する。
 * branded intersection（string & {}）ではなく、
 * レジストリの keyof で実際の ID を制約する。
 */
export type SectionComponentId = string;
```

### Prisma スキーマ

```prisma
model Section {
  id          String   @id @default(cuid())
  pageId      String?
  page        Page?    @relation(fields: [pageId], references: [id], onDelete: Cascade)

  componentId String                    // Prisma enum SectionType を廃止
  order       Int
  isActive    Boolean  @default(true)
  title       String?

  config      Json     @default("{}")
  design      Json     @default("{}")
  contentHtml String?  @db.Text
  contentJson Json?

  effectConfig Json    @default("{}")   // セクション単位のエフェクト設定

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([pageId, order])
  @@map("sections")
}

model Page {
  // 既存フィールド...
  effectConfig Json    @default("{}")   // ページ単位のエフェクト設定（背景 Three.js 等）
  // ...
}

// enum SectionType を完全削除
```

マイグレーション SQL:

```sql
-- Step 1: effectConfig カラム追加
ALTER TABLE "sections" ADD COLUMN "effect_config" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "pages" ADD COLUMN "effect_config" JSONB NOT NULL DEFAULT '{}';

-- Step 2: type → componentId に変換（ENUM → TEXT + kebab-case 変換）
ALTER TABLE "sections" ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;
UPDATE "sections" SET "type" = LOWER(REPLACE("type", '_', '-'));
ALTER TABLE "sections" RENAME COLUMN "type" TO "component_id";

-- Step 3: SectionType enum 削除
DROP TYPE "SectionType";
```

### エフェクト層

```ts
// src/shared/lib/sections/effects/types.ts

/** 標準エフェクト ID */
export const EffectId = {
  THREE_PARTICLES: "three-particles",
  THREE_GEOMETRY: "three-geometry",
  THREE_DISTORTION: "three-distortion",
  PIXI_GRAIN: "pixi-grain",
  PIXI_VIGNETTE: "pixi-vignette",
  PIXI_PARTICLES: "pixi-particles",
} as const;

export type EffectId = (typeof EffectId)[keyof typeof EffectId];

/** エフェクトが配置される層 */
export type EffectLayer = "background" | "overlay";

/** エフェクト定義（エフェクトレジストリのエントリ） */
export type EffectDefinition<TSchema extends z.ZodType = z.ZodType> = {
  schema: TSchema;
  component: () => Promise<{
    default: React.ComponentType<{ params: z.output<TSchema> }>;
  }>;
  layer: EffectLayer;
  requiresWebGL: boolean;
  /** VisualEffectsProvider の effectLevel がこの値以上で有効化 */
  minEffectLevel: number;
};
```

```ts
// src/shared/lib/sections/effects/schemas.ts

/** セクション単位のエフェクト設定（Section.effectConfig に格納） */
export const sectionEffectConfigSchema = z.object({
  overlays: z
    .array(
      z.object({
        effectId: z.string(),
        params: z.record(z.string(), z.unknown()),
      }),
    )
    .default([]),
});
export type SectionEffectConfig = z.output<typeof sectionEffectConfigSchema>;

/** ページ単位のエフェクト設定（Page.effectConfig に格納） */
export const pageEffectConfigSchema = z.object({
  background: z
    .object({
      effectId: z.string(),
      params: z.record(z.string(), z.unknown()),
    })
    .nullable()
    .default(null),
  overlay: z
    .object({
      effectId: z.string(),
      params: z.record(z.string(), z.unknown()),
    })
    .nullable()
    .default(null),
});
export type PageEffectConfig = z.output<typeof pageEffectConfigSchema>;
```

### エフェクトレジストリ

```ts
// src/app/(public)/_shared/components/effects/registry.ts
import { EffectId } from "@/shared/lib/sections/effects/types";
import type { EffectDefinition } from "@/shared/lib/sections/effects/types";

// 各エフェクトの params スキーマ
const particleParamsSchema = z.object({
  count: z
    .number()
    .min(0)
    .max(500)
    .default(150)
    .meta({ description: "パーティクル数", fieldType: "slider" }),
  spread: z
    .number()
    .min(1)
    .max(30)
    .default(12)
    .meta({ description: "拡散範囲", fieldType: "slider" }),
  size: z
    .number()
    .min(0.01)
    .max(0.1)
    .default(0.03)
    .meta({ description: "サイズ", fieldType: "slider" }),
});

const grainParamsSchema = z.object({
  intensity: z
    .number()
    .min(0)
    .max(0.2)
    .default(0.05)
    .meta({ description: "グレイン強度", fieldType: "slider" }),
  speed: z
    .number()
    .min(0)
    .max(3)
    .default(1)
    .meta({ description: "速度", fieldType: "slider" }),
});

export const effectRegistry: Record<string, EffectDefinition> = {
  [EffectId.THREE_PARTICLES]: {
    schema: particleParamsSchema,
    component: () => import("./three/ParticleField"),
    layer: "background",
    requiresWebGL: true,
    minEffectLevel: 3,
  },
  [EffectId.PIXI_GRAIN]: {
    schema: grainParamsSchema,
    component: () => import("./pixi/PixiGrain"),
    layer: "overlay",
    requiresWebGL: true,
    minEffectLevel: 4,
  },
  // ... 残り 4 エフェクト
};
```

### セクションレジストリ

```ts
// src/shared/lib/sections/registry.ts
import type { SectionDefinition } from "./types";

// 標準セクション definition の import
import { heroDefinition } from "@/public/components/sections/standard/hero/definition";
import { heroParallaxDefinition } from "@/public/components/sections/standard/hero-parallax/definition";
// ... 17 種全て

/**
 * セクションレジストリ。
 * 全セクション（標準 + カスタム）の definition を集約する。
 * CLI でカスタムセクション追加時はここにエントリを追加する。
 */
export const sectionRegistry: Record<string, SectionDefinition> = {
  [heroDefinition.id]: heroDefinition,
  [heroParallaxDefinition.id]: heroParallaxDefinition,
  // ... 17 種全て
  // カスタムセクション（CLI 生成時に追加）
};

/** 登録済み全 componentId を取得 */
export function getRegisteredComponentIds(): string[] {
  return Object.keys(sectionRegistry);
}

/** componentId からセクション定義を取得（未登録なら undefined） */
export function getSectionDefinition(
  componentId: string,
): SectionDefinition | undefined {
  return sectionRegistry[componentId];
}

/** カテゴリ別にグループ化したセクション定義を取得 */
export function getSectionsByCategory(): Array<{
  category: string;
  label: string;
  sections: SectionDefinition[];
}> {
  const grouped = new Map<string, SectionDefinition[]>();
  for (const def of Object.values(sectionRegistry)) {
    const list = grouped.get(def.meta.category) ?? [];
    list.push(def);
    grouped.set(def.meta.category, list);
  }
  return CATEGORY_ORDER.map(({ category, label }) => ({
    category,
    label,
    sections: grouped.get(category) ?? [],
  }));
}

const CATEGORY_ORDER = [
  { category: "hero", label: "ヒーロー" },
  { category: "content", label: "コンテンツ" },
  { category: "list", label: "一覧表示" },
  { category: "cta", label: "CTA・フォーム" },
  { category: "media", label: "メディア・埋め込み" },
  { category: "custom", label: "カスタム" },
] as const;
```

### definition.ts のパターン（標準セクション例）

```ts
// src/app/(public)/_shared/components/sections/standard/hero-parallax/definition.ts
import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";
import { ctaButtonArraySchema } from "@/shared/lib/validations/cta-button";

export const heroParallaxConfigSchema = z.object({
  tagline: z.string().max(50).default("Luxury Rental Space").meta({
    description: "タグライン",
    fieldType: "text",
    placeholder: "Luxury Rental Space",
  }),
  title: z.string().default("").meta({
    description: "メインタイトル",
    fieldType: "text",
  }),
  subtitle: z.string().default("").meta({
    description: "サブタイトル",
    fieldType: "textarea",
    rows: 3,
  }),
  backgroundImageUrl: z.string().url().or(z.literal("")).default("").meta({
    description: "背景画像",
    fieldType: "media",
  }),
  buttons: ctaButtonArraySchema.default([]).meta({
    description: "CTA ボタン",
    fieldType: "cta-buttons",
  }),
  parallaxSpeed: z.number().min(0).max(1).default(0.3).meta({
    description: "パララックス速度",
    fieldType: "slider",
  }),
  overlayGradient: z.boolean().default(true).meta({
    description: "オーバーレイグラデーション",
    fieldType: "switch",
  }),
  scrollIndicator: z.boolean().default(true).meta({
    description: "スクロールインジケーター",
    fieldType: "switch",
  }),
  contentPosition: z
    .enum(["center", "left", "bottom-left"])
    .default("center")
    .meta({
      description: "コンテンツ位置",
      fieldType: "select",
    }),
  height: z.enum(["full", "80vh", "60vh"]).default("full").meta({
    description: "高さ",
    fieldType: "select",
  }),
  overlayStyle: z.enum(["gradient", "solid", "none"]).default("gradient").meta({
    description: "オーバーレイスタイル",
    fieldType: "select",
  }),
});

export type HeroParallaxConfig = z.output<typeof heroParallaxConfigSchema>;

export const heroParallaxDefinition: SectionDefinition<
  typeof heroParallaxConfigSchema
> = {
  id: "hero-parallax",
  meta: {
    label: "Hero（パララックス）",
    description: "背景画像のスクロール視差効果付きフルビューポート Hero",
    icon: "Mountain",
    category: "hero",
  },
  configSchema: heroParallaxConfigSchema,
  defaultConfig: heroParallaxConfigSchema.parse({}),
  component: {
    type: "client",
    load: () =>
      import("@/public/components/sections/standard/hero-parallax/HeroParallax"),
  },
  effects: {
    supportsOverlay: true,
    requiresExperienceShell: false,
  },
};
```

### SectionRenderer の再設計

Server Component と Client Component のロード方法を明確に分離する。
`next/dynamic` は Client Component 専用（Next.js 16 公式）。
Server Component は async Server Component 内で直接 `await import()` する。

```tsx
// src/app/(public)/_shared/components/sections/SectionRenderer.tsx
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { getSectionDefinition } from "@/shared/lib/sections/registry";
import { parseSectionDesign } from "@/shared/lib/validations/section-design";
import { sectionEffectConfigSchema } from "@/shared/lib/sections/effects/schemas";
import { SectionWrapper } from "./SectionWrapper";
import { SectionSkeleton } from "./SectionSkeleton";
import { EffectOverlayRenderer } from "../effects/EffectOverlayRenderer";
import type { PublicSection } from "@/shared/domain/sections/queries";

/**
 * componentId → next/dynamic コンポーネントの事前構築マップ。
 * モジュールロード時に全 Client Component のエントリを確定する。
 * next/dynamic の戻り値は軽量な参照のみ（実際のコードは初回レンダリングまでロードされない）。
 */
function buildClientComponentMap(): Record<string, ReturnType<typeof dynamic>> {
  const map: Record<string, ReturnType<typeof dynamic>> = {};
  for (const [id, def] of Object.entries(/* sectionRegistry を直接参照 */ {})) {
    if (def.component.type === "client-only") {
      map[id] = dynamic(def.component.load, { ssr: false });
    } else if (def.component.type === "client") {
      map[id] = dynamic(def.component.load);
    }
    // type === "server" は別パスで処理するため含めない
  }
  return map;
}

// 実際の実装では sectionRegistry を import して buildClientComponentMap に渡す
// ここでは概念を示す

export async function SectionRenderer({ section }: { section: PublicSection }) {
  const definition = getSectionDefinition(section.componentId);
  if (!definition) return null;

  const config = definition.configSchema.parse(section.config);
  const design = parseSectionDesign(section.design);
  const effectConfig = sectionEffectConfigSchema.parse(section.effectConfig);

  // dataLoader がある場合（リスト系セクション等）、追加データを取得
  const extraData = definition.dataLoader
    ? await definition.dataLoader(config)
    : {};

  // Server Component は直接 await import()
  // Client Component は next/dynamic 経由
  let rendered: React.ReactNode;
  if (definition.component.type === "server") {
    const { default: ServerComp } = await definition.component.load();
    rendered = (
      <ServerComp config={config} design={design} extraData={extraData} />
    );
  } else {
    const ClientComp =
      definition.component.type === "client-only"
        ? dynamic(definition.component.load, { ssr: false })
        : dynamic(definition.component.load);
    rendered = (
      <Suspense fallback={<SectionSkeleton />}>
        <ClientComp config={config} design={design} extraData={extraData} />
      </Suspense>
    );
  }

  return (
    <SectionWrapper design={design}>
      {rendered}
      {effectConfig.overlays.length > 0 && (
        <EffectOverlayRenderer effects={effectConfig.overlays} />
      )}
    </SectionWrapper>
  );
}
```

**注意**: `dynamic()` は呼び出し位置で参照がキャッシュされるため、
ループ内で毎回呼ぶとパフォーマンスに影響する可能性がある。
実装時はモジュールレベルで事前構築するか、
`React.cache()` で `dynamic()` の結果をキャッシュすることを検討する。

### ExperienceShell の配置

```tsx
// src/app/(public)/layout.tsx
import { ExperienceShell } from "@/public/components/effects/core/ExperienceShell";
import { PageEffectRenderer } from "@/public/components/effects/PageEffectRenderer";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ...既存の font, metadata, maintenance check 等...

  return (
    <html lang="ja" className={fontVariables}>
      <body>
        <ExperienceShell>
          <SkipLink />
          <AnnouncementBarWrapper />
          <Header />
          <main id="main-content">{children}</main>
          <Footer />
          {/* ページ単位エフェクト（Three.js 背景, PixiJS オーバーレイ等） */}
          <Suspense fallback={null}>
            <PageEffectRenderer />
          </Suspense>
        </ExperienceShell>
      </body>
    </html>
  );
}
```

**トレードオフ**: `ExperienceShell` を layout.tsx に配置すると、全公開ページで
Lenis スムーズスクロールが有効になる。これによりブラウザのネイティブ挙動
（アンカーリンク、ページ内検索、アクセシビリティ支援技術のスクロール）に
干渉する可能性がある。

**対策**: `SmoothScrollProvider` は既に `prefers-reduced-motion` 時に Lenis を
初期化しない設計になっている。追加で、ExperienceShell 内の Lenis 初期化を
「ページにエフェクト付きセクションが 1 つ以上ある場合のみ」に条件化することを
実装時に検討する。`PerformanceMonitor` が GPU 能力不足を検出すれば自動で
L1 まで劣化するため、エフェクト不使用ページでの WebGL オーバーヘッドはゼロ。
Context Provider のコスト（3 層の React Context）は無視できるレベル。

### 管理画面: スキーマ駆動フォーム

```tsx
// src/app/(admin)/admin/(dashboard)/_shared/components/schema-form/SchemaForm.tsx
"use client";

import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { extractFieldDefinitions } from "@/shared/lib/sections/schema-utils";
import { FieldRenderer } from "./FieldRenderer";
import { ConditionalWrapper } from "./ConditionalWrapper";
import { FormActions } from "../form-actions/FormActions";
import type { z } from "zod";

type SchemaFormProps<TSchema extends z.ZodType> = {
  schema: TSchema;
  defaultValues: z.input<TSchema>;
  onSave: (data: z.output<TSchema>) => void | Promise<void>;
  isPending: boolean;
  onDirtyChange?: (dirty: boolean) => void;
};

export function SchemaForm<TSchema extends z.ZodType>({
  schema,
  defaultValues,
  onSave,
  isPending,
  onDirtyChange,
}: SchemaFormProps<TSchema>) {
  const form = useForm({
    resolver: standardSchemaResolver(schema),
    defaultValues,
  });

  const fields = extractFieldDefinitions(schema);

  return (
    <form onSubmit={form.handleSubmit(onSave)} className="space-y-6">
      {fields.map((field) => (
        <ConditionalWrapper
          key={field.name}
          visibleWhen={field.visibleWhen}
          control={form.control}
        >
          <FieldRenderer field={field} form={form} isPending={isPending} />
        </ConditionalWrapper>
      ))}
      <FormActions
        isDirty={form.formState.isDirty}
        isPending={isPending}
        onDirtyChange={onDirtyChange}
      />
    </form>
  );
}
```

`extractFieldDefinitions()` は `z.toJSONSchema(schema)` の出力 + `.meta()` の `FieldUIHint` を組み合わせて、フィールドごとの定義リストを返す:

```ts
// src/shared/lib/sections/schema-utils.ts
import { z } from "zod";
import type { FieldUIHint } from "./types";

export type FieldDefinition = {
  name: string;
  label: string; // .meta().description から
  fieldType: FieldUIHint["fieldType"];
  required: boolean;
  placeholder?: string;
  rows?: number;
  group?: string;
  visibleWhen?: FieldUIHint["visibleWhen"];
  // 型固有
  enumValues?: ReadonlyArray<string>; // z.enum の場合
  min?: number; // z.number の場合
  max?: number;
  defaultValue?: unknown;
};

/**
 * Zod スキーマから FieldDefinition の配列を抽出する。
 *
 * 方式: z.toJSONSchema() のみを使用。
 * Zod 4 の .meta() で設定したカスタムキー（fieldType, placeholder 等）は
 * z.toJSONSchema() の出力に自動的に含まれる（Zod 4 公式仕様）。
 * z.globalRegistry を直接走査する必要はない。
 *
 * JSON Schema の各 property から以下を読み取る:
 * - type → fieldType のデフォルト推論（string→text, number→number, boolean→switch）
 * - description → label
 * - enum → enumValues + fieldType を "select" に推論
 * - minimum/maximum → min/max
 * - default → defaultValue
 * - fieldType, placeholder, rows, group, visibleWhen → FieldUIHint（カスタムキー）
 *
 * カスタムキーの fieldType が明示されていれば推論よりそちらを優先する。
 */
export function extractFieldDefinitions(schema: z.ZodType): FieldDefinition[] {
  const jsonSchema = z.toJSONSchema(schema);
  if (
    typeof jsonSchema !== "object" ||
    jsonSchema === null ||
    !("properties" in jsonSchema)
  ) {
    return [];
  }

  const required = new Set(
    Array.isArray(jsonSchema.required) ? jsonSchema.required : [],
  );
  const fields: FieldDefinition[] = [];

  // NOTE: z.toJSONSchema() の戻り値は JSONSchema7 型。
  // 実装時は jsonschema の型定義を使って型安全にアクセスする。
  // ここでは概念実装として Zod スキーマの .shape を直接走査するパターンを示す。
  // z.toJSONSchema() の出力にはカスタム .meta() キーが含まれるため、
  // JSON Schema + カスタムキーの混合オブジェクトを扱う専用の型定義が必要。
  //
  // 実装では以下の型安全なアプローチを取る:
  // 1. z.toJSONSchema() で JSON Schema を取得（type, enum, min, max, default, required）
  // 2. Zod スキーマの ._def を走査して .meta() 情報を取得（fieldType, placeholder 等）
  // 3. 両者をマージして FieldDefinition を構築
  //
  // _def 走査は Zod 4 の内部 API だが、z.toJSONSchema() が公式にカスタムキーを
  // 出力に含める仕様なので、JSON Schema 出力のパースで完結することも可能。
  // 実装時にどちらが安定的かを検証して採用する。

  // ... JSON Schema properties + .meta() カスタムキーを走査して
  // FieldDefinition[] を構築する。
  // 型アサーション（as）は使用せず、ランタイム型ガード関数で narrowing する。

  return fields;
}

function inferFieldType(
  prop: Record<string, unknown>,
): FieldUIHint["fieldType"] {
  if (Array.isArray(prop.enum)) return "select";
  switch (prop.type) {
    case "string":
      return "text";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "switch";
    case "array":
      return "text"; // 配列は fieldType 明示が必須
    default:
      return "text";
  }
}
```

### SectionDetailPanel の変更

```tsx
// Before（17 個の configFormRegistry から個別フォームを選択）
const ConfigForm = configFormRegistry[section.type];
<ConfigForm section={section} onSave={handleConfigSave} ... />

// After（SchemaForm にスキーマを渡すだけ）
const definition = getSectionDefinition(section.componentId);
{definition && (
  <SchemaForm
    schema={definition.configSchema}
    defaultValues={definition.configSchema.parse(section.config)}
    onSave={handleConfigSave}
    isPending={isPending}
    onDirtyChange={setConfigDirty}
  />
)}
```

**削除対象**: `config-forms/` ディレクトリ内の 17 個のフォームファイル + `index.ts`（configFormRegistry）

### エフェクト管理 UI

```tsx
// src/app/(admin)/admin/(dashboard)/_shared/components/effect-editor/EffectSelector.tsx
// セクション編集画面の「エフェクト」タブに配置

// エフェクトレジストリから選択可能なエフェクト一覧を表示
// 選択されたエフェクトの params を SchemaForm で編集
// → section.effectConfig に保存
```

## マイグレーション戦略

### データ移行

既存 DB データの `type` カラム（`SectionType` enum 値）を `componentId`（kebab-case 文字列）に変換:

| 旧 SectionType   | 新 componentId   |
| ---------------- | ---------------- |
| `HERO`           | `hero`           |
| `HERO_PARALLAX`  | `hero-parallax`  |
| `CUSTOM`         | `custom`         |
| `CONCEPT`        | `concept`        |
| `SPACE_LIST`     | `space-list`     |
| `SPACE_SHOWCASE` | `space-showcase` |
| `NEWS_LIST`      | `news-list`      |
| `POST_LIST`      | `post-list`      |
| `FAQ_LIST`       | `faq-list`       |
| `FEATURES`       | `features`       |
| `TESTIMONIAL`    | `testimonial`    |
| `GALLERY`        | `gallery`        |
| `CTA`            | `cta`            |
| `CONTACT_FORM`   | `contact-form`   |
| `MAP`            | `map`            |
| `EMBED`          | `embed`          |
| `INSTAGRAM`      | `instagram`      |

### Phase 分割

| Phase | 内容                                                                      | 新規/変更ファイル             |
| ----- | ------------------------------------------------------------------------- | ----------------------------- |
| 1     | DB マイグレーション（enum 廃止 + effectConfig 追加）                      | schema.prisma + migration SQL |
| 2     | 型基盤（types.ts, component-ids.ts, registry.ts, schema-utils.ts）        | 4 新規                        |
| 3     | エフェクト層（effects/types.ts, effects/schemas.ts, effects/registry.ts） | 3 新規                        |
| 4     | 標準 17 種を standard/ に移行 + definition.ts 作成                        | 17 フォルダ（各 3 ファイル）  |
| 5     | ドメイン層移行（commands.ts, queries.ts, admin-queries.ts）               | ~6 変更                       |
| 6     | Server Action 移行（page-section.ts, homepage-settings.ts）               | ~4 変更                       |
| 7     | SectionRenderer 書き換え                                                  | 1 変更                        |
| 8     | ExperienceShell を layout.tsx に移動 + PageEffectRenderer                 | 2 変更 + 1 新規               |
| 9     | SchemaForm 実装 + フィールドレンダラー                                    | ~12 新規                      |
| 10    | 管理画面 UI 移行（SectionDetailPanel, AddSectionDialog 等）               | ~8 変更                       |
| 11    | 旧ファイル削除（config-forms/ 20 個、旧 section.ts の型マップ等）         | 20 削除                       |
| 12    | テスト更新                                                                | ~5 変更                       |
| 13    | CLI スキル `create-custom-section` 作成                                   | 1 新規                        |

Phase 5-6 をドメイン層・Server Action に移動（管理画面 UI が依存するため先に実施）。

### 影響ファイル一覧

**削除（~20 ファイル）**:

- `config-forms/*.tsx`（17 個）+ `config-forms/index.ts`
- `config-forms/shared.tsx`
- `SectionTypeIcon.tsx`（registry.meta.icon に移行）

**変更（~25 ファイル）**:

- `prisma/schema.prisma`
- `src/shared/db/enums.ts`（SectionType 削除）
- `src/shared/lib/validations/section.ts`（型マップ → registry に移行）
- `src/shared/lib/validations/enums.ts`（isValidSectionType 削除）
- `src/shared/lib/constants/default-page-sections.ts`
- `src/shared/domain/sections/commands.ts`
- `src/shared/domain/sections/queries.ts`
- `src/shared/domain/sections/admin-queries.ts`
- `src/shared/domain/pages/system-pages.ts`
- `src/app/(admin)/.../actions/page-section.ts`
- `src/app/(admin)/.../actions/homepage-settings.ts`
- `src/app/(admin)/.../queries/homepage-settings.ts`
- `src/app/(admin)/.../queries/page-section.ts`
- `src/app/(admin)/.../AddSectionDialog.tsx`
- `src/app/(admin)/.../SectionDetailPanel.tsx`
- `src/app/(admin)/.../SectionDetailHeader.tsx`
- `src/app/(admin)/.../SectionSidebar.tsx`
- `src/app/(admin)/.../SectionSidebarItem.tsx`
- `src/app/(admin)/.../SectionMasterDetail.tsx`
- `src/app/(admin)/.../HomepageTab.tsx`
- `src/app/(admin)/.../SectionEditor.tsx`
- `src/app/(public)/.../SectionRenderer.tsx`
- `src/app/(public)/layout.tsx`
- `src/app/(public)/page.tsx`
- テスト 5 ファイル

**新規（~30 ファイル）**:

- `src/shared/lib/sections/` 配下（4 ファイル）
- `src/shared/lib/sections/effects/` 配下（3 ファイル）
- `standard/*/definition.ts`（17 ファイル）
- `standard/*/index.ts`（17 ファイル）
- `effects/registry.ts` + `EffectOverlayRenderer.tsx` + `PageEffectRenderer.tsx`
- `schema-form/` 配下（~12 ファイル）
- `effect-editor/` 配下（2 ファイル）

## CLI スキル: `create-custom-section`

### ワークフロー

```
ユーザー: 「多層パララックスで高級感のある Hero を作って」
  ↓
Claude Code:
  1. src/app/(public)/_shared/components/sections/custom/<name>/ を作成
     - definition.ts（スキーマ + メタ + デフォルト値）
     - <ComponentName>.tsx（GSAP / Three.js / PixiJS 自由に使用）
     - index.ts（barrel export）
  2. src/shared/lib/sections/registry.ts にエントリ追加
  3. （オプション）seed スクリプトでデモデータ投入
  ↓
管理者:
  - 管理画面で「セクション追加」→ カスタムカテゴリから選択
  - SchemaForm でテキスト・画像・パラメータを編集
  - エフェクトタブでオーバーレイ追加/調整
  - プレビューで確認 → 公開
```

### 生成テンプレート

definition.ts:

```ts
import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";

export const <name>ConfigSchema = z.object({
  // CLI が要件に応じてフィールドを生成
  // 各フィールドに .meta({ description, fieldType }) を付与
});

export type <Name>Config = z.output<typeof <name>ConfigSchema>;

export const <name>Definition: SectionDefinition<typeof <name>ConfigSchema> = {
  id: "<name>",
  meta: {
    label: "<日本語ラベル>",
    description: "<説明>",
    icon: "<LucideIcon名>",
    category: "custom",
  },
  configSchema: <name>ConfigSchema,
  defaultConfig: <name>ConfigSchema.parse({}),
  component: {
    type: "client-only",  // or "client" / "server"
    load: () => import("./<ComponentName>"),
  },
  effects: {
    supportsOverlay: true,
    requiresExperienceShell: true,  // Three.js/PixiJS 使用時
  },
};
```

## プロジェクト規約との整合性

| 規約                         | 対応                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------- |
| 型アサーション（`as`）禁止   | `satisfies` + ジェネリクスで型安全を確保。`as const` のみ許可（値リテラル型）    |
| ハードコードカラー禁止       | エフェクト params のカラーフィールドも CSS 変数参照を推奨                        |
| `erasableSyntaxOnly`         | `as const` オブジェクト + 型エイリアスで enum 代替                               |
| `verbatimModuleSyntax`       | `import type` を徹底                                                             |
| Server Components 優先       | SectionRenderer は Server Component。`"client"` / `"client-only"` は明示的に指定 |
| `toPlainObject` パターン     | クエリ結果は `Serialized<T>` で Client Component に渡す                          |
| `executeAdminMutationResult` | Server Action は全て既存パターン維持                                             |
| セマンティックカラートークン | SchemaForm の color フィールドは CSS 変数名を入力する UI                         |
