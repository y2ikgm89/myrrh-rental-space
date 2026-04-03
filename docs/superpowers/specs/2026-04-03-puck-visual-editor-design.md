# Puck Visual Editor 統合 — 設計書

**日付**: 2026-04-03
**種別**: 新機能（破壊的変更あり）
**ステータス**: 設計承認済み

---

## 概要

公開ホームページに [Puck Editor](https://puckeditor.com/)（MIT ライセンス、商用無料）を統合し、管理画面からドラッグ&ドロップでセクションの並び替え・内容編集・ビジュアルプレビューを可能にする。

## 選定理由

- React コンポーネント1つとして既存 app に埋め込み可能（SaaS 依存なし）
- 既存の Prisma + PostgreSQL + Better Auth をそのまま使える
- JSON 出力 → DB 保存 → `<Render>` で描画のシンプルなアーキテクチャ
- Tailwind CSS v4 との統合ガイドあり
- MIT ライセンス（完全無料・商用利用可）
- Google Cloud Run セルフホスト完全対応

## アーキテクチャ

### データフロー

```
管理画面 (Puck Editor)
  ↓ onChange で JSON 生成
  ↓ 保存 → Page.puckData (Json カラム)
  ↓
公開ページ (page.tsx)
  ↓ getHomepagePuckData() で JSON 取得
  ↓ <Render config={puckConfig} data={puckData} />
  ↓ 各コンポーネントが props を受け取って描画
```

### DB 変更

Page モデルに `puckData Json?` カラムを追加:

```prisma
model Page {
  // ... existing fields ...
  puckData Json? // Puck Editor JSON データ
}
```

ホームページ（slug="home"）の Page レコードに Puck JSON を保存。
既存の Section テーブルとは分離（Section は `[...segments]` カスタムページ用に残す）。

### Puck コンポーネント構成

既存の editorial コンポーネントを Puck コンポーネントとして登録:

| Puck Component     | 編集可能フィールド                                    | 特殊データ                       |
| ------------------ | ----------------------------------------------------- | -------------------------------- |
| `HeroSection`      | タイトル, 説明文, 画像URL, ボタンURL/テキスト, ラベル | —                                |
| `PullQuoteSection` | 引用テキスト, 著者名                                  | —                                |
| `SpacesSection`    | セクションタイトル, 表示件数                          | `getShowcaseSpaces()` で動的取得 |
| `FeaturesSection`  | セクションタイトル, 項目配列（タイトル+説明文）       | —                                |
| `StatsSection`     | 統計配列（数値+ラベル）                               | —                                |
| `CtaSection`       | ラベル, タイトル, 説明文, ボタンURL/テキスト          | —                                |

### Puck Config 型定義

```typescript
import type { Config } from "@measured/puck";

type PuckComponents = {
  HeroSection: {
    label: string;
    title: string;
    description: string;
    imageUrl: string;
    imageAlt: string;
    buttonText: string;
    buttonUrl: string;
  };
  PullQuoteSection: {
    quote: string;
    attribution: string;
  };
  SpacesSection: {
    title: string;
    count: number;
  };
  FeaturesSection: {
    title: string;
    items: Array<{ title: string; description: string }>;
  };
  StatsSection: {
    items: Array<{ value: string; label: string }>;
  };
  CtaSection: {
    label: string;
    title: string;
    description: string;
    buttonText: string;
    buttonUrl: string;
  };
};

const puckConfig: Config<PuckComponents> = { ... };
```

### ファイル構成

```
src/
├── app/(admin)/admin/(dashboard)/pages/[slug]/visual-edit/
│   ├── page.tsx                    # Puck エディタページ（管理画面）
│   └── _components/
│       └── puck-editor-client.tsx  # Puck <Editor> ラッパー（use client）
│
├── app/(public)/
│   ├── page.tsx                    # ホームページ（Puck <Render> 使用）
│   └── _components/homepage/
│       ├── puck-config.ts          # Puck Config 定義（コンポーネント登録）
│       ├── hero-section.tsx        # props 受け取り版に変更
│       ├── pullquote-section.tsx   # props 受け取り版に変更
│       ├── spaces-section.tsx      # 既に props 受け取り済み
│       ├── features-section.tsx    # props 受け取り版に変更
│       ├── stats-section.tsx       # props 受け取り版に変更
│       └── cta-section.tsx         # props 受け取り版に変更
│
├── shared/domain/pages/
│   ├── commands.ts                 # savePuckData コマンド追加
│   └── public-queries.ts          # getHomepagePuckData クエリ追加
```

### Tailwind CSS v4 対応

Puck エディタ内のプレビューに Tailwind スタイルを適用するため:

- `editorStylesheet` オプションで compiled CSS を注入（ビルド済み public.css を参照）
- コンポーネント内のクラスは全て静的（動的クラス生成なし）→ safelist 不要

### 管理画面 UI

```
/admin/pages/home/visual-edit
┌──────────┬──────────────────────────┬──────┐
│ ブロック  │  ビジュアルプレビュー     │ 設定  │
│          │                          │      │
│ + Hero   │  [実際のページプレビュー]  │ フォー│
│ + Quote  │                          │ ム    │
│ + Spaces │  ← ドラッグで並び替え     │      │
│ + Feat   │                          │      │
│ + Stats  │                          │      │
│ + CTA    │                          │      │
│          │                          │      │
│ [追加]   │                          │      │
└──────────┴──────────────────────────┴──────┘
                               [保存] [公開]
```

### キャッシュ戦略

- `getHomepagePuckData()` は `'use cache'` + `cacheTag(CACHE_TAGS.PAGES, getCacheTag.pages.detail("home"))`
- 保存時: `updateTag(CACHE_TAGS.PAGES)` + `updateTag(getCacheTag.pages.detail("home"))`

### フォールバック

`puckData` が null（未設定）の場合、現在のハードコードされたデフォルト値でレンダリング。
これにより、Puck で一度も編集していなくても現在のデザインが表示される。

### 認証・権限

管理画面の既存パターン（`executeAdminMutationResult` + `resource: "page"` + `action: "update"`）を使用。
Puck エディタページへのアクセスは `/admin/pages/[slug]/edit` と同じ権限チェック。

## 制約・注意事項

- Puck は `"use client"` 必須（エディタ UI）。公開側の `<Render>` も client component
- SpacesSection は DB からスペース一覧を取得するため、Puck 内プレビューでは placeholder 表示、公開側では実データ表示
- GSAP アニメーション（SplitText, ScrollReveal）は Puck プレビュー内では動作しない可能性あり（iframe 内の GSAP 初期化が必要）。公開側では正常動作
- next/image の `fill` prop は Puck プレビュー内で親コンテナの高さが必要

## 実装フェーズ

### Phase 1（今回）: ホームページのみ

- Puck インストール + 設定
- 6コンポーネントの props 化
- 管理画面エディタページ
- 公開ページの Render 統合
- DB マイグレーション

### Phase 2（将来）: 他ページへの展開

- `/about`, `/contact` 等の公開ページにも Puck 対応
- セクションコンポーネントの汎用化
- Puck プラグイン（Heading Analyzer 等）の追加
