# セクションベースアーキテクチャ デザイン自由度分析

## 日時
2026-02-09

## 調査対象
ページ管理のセクションベースアーキテクチャにおけるAI UI/UXデザイン変更時の自由度

## ファイル構成
- **スキーマ定義**: `src/shared/lib/validations/section.ts` (17セクションタイプ)
- **デザインスキーマ**: `src/shared/lib/validations/section-design.ts`
- **セクションレンダラー**: `src/app/(public)/_shared/components/sections/SectionRenderer.tsx`
- **セクションコンポーネント**: `src/app/(public)/_components/*Section.tsx`
- **スタイル定義**: `src/app/(public)/_shared/lib/styles/section-variants.ts`
- **ラッパー/ヘルパー**: `src/app/(public)/_shared/components/sections/SectionWrapper.tsx`
- **管理画面編集**: `src/app/(admin)/admin/(dashboard)/pages/[slug]/sections/_components/PageSectionEditor.tsx`
- **デザイン編集UI**: `src/app/(admin)/admin/(dashboard)/settings/_components/homepage/DesignPanel.tsx`

## 現在のアーキテクチャ概要

### 2層構造
1. **config**: セクション固有の構造化データ（タイトル、ボタン、レイアウト選択など）
2. **design**: セクション共通のスタイル設定（余白、背景、テキスト色、アニメーション）

### セクションタイプ（17種類）
1. HERO - 基本ヒーロー
2. HERO_PARALLAX - パララックスヒーロー（v3）
3. CUSTOM - Lexicalカスタムコンテンツ
4. CONCEPT - コンセプト（2カラム）
5. SPACE_LIST - スペース一覧
6. SPACE_SHOWCASE - スペースショーケース
7. NEWS_LIST - ニュース一覧
8. POST_LIST - 記事一覧
9. FAQ_LIST - FAQ
10. FEATURES - 特徴
11. TESTIMONIAL - 体験談
12. GALLERY - ギャラリー
13. CTA - 行動喚起
14. CONTACT_FORM - お問い合わせ
15. MAP - 地図
16. EMBED - 埋め込み
17. INSTAGRAM - Instagramフィード

---

## デザイン自由度：高い部分

### 1. 共通design フィールド（SectionDesign型）
```typescript
{
  paddingTop: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  paddingBottom: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  background: 'default' | 'surface' | 'accent' | 'primary' | 'dark' | 'image' | 'gradient'
  backgroundImageUrl?: string
  backgroundOverlayOpacity: 0-100
  maxWidth: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  titleColor?: hex
  titleSize: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  textColor?: hex
  textAlign: 'left' | 'center' | 'right'
  animation: 'none' | 'fade' | 'slide-up' | 'parallax'
  customClass?: string
}
```

**評価**: 高度な自由度
- 背景色・背景画像・グラデーション選択可能
- テキスト色（HEX）カスタマイズ可能
- 上下余白、コンテナ幅、テキスト配置を個別制御
- カスタムCSSクラス追加が可能
- UIでの編集: DesignPanel で全フィールド編集可能

### 2. セクション固有config の柔軟性
- **Hero/HeroParallax**: タイトル、サブタイトル、背景画像、ボタン（複数、variant/size/color指定可）
- **Concept**: 見出し、本文、画像、画像位置（左右切り替え）、テキスト配置
- **SpaceList/SpaceShowcase**: レイアウト選択（grid/list/carousel）、カラム数制御、maxItems制御
- **NewsL/PostList**: レイアウト（list/card/grid）、カラム数、maxItems、categoryId
- **Features/Testimonial/Gallery**: 複数アイテム内蔵編集UI
- **CTA**: ボタン複数配置、variant/size/color個別制御
- **Custom（Lexical）**: 完全なHTMLコンテンツ編集

### 3. コンポーネント実装の自由度
- セクションコンポーネント（HeroSection, ConceptSection等）は`use client`で実装
- GSAP/Three.js等のアニメーション機能統合可能（Hero等で実装済み）
- ScrollReveal, SplitText, ParallaxImage等の高度なアニメーション利用可能
- MagneticButton等のインタラクティブ要素実装可能

### 4. スタイル定義の拡張性
`section-variants.ts`で以下をcenterpiece管理:
- gridColumnClasses (1-6カラム)
- gridGapClasses (none/sm/md/lg/xl)
- masonryColumnClasses
- cardVariants
- imageOverlayClasses
- overlayTextClasses
- ratingStarClasses

**拡張容易**: 新規プリセット追加やバリアント追加が容易

---

## デザイン自由度：制約がある部分（ボトルネック）

### 1. セクションタイプが固定
**制約**: 17種類に制限。新規セクション追加には以下が必要:
- Prisma enum に SectionType 追加
- schema.ts に設定スキーマ追加
- section.ts に validator/getter/type追加
- SectionRenderer に case 追加
- コンポーネント実装

**許容度**: 中程度
- 新規セクション追加は**工学的**（手順が定義済み）
- ただしAI生成の自動追加は困難

### 2. config スキーマで固定されるフィールド
**高レベル固定例**:
- Hero: height(sm/md/lg/full) - 中継値固定
- SpaceList: layout(grid/list/carousel) - 選択肢固定
- Testimonial: layout(grid/carousel/list) - 選択肢固定

**許容度**: 高
- これらは**構造的に意味のある制約**
- UIから柔軟に選択可能
- AIが config を生成する際は「選択肢内から選択」すればOK

### 3. SectionWrapper による強制的なレイアウト抽象化
**制約内容**:
```typescript
// paddingTopMap, paddingBottomMap で固定クラス
const paddingTopMap = {
  none: '',
  sm: 'pt-8 md:pt-12',
  md: 'pt-16 md:pt-24',
  lg: 'pt-24 md:pt-32 lg:pt-40',
  xl: 'pt-32 md:pt-40 lg:pt-48',
}
```
- Tailwind固定値（調整不可）
- AIが「19pxの余白」と指定しても実装不可

**許容度**: **低〜中**
- **完全にカスタムな値は実装不可**
- ただしcustomClass で追加可能（`pt-[19px]` 禁止ですが追加クラスは可）

### 4. テキストスタイルの限定性
**制約**:
- titleColor/textColor は HEX のみ
- fontSize は 5段階（sm/md/lg/xl/2xl）固定
- font-family, line-height, letter-spacing は customClass で追加必要
- 段落スタイル（背景色ブロック、枠線等）は customClass 頼み

**許容度**: 中程度
- 基本的なテキストスタイル（色・サイズ・配置）は OK
- 高度なテキスト表現（グラデーション、影等）は customClass が必要

### 5. コンポーネント内部の hardcoded スタイル
**例**:
```typescript
// HeroSection.tsx
<p className="mb-6 text-[11px] uppercase tracking-[0.3em] text-primary-dark md:tracking-[0.4em]">
  {config.tagline}
</p>
```
- テキスト上部の小さなタグラインは hardcoded
- AI が「タグラインのフォントサイズを 13px に」と指定しても実装不可
- コンポーネント手修正が必要

**許容度**: **低**（ボトルネック）
- セクションコンポーネント内の hardcoded クラスは変更できない
- 各セクション毎に「カスタマイズ可能フィールド」が異なる
- 統一的なUXにならない

### 6. layout/variant の choice が制限
**例**:
- SpaceList: layout は grid/list/carousel のみ
- Testimonial: layout は grid/carousel/list のみ
- 「Masonry + overlay」「Flex + gap-8」など複合指定は不可

**許容度**: 中程度
- 一般的なレイアウトは網羅
- 特殊な複合レイアウトには config スキーマ拡張が必要

### 7. アニメーション選択肢が少ない
**design.animation**: none/fade/slide-up/parallax のみ
- より複雑なアニメーション（stagger, scale-in等）は config に追加フィールド必要

**許容度**: 中程度

---

## AI UI/UXデザイン変更時の実運用上の制約

### シナリオ: AI が「ホームページの HeroSection を改善したい」
1. **config 変更**（config.title, config.subtitle, buttons等）→ **完全実装可能**
2. **design 変更**（背景色、余白、テキスト色等）→ **完全実装可能**
3. **新規レイアウト提案**（「Masonryグリッド + ホバー拡大」等）→ **実装不可** or **手修正必要**
4. **新規セクション提案**（「タイムライン」「ステップ」等）→ **実装不可** or **手修正必要**
5. **内部スタイル調整**（「タグラインを 12px に」「ボタン padding を調整」）→ **実装不可**（hardcoded）

### 改善時の流れ
```
AI が design + config 提案
   ↓
JSONバリデーション OK → 実装可能
   ↓
セクションコンポーネント内 hardcoded スタイル要否確認
   ↓
Yes → 手修正が必要
   ↓
新規セクションタイプ要否確認
   ↓
Yes → Prisma enum + スキーマ + コンポーネント追加が必要
```

---

## 改善提案

### 優先度 HIGH: セクション内部の style 外出し
**目的**: hardcoded クラスを design または config に統合

**例**:
```typescript
// before
<p className="mb-6 text-[11px] uppercase tracking-[0.3em]">
  {config.tagline}
</p>

// after
<p className={cn(
  'uppercase',
  taglineStyles[config.taglineSize], // 'sm' | 'md' | 'lg'
  taglineStyles[config.taglineCase], // 'uppercase' | 'capitalize'
)}>
  {config.tagline}
</p>
```

**影響**:
- AI が taglineSize/Case を config に追加して変更可能
- SectionEditor で制御可能

### 優先度 MEDIUM: デザイン config スキーマの拡張
**目的**: より細かいスタイル制御を design に統合

**例**:
```typescript
export const sectionDesignSchema = z.object({
  // ... existing
  borderRadius: z.enum(['none', 'sm', 'md', 'lg']).default('md'),
  boxShadow: z.enum(['none', 'sm', 'md', 'lg']).default('none'),
  borderColor: optionalHexColorSchema,
  borderWidth: z.enum(['0', '1', '2']).default('1'),
})
```

**利点**:
- AI が「ボーダー追加」「シャドウ調整」を提案可能
- SectionRenderer でユニバーサルに適用

### 優先度 MEDIUM: セクションタイプ追加の自動化
**目的**: 新規セクション追加を簡易化

**検討事項**:
- セクションテンプレート生成ツール
- Prisma migration 自動実行
- コンポーネント scaffold 生成

---

## まとめ表

| 領域 | 自由度 | 管理手段 | 注釈 |
|------|--------|---------|------|
| 背景色/画像 | 高 | design | ✅ AI完全実装可 |
| テキスト色 | 高 | design | ✅ AI完全実装可（HEX指定） |
| 余白 | 高 | design | ⚠️ プリセット5段階 |
| コンテナ幅 | 高 | design | ✅ 5段階選択 |
| レイアウト選択 | 中 | config | ⚠️ セクション毎に異なる |
| カラム数 | 高 | config | ✅ 変動値設定可 |
| アニメーション | 中 | design | ⚠️ 4種類のみ |
| セクション内部スタイル | 低 | hardcoded | ❌ 手修正必要 |
| 新規セクションタイプ | 低 | Prisma enum | ❌ 工学的追加必要 |
| カスタムCSS | 高 | customClass | ✅ Tailwind記法で拡張 |

---

## 結論

**AI がUI/UXデザインを変更する際のボトルネック**:

1. **セクションコンポーネント内の hardcoded スタイル** ← 最大の制約
2. **新規セクションタイプの追加** ← 工学的追加必要
3. **複雑なレイアウト・アニメーション** ← config スキーマ拡張必要

**実用性評価**: **中程度〜良好**
- 既存17セクション内での design/config 変更は完全に実装可能
- テーマ色・レイアウト・余白等の基本的なカスタマイズは自由
- セクション内部の詳細スタイル調整には手修正が必要
- 新規セクション追加は手作業

**推奨アプローチ**:
1. **Phase 1**: 既存セクション内での design 最適化（AI 完全実装）
2. **Phase 2**: hardcoded スタイルの config/design 統合
3. **Phase 3**: テンプレート化による新規セクション追加の自動化
