# 077 - ホームページ DB 連携 (Phase 3)

> v3 ホームページを静的ダミーデータから DB 駆動に移行

## 前提

- Phase 1（ルート入れ替え）完了済み — v3 が `(public)` に統合済み
- Phase 2（統一 Section モデル）完了済み — `Section` テーブル + Zod スキーマ + Server Actions 全て動作確認済み
- 旧ホームページは 5 つのハードコード v3 コンポーネント + `dummy-data.ts` で動作

## 実装内容

- [x] Step 1: HomepageSectionRenderer 作成（SectionType → v3 コンポーネント出し分け）
- [x] Step 2: v3 コンポーネント props 化（5 コンポーネント）
- [x] Step 3: homepage page.tsx を DB 駆動に更新
- [x] Step 4: seed データを v3 セクションに更新
- [x] Step 5: dummy-data.ts 削除
- [x] 検証: type-check / lint / build 成功

## SectionType → コンポーネントマッピング

| SectionType | コンポーネント | データソース |
|-------------|---------------|-------------|
| `HERO_PARALLAX` | `HeroSection` | `config` のみ |
| `CONCEPT` | `ConceptSection` | `config` のみ |
| `SPACE_SHOWCASE` | `SpaceShowcase` | `config` + DB `Space` テーブル |
| `FEATURES` | `FeaturesSection` | `config` のみ |
| `CTA` | `CTASection` | `config` のみ |

## 新規ファイル

- `src/app/(public)/_shared/components/sections/HomepageSectionRenderer.tsx` — async Server Component、section.type で switch

## 変更ファイル

- `src/app/(public)/_components/HeroSection.tsx` — `config: HeroParallaxConfig` props 化
- `src/app/(public)/_components/ConceptSection.tsx` — `config: ConceptConfig` props 化
- `src/app/(public)/_components/SpaceShowcase.tsx` — `config: SpaceShowcaseConfig` + `spaces: SpaceData[]` props 化
- `src/app/(public)/_components/FeaturesSection.tsx` — `config: FeaturesConfig` props 化
- `src/app/(public)/_components/CTASection.tsx` — `config: CtaConfig` props 化
- `src/app/(public)/_shared/actions/section.ts` — `getShowcaseSpaces()` 追加
- `src/app/(public)/page.tsx` — `getHomepageSections()` + `HomepageSectionRenderer` で DB 駆動化
- `prisma/seed.ts` — v3 セクション seed（HERO_PARALLAX, CONCEPT, SPACE_SHOWCASE, FEATURES, CTA）

## 削除ファイル

- `src/app/(public)/_shared/data/dummy-data.ts` — 全 export 不要に

## 技術詳細

- config 取得: `getHeroParallaxConfig()` 等の Zod getter で `unknown` → 型安全 config（デフォルト値付き）
- SpaceShowcase: Prisma `Decimal` → `Number()` 変換（hourlyPrice, area）
- キャッシュ: `'use cache'` + `cacheLife('hours')` + `cacheTag(CACHE_TAGS.SECTIONS)`
- GSAP アニメーション: 一切変更なし（SplitText, ScrollReveal, ParallaxImage, MagneticButton 維持）

## コミット

- fc7ea84 feat(homepage): migrate to DB-driven section rendering
