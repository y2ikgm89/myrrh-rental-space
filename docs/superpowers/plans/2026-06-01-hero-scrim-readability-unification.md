# Hero スクリム / 文字可読性の統一 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 背景メディアにテキストを重ねる 2 系統（`hero` / `page-hero` media）の overlay を「scrim tone（dark/light）+ opacity + 3 層テキスト防御」モデルに統一し、`hero-parallax` の未使用 overlay デッドコードを撤去する。

**Architecture:** スキーマ SSoT (`_shared/scrim.ts`) とレンダリング SSoT (`hero-scrim.tsx`) を新設し、`StandardHeroSection` / `MediaHero` を寄せる。`scrimTone` が文字色とハロー色を一意に決めるため壊れた組み合わせが作れない。既存 DB は Prisma data migration（SQL `jsonb_set`）で見た目維持。

**Tech Stack:** Next.js 16 / React 19 / Zod 4 / conform / Tailwind 4 / Prisma 7 (Postgres jsonb) / Bun Test。

**Spec:** `docs/superpowers/specs/2026-06-01-hero-scrim-readability-unification-design.md`

**PR 分割:** Phase 1 = PR1（scrim SSoT + hero/page-hero 統一 + migration）、Phase 2 = PR2（hero-parallax デッドコード撤去）。各 Phase 完了時に `bun run validate && bun run build` → commit → push → PR。

---

## Phase 1 (PR1): scrim SSoT + hero / page-hero 統一

ブランチ: `feat/hero-scrim-readability-unification`（既存、spec コミット済）。

### Task 1.1: scrim スキーマ SSoT を新設

**Files:**

- Create: `src/shared/lib/sections/definitions/_shared/scrim.ts`
- Test: `__tests__/unit/domain/sections/scrim-schema.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// __tests__/unit/domain/sections/scrim-schema.test.ts
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  SCRIM_TONES,
  createScrimFields,
} from "@/shared/lib/sections/definitions/_shared/scrim";

describe("createScrimFields", () => {
  const schema = z.object({ ...createScrimFields() });

  test("空オブジェクトで default が適用される", () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scrimTone).toBe("dark");
      expect(result.data.scrimOpacity).toBe(40);
    }
  });

  test("有効な tone / opacity を受理する", () => {
    const result = schema.safeParse({ scrimTone: "light", scrimOpacity: 0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scrimTone).toBe("light");
      expect(result.data.scrimOpacity).toBe(0);
    }
  });

  test("不正な tone は reject", () => {
    expect(schema.safeParse({ scrimTone: "rainbow" }).success).toBe(false);
  });

  test("opacity 範囲外は reject", () => {
    expect(schema.safeParse({ scrimOpacity: 150 }).success).toBe(false);
  });

  test("SCRIM_TONES は dark / light の 2 値", () => {
    expect([...SCRIM_TONES]).toEqual(["dark", "light"]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `bun test __tests__/unit/domain/sections/scrim-schema.test.ts`
Expected: FAIL（`Cannot find module .../_shared/scrim`）

- [ ] **Step 3: scrim.ts を実装**

```ts
// src/shared/lib/sections/definitions/_shared/scrim.ts
/**
 * 共通スクリム（背景メディア上の readability overlay）factory
 *
 * テキストを画像に重ねる hero 系（`hero` / `page-hero` media variant）の SSoT。
 * `scrimTone` が「スクリム色 + 文字色 + ハロー色」を一意に決めるため、編集者が
 * 壊れた組み合わせ（明スクリム + 明文字 等）を作れない。レンダリング側は
 * `@/public/components/page-hero/hero-scrim` の `HeroScrim` / `getHeroTextClasses`
 * が tone から派生する。
 *
 * `_shared/media.ts` の `HERO_BG_TRANSITIONS` と同じ「`as const` 配列 + factory」
 * 自己完結パターン。`section-options.ts` / `section-parsers.ts` には登録しない。
 */

import { field } from "../../field-registry";

/** スクリムのトーン SSoT（dark=暗スクリム+明文字 / light=明スクリム+暗文字） */
export const SCRIM_TONES = ["dark", "light"] as const;
export type ScrimTone = (typeof SCRIM_TONES)[number];

/** hero 系の背景スクリム共通フィールド（spread して各 schema に注入） */
export function createScrimFields() {
  return {
    scrimTone: field.select("オーバーレイのトーン", {
      options: SCRIM_TONES,
      default: "dark",
      group: "design",
      helpText:
        "dark=暗いスクリム+明るい文字 / light=明るいスクリム+暗い文字。背景に合わせて選ぶ",
    }),
    scrimOpacity: field.number("オーバーレイの濃さ", {
      min: 0,
      max: 100,
      default: 40,
      suffix: "%",
      group: "design",
      helpText: "0% でスクリムなし（文字の縁取り・影は維持されます）",
    }),
  };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `bun test __tests__/unit/domain/sections/scrim-schema.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: コミット**

```bash
git add src/shared/lib/sections/definitions/_shared/scrim.ts __tests__/unit/domain/sections/scrim-schema.test.ts
git commit -m "feat(hero): scrim tone/opacity の共通スキーマ SSoT を追加"
```

---

### Task 1.2: scrim レンダリング SSoT（HeroScrim + getHeroTextClasses）を新設

**Files:**

- Create: `src/app/(public)/_shared/components/page-hero/hero-scrim.tsx`
- Test: `__tests__/unit/components/public/hero-scrim.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// __tests__/unit/components/public/hero-scrim.test.ts
import { describe, expect, test } from "bun:test";
import { getHeroTextClasses } from "@/app/(public)/_shared/components/page-hero/hero-scrim";

describe("getHeroTextClasses", () => {
  test("dark tone は明文字 + 黒ハロー", () => {
    const c = getHeroTextClasses("dark");
    expect(c.base).toContain("text-background");
    expect(c.title).toContain("text-background");
    expect(c.title).toContain("paint-order:stroke_fill");
    expect(c.title).toContain("rgb(0_0_0/");
  });

  test("light tone は暗文字 + 白ハロー", () => {
    const c = getHeroTextClasses("light");
    expect(c.base).toContain("text-foreground");
    expect(c.title).toContain("text-foreground");
    expect(c.title).toContain("paint-order:stroke_fill");
    expect(c.title).toContain("rgb(255_255_255/");
  });

  test("全要素キーが返る", () => {
    const c = getHeroTextClasses("dark");
    expect(Object.keys(c).sort()).toEqual(
      ["base", "label", "subtitle", "title"].sort(),
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `bun test __tests__/unit/components/public/hero-scrim.test.ts`
Expected: FAIL（module not found）

- [ ] **Step 3: hero-scrim.tsx を実装**

> stroke/shadow の dark 値は現行 `MediaHero.tsx` の実装値を移設。light 値は反転（白ハロー）。`tailwind-patterns/inline-style-vs-arbitrary.md` 準拠で arbitrary class。

```tsx
// src/app/(public)/_shared/components/page-hero/hero-scrim.tsx
/**
 * Hero 背景スクリム + テキスト可読性防御の共有 SSoT（client-safe pure module）
 *
 * `scrimTone` から「スクリム色」「文字色 + 縁取り + 多層影（3 層防御）」を派生する。
 * テキストを画像に重ねる hero（StandardHeroSection / MediaHero）が共有する。
 * a11y: hero title の blessed pattern（semi-transparent scrim + paint-order:stroke
 * + 多層 text-shadow）に準拠（frontend/accessibility/images-text.md）。
 */

import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import type { ScrimTone } from "@/shared/lib/sections/definitions/_shared/scrim";

export function HeroScrim({
  tone,
  opacity,
}: {
  readonly tone: ScrimTone;
  readonly opacity: number; // 0–100
}): ReactElement | null {
  if (opacity <= 0) return null;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute inset-0",
        tone === "dark" ? "bg-foreground" : "bg-background",
      )}
      style={{ opacity: opacity / 100 }}
    />
  );
}

export interface HeroTextClasses {
  /** content wrapper の文字色 */
  readonly base: string;
  readonly title: string;
  readonly subtitle: string;
  readonly label: string;
}

const DARK: HeroTextClasses = {
  base: "text-background",
  label: cn(
    "text-background",
    "[paint-order:stroke_fill]",
    "[-webkit-text-stroke:0.4px_rgb(0_0_0/0.4)]",
    "[text-shadow:0_1px_3px_rgb(0_0_0/0.55)]",
  ),
  title: cn(
    "text-background",
    "[paint-order:stroke_fill]",
    "[-webkit-text-stroke:0.5px_rgb(0_0_0/0.45)]",
    "[text-shadow:0_1px_2px_rgb(0_0_0/0.6),0_2px_12px_rgb(0_0_0/0.5)]",
  ),
  subtitle: cn(
    "text-background/90",
    "[paint-order:stroke_fill]",
    "[-webkit-text-stroke:0.3px_rgb(0_0_0/0.35)]",
    "[text-shadow:0_1px_2px_rgb(0_0_0/0.55)]",
  ),
};

const LIGHT: HeroTextClasses = {
  base: "text-foreground",
  label: cn(
    "text-foreground",
    "[paint-order:stroke_fill]",
    "[-webkit-text-stroke:0.4px_rgb(255_255_255/0.5)]",
    "[text-shadow:0_1px_3px_rgb(255_255_255/0.6)]",
  ),
  title: cn(
    "text-foreground",
    "[paint-order:stroke_fill]",
    "[-webkit-text-stroke:0.5px_rgb(255_255_255/0.55)]",
    "[text-shadow:0_1px_2px_rgb(255_255_255/0.7),0_2px_12px_rgb(255_255_255/0.5)]",
  ),
  subtitle: cn(
    "text-foreground/90",
    "[paint-order:stroke_fill]",
    "[-webkit-text-stroke:0.3px_rgb(255_255_255/0.45)]",
    "[text-shadow:0_1px_2px_rgb(255_255_255/0.6)]",
  ),
};

export function getHeroTextClasses(tone: ScrimTone): HeroTextClasses {
  return tone === "dark" ? DARK : LIGHT;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `bun test __tests__/unit/components/public/hero-scrim.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: コミット**

```bash
git add "src/app/(public)/_shared/components/page-hero/hero-scrim.tsx" "__tests__/unit/components/public/hero-scrim.test.ts"
git commit -m "feat(hero): HeroScrim + getHeroTextClasses 共有レンダリング SSoT を追加"
```

---

### Task 1.3: `hero` schema を scrim フィールドへ移行

**Files:**

- Modify: `src/shared/lib/sections/definitions/hero/schema.ts`
- Test: `__tests__/unit/domain/sections/hero-schema.test.ts`（既存。scrim assertion を追加）

- [ ] **Step 1: 失敗するテストを追加**

既存 `hero-schema.test.ts` に以下 `test` を追加（既存 import の `heroConfigSchema` を利用）。

```ts
test("scrimTone / scrimOpacity の default が適用され、overlay 系キーは持たない", () => {
  const result = heroConfigSchema.safeParse({});
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.scrimTone).toBe("dark");
    expect(result.data.scrimOpacity).toBe(40);
    expect("overlay" in result.data).toBe(false);
    expect("overlayOpacity" in result.data).toBe(false);
  }
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `bun test __tests__/unit/domain/sections/hero-schema.test.ts`
Expected: FAIL（`scrimTone` undefined / `overlay` がまだ存在）

- [ ] **Step 3: hero/schema.ts を編集**

`import` に scrim factory を追加（既存 import 群の後）:

```ts
import { createScrimFields } from "../_shared/scrim";
```

`heroConfigSchema` の `overlay` + `overlayOpacity` の 2 フィールド定義（現状）:

```ts
    overlay: field.boolean("画像の上に黒いオーバーレイを重ねる", {
      default: true,
      group: "design",
    }),
    overlayOpacity: field.number("オーバーレイの濃さ", {
      min: 0,
      max: 100,
      default: 40,
      suffix: "%",
      helpText: "0% は透明、100% は完全に黒",
      group: "design",
    }),
```

を次へ置換:

```ts
    ...createScrimFields(),
```

- [ ] **Step 4: テストが通ることを確認**

Run: `bun test __tests__/unit/domain/sections/hero-schema.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add "src/shared/lib/sections/definitions/hero/schema.ts" "__tests__/unit/domain/sections/hero-schema.test.ts"
git commit -m "feat(hero): hero schema の overlay を scrim tone/opacity に置換"
```

---

### Task 1.4: `page-hero` media schema を scrim フィールドへ移行

**Files:**

- Modify: `src/shared/lib/sections/definitions/page-hero/schema.ts`
- Test: `__tests__/unit/domain/sections/page-hero-schema.test.ts`（既存があれば追記、無ければ新規）

- [ ] **Step 1: 失敗するテストを追加/作成**

既存テストがあれば追記、無ければ新規作成:

```ts
// __tests__/unit/domain/sections/page-hero-schema.test.ts（新規時）
import { describe, expect, test } from "bun:test";
import { pageHeroConfigSchema } from "@/shared/lib/sections/definitions/page-hero/schema";

describe("pageHeroConfigSchema media variant", () => {
  test("media variant で scrimTone/scrimOpacity default、overlay 系は持たない", () => {
    const result = pageHeroConfigSchema.safeParse({ variant: "media" });
    expect(result.success).toBe(true);
    if (result.success && result.data.variant === "media") {
      expect(result.data.scrimTone).toBe("dark");
      expect(result.data.scrimOpacity).toBe(40);
      expect("overlay" in result.data).toBe(false);
      expect("overlayOpacity" in result.data).toBe(false);
    }
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `bun test __tests__/unit/domain/sections/page-hero-schema.test.ts`
Expected: FAIL

- [ ] **Step 3: page-hero/schema.ts を編集**

`import` に追加:

```ts
import { createScrimFields } from "../_shared/scrim";
```

`mediaSchema` 内の `overlay` + `overlayOpacity` 定義（現状）:

```ts
  overlay: field.boolean("テキスト可読性のためのオーバーレイを表示", {
    default: true,
    group: "design",
    helpText: "メディア上に半透明レイヤーを重ねて見出しを読みやすくする",
  }),
  overlayOpacity: field.number("オーバーレイの濃さ", {
    min: 0,
    max: 100,
    default: 40,
    suffix: "%",
    group: "design",
    helpText: "0% は透明、100% は完全に黒",
  }),
```

を次へ置換:

```ts
  ...createScrimFields(),
```

- [ ] **Step 4: テストが通ることを確認**

Run: `bun test __tests__/unit/domain/sections/page-hero-schema.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add "src/shared/lib/sections/definitions/page-hero/schema.ts" "__tests__/unit/domain/sections/page-hero-schema.test.ts"
git commit -m "feat(hero): page-hero media schema の overlay を scrim tone/opacity に置換"
```

---

### Task 1.5: `MediaHero` を共有 helper に置換

**Files:**

- Modify: `src/app/(public)/_shared/components/page-hero/MediaHero.tsx`

- [ ] **Step 1: import 追加 + props 置換**

`import` に追加:

```ts
import { HeroScrim, getHeroTextClasses } from "./hero-scrim";
```

`MediaHeroProps` は `Omit<Extract<PageHeroConfig, { variant: "media" }>, "variant" | "layout">` のままで OK（schema 変更で `overlay`/`overlayOpacity` が消え `scrimTone`/`scrimOpacity` が増える）。分割代入を更新:

```ts
export function MediaHero({
  label,
  title,
  description,
  media,
  transition,
  autoPlayInterval,
  posterImage,
  scrimTone,
  scrimOpacity,
  buttons,
}: MediaHeroProps): ReactElement {
  // ...
  const text = getHeroTextClasses(scrimTone);
```

- [ ] **Step 2: overlay div を HeroScrim に置換**

現状:

```tsx
{
  /* Readability overlay (WCAG 1.4.3) */
}
{
  overlay && (
    <div
      className="absolute inset-0 bg-foreground"
      style={{ opacity: overlayOpacity / 100 }}
      aria-hidden="true"
    />
  );
}
```

を置換:

```tsx
{
  /* Readability scrim (WCAG 1.4.3) */
}
<HeroScrim tone={scrimTone} opacity={scrimOpacity} />;
```

- [ ] **Step 3: content wrapper + 各テキストのクラスを helper 由来に置換**

content wrapper（`text-background` ハードコード → `text.base`）:

```tsx
      <div
        ref={contentRef}
        className={cn(
          "relative z-10 mx-auto max-w-3xl text-center",
          text.base,
          "ps-[var(--container-padding-start)] pe-[var(--container-padding-end)]",
          "py-[var(--space-lg)]",
        )}
      >
```

label の className 内、ハードコードの `text-background [paint-order...] [-webkit-text-stroke...] [text-shadow...]` を `text.label` に置換:

```tsx
<p
  className={cn("mb-6 text-[0.75rem] uppercase tracking-[0.18em]", text.label)}
>
  <PortableTextSpans spans={label} />
</p>
```

title の className 内、`text-background [paint-order...]...` を `text.title` に置換:

```tsx
          <h1
            className={cn(
              "font-heading font-light leading-[1.1] tracking-tight",
              "text-[clamp(2.5rem,7vw,4.5rem)]",
              text.title,
            )}
          >
```

description の className 内、`text-background/90 [paint-order...]...` を `text.subtitle` に置換:

```tsx
            <div
              className={cn(
                "mx-auto mt-6 max-w-xl text-sm leading-relaxed md:text-base",
                "[&_p]:mt-0 [&_p+p]:mt-3",
                text.subtitle,
              )}
            >
```

- [ ] **Step 4: 型チェック**

Run: `bun run type-check`
Expected: PASS（`overlay`/`overlayOpacity` 参照が消え、`scrimTone`/`scrimOpacity` が型に存在）

- [ ] **Step 5: コミット**

```bash
git add "src/app/(public)/_shared/components/page-hero/MediaHero.tsx"
git commit -m "refactor(hero): MediaHero を HeroScrim/getHeroTextClasses 共有 helper に統一"
```

---

### Task 1.6: `StandardHeroSection` に scrim + テキスト防御を適用

**Files:**

- Modify: `src/app/(public)/_components/StandardHeroSection.tsx`

- [ ] **Step 1: import 追加**

```ts
import {
  HeroScrim,
  getHeroTextClasses,
} from "@/public/components/page-hero/hero-scrim";
```

- [ ] **Step 2: text classes を算出（default / split / parallax の共通箇所）**

`StandardHeroSection` 本体の派生値（`heightClass` 付近）に追加:

```ts
const text = getHeroTextClasses(config.scrimTone);
```

- [ ] **Step 3: split variant の overlay は無し（右カラム画像は HeroBackgroundSlideshow のまま）だが、テキストは左カラム白背景上のため text 防御は不要**

> split variant はテキストが左カラム（背景なし領域）にあり画像と分離しているため、`getHeroTextClasses` を適用しない（現行の `text-foreground` 維持）。**変更は default / parallax variant のみ**。split の `config.overlay` 参照は元々ないため、scrim 追加も不要。

（確認: split variant ブロックに `config.overlay` 参照がないこと。あれば削除。）

- [ ] **Step 4: default / parallax variant の overlay div を HeroScrim に置換**

現状:

```tsx
{
  /* Overlay */
}
{
  config.overlay && (
    <div
      className="absolute inset-0 bg-background"
      style={{ opacity: config.overlayOpacity / 100 }}
      aria-hidden="true"
    />
  );
}
```

を置換:

```tsx
{
  /* Readability scrim */
}
<HeroScrim tone={config.scrimTone} opacity={config.scrimOpacity} />;
```

- [ ] **Step 5: default / parallax の content テキストに text 防御を適用**

content wrapper（`text-center` の div）に `text.base` を追加:

```tsx
      <div
        ref={contentRef}
        className={cn("relative z-10 px-[var(--container-padding)] text-center", text.base)}
      >
```

sectionLabel（`<SectionLabel>`）は装飾ラベルだが tone に合わせるため、その親 div か SectionLabel を `text.label` で包む。最小対応として h1 と subtitle にクラス付与:

title の Heading の className に `text.title` を追加:

```tsx
            <Heading
              level={1}
              className={cn("text-page-hero leading-tight tracking-tight", text.title)}
            >
```

subtitle の div の className に `text.subtitle` を追加（現状 `text-muted-foreground` を tone 由来へ置換）:

```tsx
            <div
              className={cn(
                "mx-auto mt-4 max-w-lg text-sm leading-relaxed md:mt-6 md:text-base",
                "[&_p]:mt-0 [&_p+p]:mt-3",
                text.subtitle,
              )}
              style={getTextStyle(style)}
            >
```

> **注意**: `minimal` variant ブロック（`useMinimalLayout`）は背景メディアなしで `bg-background` 上に `text-foreground` 表示のため、**一切変更しない**（`text.base` / scrim を適用しない）。

- [ ] **Step 6: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add "src/app/(public)/_components/StandardHeroSection.tsx"
git commit -m "feat(hero): StandardHeroSection に scrim + 3層テキスト防御を適用"
```

---

### Task 1.7: 旧 overlay 参照の残存を grep で確認

**Files:** なし（検証のみ）

- [ ] **Step 1: hero / page-hero の旧キー参照ゼロを確認**

Run:

```bash
grep -rn "\.overlay\b\|\.overlayOpacity\|config.overlay\b\|overlayOpacity" "src/app/(public)/_components/StandardHeroSection.tsx" "src/app/(public)/_shared/components/page-hero/MediaHero.tsx"
```

Expected: ヒットゼロ（残っていれば該当箇所を Task 1.5/1.6 のパターンで修正）。

- [ ] **Step 2: section-defaults / parsers が hero/page-hero の overlay を参照していないか確認**

Run:

```bash
grep -rn "overlay" src/shared/lib/validations/section-defaults.ts src/app/\(public\)/_shared/components/sections/
```

Expected: hero/page-hero 関連の `overlay`/`overlayOpacity` 参照なし（`OVERLAY_STYLE_MAP`/`overlayStyle` は Phase 2 で処理するため残っていてよい）。

---

### Task 1.8: Prisma data migration（hero / page-hero の config 変換）

**Files:**

- Create: `prisma/migrations/<timestamp>_hero_overlay_to_scrim/migration.sql`

> `<timestamp>` は `prisma migrate dev` が採番。本プロジェクトは非対話のため、既存 migration 末尾より後の `YYYYMMDDHHMMSS` を手採番してディレクトリ作成 → `migration.sql` 手書き → `bunx --bun prisma migrate deploy`（dev DB）で適用 → `prisma migrate status` 確認、の順（`git-migration.md` 参照）。

- [ ] **Step 1: migration ディレクトリと SQL を作成**

```sql
-- prisma/migrations/<timestamp>_hero_overlay_to_scrim/migration.sql
-- hero / page-hero(media) の overlay(bool)+overlayOpacity を scrimTone+scrimOpacity に変換（冪等）。
-- 既存の見た目を維持: hero=白スクリム→"light" / page-hero(media)=黒スクリム→"dark"。
-- overlay=false は scrimOpacity=0。既に scrimTone を持つ行はスキップ（冪等）。
-- Section.config は jsonb。

-- hero: 白スクリム → light
UPDATE "sections"
SET config =
  (config - 'overlay' - 'overlayOpacity')
  || jsonb_build_object(
       'scrimTone', 'light',
       'scrimOpacity',
       CASE
         WHEN (config -> 'overlay') = 'false'::jsonb THEN 0
         ELSE COALESCE((config ->> 'overlayOpacity')::int, 40)
       END
     )
WHERE type = 'hero'
  AND NOT (config ? 'scrimTone');

-- page-hero media variant: 黒スクリム → dark
UPDATE "sections"
SET config =
  (config - 'overlay' - 'overlayOpacity')
  || jsonb_build_object(
       'scrimTone', 'dark',
       'scrimOpacity',
       CASE
         WHEN (config -> 'overlay') = 'false'::jsonb THEN 0
         ELSE COALESCE((config ->> 'overlayOpacity')::int, 40)
       END
     )
WHERE type = 'page-hero'
  AND config ->> 'variant' = 'media'
  AND NOT (config ? 'scrimTone');
```

- [ ] **Step 2: dev DB に適用**

Run:

```bash
bunx --bun prisma migrate deploy
bunx --bun prisma migrate status
```

Expected: `Database schema is up to date!`（新 migration が applied）。

- [ ] **Step 3: 変換結果を目視確認（任意）**

Run（dev DB に hero/page-hero データがある場合）:

```bash
bunx --bun prisma studio
```

`sections` テーブルで `type='hero'` の `config` に `scrimTone:"light"`、`type='page-hero'`(media) に `scrimTone:"dark"` が入り、`overlay`/`overlayOpacity` が消えていることを確認。

- [ ] **Step 4: seed のデフォルト config を確認・更新**

Run:

```bash
grep -rn "overlay\b\|overlayOpacity" prisma/seed.ts src/shared/lib/sections/definitions/page-hero/defaults.ts src/shared/lib/constants/default-page-sections.ts
```

hero/page-hero media のデフォルトに `overlay`/`overlayOpacity` があれば `scrimTone`/`scrimOpacity` へ書き換える（schema default に委ねられる場合はキー削除でも可）。

- [ ] **Step 5: コミット**

```bash
git add prisma/migrations prisma/seed.ts src/shared/lib/sections/definitions/page-hero/defaults.ts src/shared/lib/constants/default-page-sections.ts
git commit -m "feat(hero): hero/page-hero overlay→scrim の data migration + seed default 追従"
```

---

### Task 1.9: Phase 1 検証 + PR

- [ ] **Step 1: フル検証**

Run:

```bash
bun run validate && bun run build
bun run test:unit
```

Expected: 全 exit 0 / 0 fail（registry.test.ts の section 数 22 不変も確認）。

- [ ] **Step 2: a11y 実機検証（推奨）**

`audit-a11y` skill で hero（特に `light` tone の白ハロー）を Playwright MCP axe-core scan。違反/incomplete があれば `hero-scrim.tsx` の LIGHT 値を調整して再検証。

- [ ] **Step 3: push + PR + auto-merge**

```bash
git push -u origin feat/hero-scrim-readability-unification
gh pr create --base main --title "feat(hero): hero/page-hero の overlay を scrim tone+3層テキスト防御に統一" --body "<spec/plan 参照 + Test plan>"
gh pr merge --auto --squash --delete-branch
```

---

## Phase 2 (PR2): hero-parallax 未使用 overlay デッドコード撤去

> Phase 1 の PR がマージされてから新ブランチを切る（`git-migration.md` §auto-merge 待機 branch の DIRTY 回避）。ブランチ: `refactor/hero-parallax-overlay-deadcode`。

### Task 2.1: hero-parallax schema から未使用フィールド削除

**Files:**

- Modify: `src/shared/lib/sections/definitions/hero-parallax/schema.ts`
- Test: `__tests__/unit/domain/sections/hero-parallax-schema.test.ts`（既存があれば追記、無ければ新規）

- [ ] **Step 1: 失敗するテストを追加/作成**

```ts
// __tests__/unit/domain/sections/hero-parallax-schema.test.ts（新規時）
import { describe, expect, test } from "bun:test";
import { heroParallaxConfigSchema } from "@/shared/lib/sections/definitions/hero-parallax/schema";

describe("heroParallaxConfigSchema", () => {
  test("safeParse({}) が成立し、未使用 overlay フィールドを持たない", () => {
    const result = heroParallaxConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect("overlayStyle" in result.data).toBe(false);
      expect("overlayGradient" in result.data).toBe(false);
    }
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `bun test __tests__/unit/domain/sections/hero-parallax-schema.test.ts`
Expected: FAIL（`overlayStyle`/`overlayGradient` がまだ存在）

- [ ] **Step 3: schema.ts から削除**

`const overlayStyles = ["gradient", "solid", "none"] as const;`（行 10）を削除。

`overlayGradient` フィールド定義を削除:

```ts
  overlayGradient: field.boolean("グラデーションオーバーレイを重ねる", {
    default: true,
    group: "design",
  }),
```

`overlayStyle` フィールド定義を削除:

```ts
  overlayStyle: field.select("オーバーレイの種類", {
    options: overlayStyles,
    default: "gradient",
    group: "design",
  }),
```

- [ ] **Step 4: テストが通ることを確認**

Run: `bun test __tests__/unit/domain/sections/hero-parallax-schema.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add "src/shared/lib/sections/definitions/hero-parallax/schema.ts" "__tests__/unit/domain/sections/hero-parallax-schema.test.ts"
git commit -m "refactor(hero): hero-parallax の未使用 overlayStyle/overlayGradient を削除"
```

---

### Task 2.2: overlayStyle 関連デッドインフラを撤去

**Files:**

- Modify: `src/shared/lib/validations/section-options.ts`（`overlayStyleValues` / `OverlayStyle` / `overlayStyleLabels` 削除）
- Modify: `src/shared/lib/validations/section-parsers.ts`（`parseOverlayStyle` / `overlayStyleValues` import / `OverlayStyle` type 削除）
- Modify: `src/shared/lib/validations/section.ts`（`parseOverlayStyle` re-export 削除）
- Modify: `src/app/(public)/_shared/lib/section-style-maps.ts`（`OVERLAY_STYLE_MAP` + `OverlayStyle` import 削除）

- [ ] **Step 1: 各ファイルから削除**

`section-options.ts`:

```ts
export const overlayStyleValues = ["gradient", "solid", "none"] as const;
export type OverlayStyle = (typeof overlayStyleValues)[number];
// ...
export const overlayStyleLabels: Record<OverlayStyle, string> = { ... };
```

を全削除。

`section-parsers.ts`: import 群から `overlayStyleValues`、type import から `OverlayStyle`、定義 `export const parseOverlayStyle = createParser(overlayStyleValues, ...)` を削除。

`section.ts`: re-export 群から `parseOverlayStyle` を削除。

`section-style-maps.ts`: `OverlayStyle` import と `export const OVERLAY_STYLE_MAP = { ... }` を削除。

- [ ] **Step 2: 残存参照ゼロを確認**

Run:

```bash
grep -rn "overlayStyle\|OverlayStyle\|OVERLAY_STYLE_MAP\|parseOverlayStyle\|overlayGradient" src/
```

Expected: ヒットゼロ。

- [ ] **Step 3: 型チェック + lint**

Run: `bun run validate`
Expected: PASS（未使用 import 等のエラーなし）。

- [ ] **Step 4: コミット**

```bash
git add src/shared/lib/validations/section-options.ts src/shared/lib/validations/section-parsers.ts src/shared/lib/validations/section.ts "src/app/(public)/_shared/lib/section-style-maps.ts"
git commit -m "refactor(hero): overlayStyle 関連デッドインフラ(OVERLAY_STYLE_MAP/parser/options)を撤去"
```

---

### Task 2.3: Phase 2 検証 + PR

- [ ] **Step 1: フル検証**

Run:

```bash
bun run validate && bun run build
bun run test:unit
```

Expected: 全 exit 0 / 0 fail。

- [ ] **Step 2: push + PR + auto-merge**

```bash
git push -u origin refactor/hero-parallax-overlay-deadcode
gh pr create --base main --title "refactor(hero): hero-parallax の未使用 overlay デッドコードを撤去" --body "<plan 参照 + Test plan>"
gh pr merge --auto --squash --delete-branch
```

---

## Self-Review メモ（spec カバレッジ）

- spec §1 scrim.ts → Task 1.1 ✅
- spec §2 hero-scrim.tsx → Task 1.2 ✅
- spec §3 レンダラ統一（StandardHeroSection / MediaHero / HeroSection 変更なし）→ Task 1.5 / 1.6（HeroSection は非対象を明記）✅
- spec §4 schema 変更（hero / page-hero / hero-parallax / section-options / section-parsers / section.ts / section-style-maps）→ Task 1.3 / 1.4 / 2.1 / 2.2 ✅
- spec §5 data migration（hero / page-hero、hero-parallax は不要）→ Task 1.8 ✅
- spec §6 テスト（各 schema / getHeroTextClasses / HeroScrim / registry / migration）→ Task 1.1–1.4 / 1.2 / 2.1 に分散 ✅（registry.test.ts は section 数不変のため新規 assertion 不要、Task 1.9 で確認）
- 型整合: `ScrimTone` / `createScrimFields` / `HeroScrim` / `getHeroTextClasses` / `HeroTextClasses` は全 Task で一貫。
