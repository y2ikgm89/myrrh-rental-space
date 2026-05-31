# Hero スクリム / 文字可読性の統一設計

> 2026-06-01 / topic: hero-scrim-readability-unification
> 目的: hero 系 3 系統で分裂している overlay 実装を、`MediaHero` で実証済みの「スクリムトーン + 3 層テキスト防御」モデルに統一し、文字可読性を一貫保証する。a11y ルール違反の gradient alpha スクリムを撲滅する。破壊的変更可（既存 DB は data migration で見た目を維持）。

## 背景 / 問題

hero の背景メディアにテキストを重ねる系統が 3 つあり、overlay の語彙と可読性の作りがバラバラ。

| 系統                        | セクション type            | 現状 overlay                                                                                         | 文字可読性防御                                                         | 問題                                                                                                                    |
| --------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `StandardHeroSection`       | `hero`                     | `bg-background`(白) + `overlayOpacity`、スキーマラベルは「黒い」                                     | なし                                                                   | ラベル↔実装不整合。暗い/派手な画像で `text-foreground`(暗) が読めない                                                   |
| `HeroSection`(HeroParallax) | `hero-parallax`            | `overlayStyle` = gradient(`from-foreground/70…`) / solid(`/50`) / none + 重複 bool `overlayGradient` | なし                                                                   | **gradient alpha スクリムは axe-core `bgGradient` incomplete → 本番 violation 昇格**（a11y ルール違反）。フィールド重複 |
| `MediaHero`                 | `page-hero`(media variant) | `bg-foreground`(黒) + `overlayOpacity`                                                               | **あり**（`-webkit-text-stroke` + 多層 `text-shadow`、tone=dark 固定） | 唯一の正解形。ただし tone 固定 + stroke/shadow がインラインハードコード                                                 |

プロジェクトの a11y ルール（`frontend/accessibility/images-text.md` / `ssot-singletons` 関連）:

- 「画像 overlay は solid scrim 必須。alpha / gradient scrim は axe-core `bgGradient` incomplete → production violation 昇格」
- 「視覚的 prominence > axe-definitive 確実性 → 3 層防御（Hero title 等）」= **hero title は semi-transparent scrim + `paint-order:stroke` + 多層 `text-shadow` の 3 層防御で可読性を担保する**のが blessed pattern（`MediaHero` が参照実装）。

## ゴール / 非ゴール

**ゴール**

- 3 系統を単一のスクリム + テキスト防御モデルに統一（SSoT 化）。
- 編集者が「壊れた組み合わせ（明スクリム + 明文字 等）」を作れない foolproof な設定にする。
- a11y 違反 gradient スクリムを除去。
- ラベル↔実装不整合と重複フィールド（`overlayGradient`）を解消。
- 既存 DB セクションの**見た目を維持**（data migration）。

**非ゴール**

- `AutoSelectField` への option ラベル localization 機構の追加（既存 select は raw 値表示で統一済み。本設計でも踏襲、helpText で補足）。
- 自由な CSS 画像フィルタ（blur/grayscale 等）の追加（a11y ルールで blur 非推奨、可読性保証にならないため不採用）。
- `minimal` 系（背景メディアなし）hero の変更。

## モデル（編集者が触る設定）

スクリムを「トーン + 濃さ」の 2 値に一般化。**トーンが文字色とハロー色を一意に決める**ため、壊れた組み合わせが構造的に作れない。

```
SCRIM_TONES = ["dark", "light"] as const
  dark  = 暗スクリム(bg-foreground) + 明文字(text-background) + 黒ハロー
  light = 明スクリム(bg-background) + 暗文字(text-foreground) + 白ハロー

scrimTone    : select(SCRIM_TONES)  default "dark"
scrimOpacity : number 0–100 (%)     default 40   // 0 = スクリムなし（文字防御は残る）
```

- **`none` トーンは持たない**。「オーバーレイなし」は `scrimOpacity: 0` で表現（tone は文字色を決め続けるので可読性の前提が崩れない）。
- 新規セクションの default は `dark`（任意写真に対する最も安全な普遍デフォルト）。
- 編集 UI は既存 select 同様に値がそのまま出る（`crossfade` 等と同じ）ため、helpText で日本語補足する。

## アーキテクチャ（ユニット分割）

### 1. `src/shared/lib/sections/definitions/_shared/scrim.ts`（新規・スキーマ SSoT）

`_shared/media.ts` の `HERO_BG_TRANSITIONS` と同じ「`as const` 配列 + factory」自己完結パターン。`section-options.ts` / `section-parsers.ts` には登録しない（`transition` と同様、Zod enum がバリデーションを担い、公開側は config から直接読む）。

```ts
import { field } from "../../field-registry";

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

- 型ガード: `ScrimTone` は `_shared/scrim.ts` から export。公開側 parse は `SCRIM_TONES` を使った Set ベース型ガード（`createTypeGuard`）でローカルに解決（`section-parsers.ts` への追加は不要、`transition` と同方針）。

### 2. `src/app/(public)/_shared/components/page-hero/hero-scrim.tsx`（新規・共有レンダリング SSoT）

client-safe。スクリム要素とテキストクラスを tone から導出する。stroke/shadow は現行 `MediaHero` の値を SSoT 化。

```ts
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

// 各要素の「文字色 + 縁取り + 多層影」を tone 別に返す pure helper
export function getHeroTextClasses(tone: ScrimTone): {
  readonly base: string;   // content wrapper の text-color
  readonly title: string;
  readonly subtitle: string;
  readonly label: string;
} { /* dark: 明文字+黒ハロー / light: 暗文字+白ハロー */ }
```

- `dark` tone のクラス値 = 現行 `MediaHero` の実装値（`text-background` + `[-webkit-text-stroke:0.5px_rgb(0_0_0/0.45)]` + `[text-shadow:0_1px_2px_rgb(0_0_0/0.6),0_2px_12px_rgb(0_0_0/0.5)]` 等、要素別に stroke 幅を変える）。
- `light` tone = 文字 `text-foreground` + 白ハロー（`rgb(255_255_255/…)` の stroke/shadow）で、暗文字を明るい画像領域から分離。
- `tailwind-patterns/inline-style-vs-arbitrary.md` 準拠：stroke/shadow は arbitrary class（inline style 不可、`md:` reset 互換のため）。

### 3. レンダリングコンポーネントを共有 helper に統一

- **`StandardHeroSection.tsx`**（default / parallax / split）: `config.overlay`/`overlayOpacity` 参照を `HeroScrim tone={config.scrimTone} opacity={config.scrimOpacity}` に置換。title / subtitle / sectionLabel / secondary link に `getHeroTextClasses(config.scrimTone)` を適用（**文字防御を新規獲得**）。`minimal` variant（背景なし）は対象外（現行 `text-foreground` 維持）。
- **`MediaHero.tsx`**: インラインの `bg-foreground` + ハードコード stroke/shadow を `HeroScrim` + `getHeroTextClasses(scrimTone)` に置換（挙動同一 + tone 対応）。
- **`HeroSection.tsx`（HeroParallax）**: `OVERLAY_STYLE_MAP` 参照を撤去し `HeroScrim` + `getHeroTextClasses` に統一。`overlayGradient` bool 参照を削除。

### 4. スキーマ変更（破壊的）

- `hero/schema.ts`（`heroConfigSchema`）: `overlay` + `overlayOpacity` を削除 → `...createScrimFields()` を spread。
- `page-hero/schema.ts`（media variant）: 同上。
- `hero-parallax/schema.ts`（`heroParallaxConfigSchema`）: `overlayStyle` + `overlayGradient` を削除 → `...createScrimFields()` を spread。
- `validations/section.ts`: `parseOverlayStyle` の re-export を削除。`isHeroConfig` 等の guard は schema 変更に自動追従（`safeParse({})` 成立は維持）。
- `validations/section-options.ts`: `overlayStyleValues` / `OverlayStyle` / `overlayStyleLabels` を削除。
- `validations/section-parsers.ts`: `parseOverlayStyle` / `overlayStyleValues` import / `OverlayStyle` type を削除。
- `section-style-maps.ts`: `OVERLAY_STYLE_MAP` を削除（gradient alpha スクリム撲滅）。

### 5. データ移行（Prisma data migration）

standalone image migration は bun script ではなく **Prisma data migration** で行う（deploy で自動適用、運用残なし。参照: `20260601032540_hero_background_media_to_array`）。

`Section.config`（JSON）を type 別に変換し、**現状の見た目を維持**:

| 対象 type                              | 旧 → 新                                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hero`（白スクリムだった）             | `scrimTone: "light"`、`scrimOpacity: overlay === false ? 0 : (overlayOpacity ?? 40)`。旧 `overlay`/`overlayOpacity` キー削除                          |
| `page-hero`（media variant、黒だった） | `scrimTone: "dark"`、`scrimOpacity: overlay === false ? 0 : (overlayOpacity ?? 40)`                                                                   |
| `hero-parallax`                        | `scrimTone: "dark"`、`scrimOpacity`: `overlayStyle === "none" ? 0 : overlayStyle === "solid" ? 50 : 40`。旧 `overlayStyle`/`overlayGradient` キー削除 |

- migration は冪等（既に `scrimTone` を持つ行はスキップ）。
- `seed.ts` / `DEFAULT_PAGE_HERO` / `DEFAULT_PAGE_SECTIONS` に旧 overlay キーを持つデフォルトがあれば新キーへ更新。

### 6. テスト

- `hero` / `page-hero` / `hero-parallax` の各 schema: `safeParse({})` 成立（Section schema test contract）+ `scrimTone:"dark"` / `scrimOpacity:40` の default 適用を assert。型違反（`scrimTone:123`）のみ reject。
- `getHeroTextClasses(tone)`: dark/light で期待クラス（文字色 + stroke/shadow）を返す unit test。
- `HeroScrim`: tone→bg クラス、`opacity<=0` で null を返す unit test。
- `registry.test.ts`: section 総数 22 不変（新規 type 追加なし）。
- migration マッピングロジック（純粋関数に抽出して）3 type の変換を unit test。

## a11y 整合

- スクリムは solid color + opacity（semi-transparent）。これは hero title の blessed pattern（semi-transparent scrim + `paint-order:stroke` + 多層 `text-shadow` の 3 層防御）に一致（`MediaHero` 参照実装）。本設計は全 hero を**この実証済み 3 層防御に統一**するため、a11y ルールの「視覚的 prominence > axe-definitive → 3 層防御」に正面から準拠。
- a11y 違反だった `hero-parallax` の gradient alpha スクリムは**削除**され、純粋な改善。
- 編集後は `audit-a11y` skill（Playwright MCP axe-core）で hero を実機検証する。

## PR 粒度（実装計画で 2 段に分割）

3 系統 + migration で 10 ファイル / 300 行を超える見込み。schema/migration 規律も踏まえ、writing-plans で以下 2 段に割る:

1. **PR1**: `_shared/scrim.ts` + `hero-scrim.tsx` 新設 + `hero` / `page-hero` 2 系統統一 + 該当 data migration + テスト。
2. **PR2**: `hero-parallax` 吸収（`overlayStyle`/`overlayGradient`/`OVERLAY_STYLE_MAP`/`section-options`/`section-parsers` 撤去）+ 該当 data migration + テスト。

（注: data migration を 2 PR に分ける場合、各 PR の migration は自分の対象 type のみ変換する冪等スクリプトにする。）

## リスク / 留意

- **破壊的 config 変更**: 旧キー（`overlay` 等）を参照するコードが残ると runtime 落ち。grep（`overlay`/`overlayOpacity`/`overlayStyle`/`overlayGradient`）で全消費元を洗い出してから削除する。
- **`light` tone の白ハロー値は新規**（現行に存在しない）。実画像で `audit-a11y` + 目視確認してから値を確定する。
- **migration の `Section.config` JSON 操作**は型安全に（`asPrismaInputJsonValue` 系 / 既存 hero-media-array migration の手法を踏襲）。
