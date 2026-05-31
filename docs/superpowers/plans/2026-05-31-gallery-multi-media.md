# Gallery マルチメディア化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gallery セクションを「画像のみ複数」から「画像・動画 混在の複数メディア」へ clean-break する。

**Architecture:** スキーマの `images` フィールドを `media` に rename し item の `field.image` を `field.media({ accept: "image-or-video" })` に置換。公開レンダラは `detectMediaSourceType(url)` で per-item に `<Image>`(lightbox) / `<VideoPlayer>`(inline) を出し分ける。管理 UI は `AutoArrayField`×`AutoMediaField` が既に汎用対応のためコード変更なし。既存 DB は冪等スクリプトでキー rename。

**Tech Stack:** Zod 4 (field-registry), Next.js 16 RSC/Client, Bun Test, Prisma (Section.config JSON)

---

## File Structure

| ファイル                                                  | 責務                  | 変更                                                            |
| --------------------------------------------------------- | --------------------- | --------------------------------------------------------------- |
| `src/shared/lib/sections/definitions/gallery/schema.ts`   | gallery config schema | 修正（`images`→`media`、item を media 化）                      |
| `src/shared/lib/sections/definitions/gallery/metadata.ts` | gallery ラベル/説明   | 修正                                                            |
| `src/app/(public)/_components/GallerySection.tsx`         | 公開レンダラ          | 修正（media 参照 + image/video 分岐 + lightbox 画像サブセット） |
| `__tests__/unit/lib/validations/section.test.ts`          | schema test           | 修正（`images`→`media`、`safeParse({})` 追加）                  |
| `scripts/migrate-gallery-images-to-media.ts`              | DB 移行               | 新規（冪等 rename スクリプト）                                  |

> 型経由配線（`registry.ts` / `validations/section.ts` / `section-defaults.ts`）は `GalleryConfig` / `galleryConfigSchema` 参照のため自動追従、コード変更不要。

---

### Task 1: gallery schema を `media` に rename + media 化

**Files:**

- Modify: `src/shared/lib/sections/definitions/gallery/schema.ts`
- Test: `__tests__/unit/lib/validations/section.test.ts:592-620`

- [ ] **Step 1: 既存テストを新スキーマ（`media` キー）期待に更新して失敗させる**

`__tests__/unit/lib/validations/section.test.ts` の `describe("galleryConfigSchema", ...)` ブロック（592-620 行）を以下に置換:

```typescript
describe("galleryConfigSchema", () => {
  test("有効なデータ（画像・動画混在）でバリデーション成功", () => {
    const data = {
      media: [
        {
          url: "https://example.com/1.jpg",
          alt: "画像1",
          caption: "キャプション1",
        },
        { url: "https://example.com/clip.mp4", alt: "動画1" },
        { url: "https://www.youtube.com/watch?v=abc123" },
      ],
      gridLayout: "masonry",
      columns: 4,
      gap: "lg",
    };
    const result = galleryConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("空 config でも default 値で safeParse 成功する", () => {
    const result = galleryConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.media).toEqual([]);
      expect(result.data.gridLayout).toBe("grid");
      expect(result.data.columns).toBe(3);
    }
  });

  test("同一 URL の重複でエラー", () => {
    const data = {
      media: [
        { url: "https://example.com/dup.jpg" },
        { url: "https://example.com/dup.jpg" },
      ],
    };
    const result = galleryConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  // canonical schema (`definitions/gallery/schema.ts`) の media[].url は
  // `field.media()` で format 検証しない（任意 URL / R2 path を許可するため）。
  // 不正 URL の判定は UI 層の MediaPicker と公開ページの next/image / VideoPlayer が担う。

  test("columns範囲外でエラー", () => {
    const data = { columns: 7 };
    const result = galleryConfigSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `bun test __tests__/unit/lib/validations/section.test.ts --test-name-pattern "galleryConfigSchema"`
Expected: FAIL（`media` プロパティが存在しない / `images` 必須等）

- [ ] **Step 3: schema を `media` 化**

`src/shared/lib/sections/definitions/gallery/schema.ts` を以下に置換:

```typescript
import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";

const layouts = ["grid", "masonry", "carousel"] as const;
const gaps = ["none", "sm", "md", "lg"] as const;
const imageAspects = ["original", "4:3", "1:1", "16:9"] as const;
const hoverEffects = ["zoom", "overlay", "none"] as const;

export const galleryConfigSchema = z
  .object({
    sectionLabel: field.text("セクションラベル", {
      default: "Gallery",
      maxLength: 50,
      subGroup: "text",
    }),
    title: field.portableTextInline("見出し", { subGroup: "text" }),
    media: field.array("メディア", {
      subGroup: "media",
      fields: {
        url: field.media("メディア", { accept: "image-or-video" }),
        alt: field.text("代替テキスト"),
        caption: field.text("キャプション"),
      },
    }),
    gridLayout: field.select("ギャラリー表示", {
      options: layouts,
      default: "grid",
      group: "design",
      helpText: "メディアの並び方",
    }),
    columns: field.number("1 行あたりの列数", {
      min: 1,
      max: 6,
      default: 3,
      suffix: "列",
      group: "design",
    }),
    gap: field.select("メディアの間隔", {
      options: gaps,
      default: "md",
      group: "design",
    }),
    enableLightbox: field.boolean("クリックで拡大表示する（ライトボックス）", {
      default: true,
    }),
    imageAspect: field.select("画像のアスペクト比", {
      options: imageAspects,
      default: "original",
      group: "design",
    }),
    hoverEffect: field.select("ホバー時のエフェクト", {
      options: hoverEffects,
      default: "zoom",
      group: "design",
    }),
    layout: sectionLayoutSchema,
  })
  .refine(
    (data) => new Set(data.media.map((m) => m.url)).size === data.media.length,
    {
      error: "同じメディアを複数登録することはできません",
      path: ["media"],
    },
  );

export type GalleryConfig = z.infer<typeof galleryConfigSchema>;
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `bun test __tests__/unit/lib/validations/section.test.ts --test-name-pattern "galleryConfigSchema"`
Expected: PASS（4 test）

- [ ] **Step 5: 型チェックでファイルが追従していることを確認**

Run: `bun run type-check`
Expected: PASS（`GalleryConfig.images` 参照が残る `GallerySection.tsx` で TS エラーが出れば Task 3 で解消 — このタスク単独では `GallerySection.tsx` の型エラーが残ってよい。schema / test ファイルにエラーがないことを確認する）

- [ ] **Step 6: コミット**

```bash
git add src/shared/lib/sections/definitions/gallery/schema.ts __tests__/unit/lib/validations/section.test.ts
git commit -m "feat(gallery): config を media 配列(画像・動画混在)に clean-break"
```

---

### Task 2: gallery metadata のラベル更新

**Files:**

- Modify: `src/shared/lib/sections/definitions/gallery/metadata.ts`

- [ ] **Step 1: metadata を更新**

`src/shared/lib/sections/definitions/gallery/metadata.ts` を以下に置換:

```typescript
import type { SectionMetadata } from "../../types";

export const galleryMetadata: SectionMetadata = {
  label: "メディアギャラリー",
  description: "画像・動画のギャラリーを表示します。",
  icon: "IconImages",
  category: "media",
};
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: schema / metadata に新規エラーなし（`GallerySection.tsx` の `.images` エラーのみ残る）

- [ ] **Step 3: コミット**

```bash
git add src/shared/lib/sections/definitions/gallery/metadata.ts
git commit -m "feat(gallery): metadata ラベルをメディアギャラリーに更新"
```

---

### Task 3: 公開レンダラを image/video 分岐に対応

**Files:**

- Modify: `src/app/(public)/_components/GallerySection.tsx`

- [ ] **Step 1: import に VideoPlayer / detectMediaSourceType を追加**

`src/app/(public)/_components/GallerySection.tsx` の import 群（14-40 行付近）に以下 2 行を追加（既存 import の近くに配置）:

```typescript
import { VideoPlayer } from "@/public/components/design-system/video-player";
import { detectMediaSourceType } from "@/shared/lib/media/detect-media-type";
```

- [ ] **Step 2: `config.images` 参照を `config.media` に置換 + lightbox を画像サブセット化**

ロジック部分（86-128 行付近）を以下に置換。ポイント:

- lightbox 操作は画像のみの配列 `imageItems` を index 対象にする
- grid は全 `config.media` を走査する

```typescript
  const openLightbox = (imageIndex: number) => {
    if (!config.enableLightbox) return;
    setLightboxIndex(imageIndex);
    dialogRef.current?.showModal();
  };

  const closeLightbox = () => {
    dialogRef.current?.close();
    setLightboxIndex(-1);
  };

  // lightbox は画像のみを対象にする（動画はインライン再生）
  const imageItems = config.media.filter(
    (m) => detectMediaSourceType(m.url) !== "video",
  );

  const navigateLightbox = (direction: 1 | -1) => {
    setLightboxIndex((prev) => {
      const next = prev + direction;
      if (next < 0) return imageItems.length - 1;
      if (next >= imageItems.length) return 0;
      return next;
    });
  };

  if (config.media.length === 0) return <></>;

  const gapClass = GALLERY_GAP_MAP[config.gap] ?? GALLERY_GAP_MAP.md;
  const colKey = Math.min(Math.max(config.columns, 1), 6);

  const isMasonry = config.gridLayout === "masonry";
  const isCarousel = config.gridLayout === "carousel";

  const imageAspect = parseGalleryImageAspect(config.imageAspect);
  const aspectClass = IMAGE_ASPECT_MAP[imageAspect];
  const hoverEffect = parseGalleryHoverEffect(config.hoverEffect);
  const hoverClasses = GALLERY_HOVER_EFFECT_MAP[hoverEffect];

  const layoutClass = isCarousel
    ? "flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-4 -mx-5 px-5 md:-mx-8 md:px-8"
    : isMasonry
      ? cn(getMasonryColsClass(colKey), gapClass)
      : cn("@container grid", getGalleryGridColsClass(colKey), gapClass);

  const lightboxImage =
    lightboxIndex >= 0 && lightboxIndex < imageItems.length
      ? imageItems[lightboxIndex]
      : undefined;
```

- [ ] **Step 3: grid map を image/video 分岐に置換**

grid map 部分（152-203 行付近、`<div ref={gridRef} ...>` 内の `config.images.map(...)`）を以下に置換:

```typescript
      <div ref={gridRef} className={layoutClass}>
        {config.media.map((item) => {
          const isVideo = detectMediaSourceType(item.url) === "video";
          // lightbox の index は画像サブセット内の位置
          const imageIndex = isVideo
            ? -1
            : imageItems.findIndex((m) => m.url === item.url);
          return (
            <div
              key={item.url}
              data-gallery-item=""
              className={cn(
                hoverClasses.wrapper,
                isCarousel && "min-w-[280px] snap-center md:min-w-[320px]",
                isMasonry && "mb-4 break-inside-avoid",
              )}
            >
              {isVideo ? (
                <div className={cn("relative block w-full overflow-hidden", aspectClass)}>
                  <VideoPlayer
                    url={item.url}
                    variant="controls"
                    {...(item.alt.length > 0 && { title: item.alt })}
                    className="h-full w-full"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openLightbox(imageIndex)}
                  className={cn(
                    "relative block w-full overflow-hidden",
                    aspectClass,
                  )}
                  disabled={!config.enableLightbox}
                  aria-label={item.alt.length > 0 ? item.alt : "ギャラリー画像を拡大表示"}
                >
                  <Image
                    src={item.url}
                    alt={item.alt}
                    width={600}
                    height={400}
                    className={cn(
                      "h-full w-full object-cover transition-transform duration-500",
                      hoverEffect === "zoom" && "group-hover:scale-105",
                    )}
                    sizes={`(max-width: 768px) 100vw, ${Math.round(100 / colKey)}vw`}
                  />
                  {hoverClasses.overlay && (
                    <div
                      className={cn(
                        "absolute inset-0 bg-foreground/20",
                        hoverClasses.overlay,
                      )}
                    />
                  )}
                </button>
              )}
              {item.caption.length > 0 && (
                <p
                  className="mt-2 text-xs text-muted-foreground"
                  style={getTextStyle(style)}
                >
                  {item.caption}
                </p>
              )}
            </div>
          );
        })}
      </div>
```

> 注: `item.alt` / `item.caption` は `field.text` の `.default("")` で常に string。`?? ""` ではなく `.length > 0` gate を使う（空文字列を渡さない）。

- [ ] **Step 4: lightbox 内の `lightboxImage.alt ?? ""` を `.alt` に修正**

lightbox 内の `<Image ... alt={lightboxImage.alt ?? ""}>`（243-249 行付近）を `alt={lightboxImage.alt}` に変更（`alt` は常に string のため）。`lightboxImage.caption && (...)` の caption 表示は `lightboxImage.caption.length > 0 && (...)` に変更。

- [ ] **Step 5: 型チェック**

Run: `bun run type-check`
Expected: PASS（全ファイル エラーなし）

- [ ] **Step 6: lint**

Run: `bun run lint`
Expected: PASS（button ネスト違反 / hardcode color なし）

- [ ] **Step 7: コミット**

```bash
git add "src/app/(public)/_components/GallerySection.tsx"
git commit -m "feat(gallery): 公開描画で画像=lightbox/動画=インライン再生に出し分け"
```

---

### Task 4: 既存 DB の `images`→`media` 移行スクリプト

**Files:**

- Create: `scripts/migrate-gallery-images-to-media.ts`

- [ ] **Step 1: 冪等移行スクリプトを作成**

`scripts/migrate-gallery-images-to-media.ts` を新規作成:

```typescript
/**
 * gallery セクションの Section.config.images → config.media 一回限り rename スクリプト。
 *
 * clean-break（後方互換マッパーなし）に伴う一回限りのデータ移行。
 * - `type === "gallery"` の Section を走査
 * - config に `images` キーがあり `media` キーが無いものだけ rename（冪等）
 * - 既存の画像 URL 値はそのまま有効（画像は valid な media）
 *
 * 実行: bun scripts/migrate-gallery-images-to-media.ts [--dry-run]
 */

import { PrismaClient } from "@generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { isRecord } from "@/shared/lib/serialize";
import { logger } from "@/shared/lib/logger";

const isDryRun = process.argv.slice(2).includes("--dry-run");

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

async function main() {
  const sections = await prisma.section.findMany({
    where: { type: "gallery" },
    select: { id: true, config: true },
  });

  let migrated = 0;
  let skipped = 0;

  for (const section of sections) {
    const config = section.config;
    if (!isRecord(config)) {
      skipped++;
      continue;
    }
    const hasImages = "images" in config;
    const hasMedia = "media" in config;
    if (!hasImages || hasMedia) {
      skipped++;
      continue;
    }

    const { images, ...rest } = config;
    const nextConfig = { ...rest, media: images };

    logger.info("gallery migrate", {
      sectionId: section.id,
      dryRun: isDryRun,
    });

    if (!isDryRun) {
      await prisma.section.update({
        where: { id: section.id },
        data: { config: nextConfig },
      });
    }
    migrated++;
  }

  logger.info("gallery migrate done", {
    total: sections.length,
    migrated,
    skipped,
    dryRun: isDryRun,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    logger.error("gallery migrate failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    await prisma.$disconnect();
    process.exitCode = 1;
  });
```

> 実 PrismaClient 生成方法（adapter / import path）は既存 `scripts/` の参照実装に合わせる。`scripts/backfill-oauth-token-encryption.ts` を Read して `PrismaClient` / adapter 初期化パターンが異なる場合はそれに合わせて修正する（このスクリプトのビジネスロジック = rename 部分は不変）。

- [ ] **Step 2: dry-run でスクリプトが起動することを確認**

Run: `bun scripts/migrate-gallery-images-to-media.ts --dry-run`
Expected: 起動し `gallery migrate done` ログ（ローカル DB 接続可なら migrated/skipped 件数、接続不可なら接続エラーで終了 — ロジックエラーでないこと）

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add scripts/migrate-gallery-images-to-media.ts
git commit -m "chore(gallery): images→media 一回限り移行スクリプトを追加"
```

---

### Task 5: 最終検証

- [ ] **Step 1: validate + build**

Run: `bun run validate && bun run build`
Expected: exit 0

- [ ] **Step 2: gallery 関連 unit test**

Run: `bun test __tests__/unit/lib/validations/section.test.ts`
Expected: PASS（gallery 4 test 含む全件）

- [ ] **Step 3: 公開ページ実機確認（任意・推奨）**

`bun dev`（手動管理）で gallery セクションを持つページを開き:

- 画像 = クリックで lightbox 拡大、前後ナビが画像のみを巡回
- 動画 = grid 内でインライン再生（R2 mp4 / YouTube）
- 動画が `<button>` にネストされていないこと（DevTools で確認、または `audit-a11y` skill）

- [ ] **Step 4: 移行スクリプトの本番実行（デプロイ後・運用作業）**

デプロイ環境で `bun scripts/migrate-gallery-images-to-media.ts --dry-run` → 件数確認 → `bun scripts/migrate-gallery-images-to-media.ts` で本実行。コード側完了とは別の ops タスク。

---

## Self-Review

- **Spec coverage**: ① schema media 化=Task1 ② metadata=Task2 ③ renderer 分岐=Task3 ④ 管理 UI=変更なし（plan で明記）⑤ データ移行=Task4 ⑥ テスト=Task1（safeParse({}) + uniqueness + 混在）。全カバー。
- **Placeholder scan**: TBD/TODO なし。全 step に実コード。
- **Type consistency**: `config.media`（`GalleryConfig.media: { url; alt; caption }[]`）は Task1 の schema 定義と一致。`item.alt` / `item.caption` は `.default("")` で string、`.length > 0` gate で統一。`imageItems` / `imageIndex` は Task3 内で定義・参照一致。
