# ページエディタ v2 — 大幅 UI/UX 刷新

**日付**: 2026-04-11
**種別**: 破壊的変更
**ステータス**: 完了

---

## 概要

`pages/[slug]/edit` のページエディタを業界ベストプラクティス（WordPress Gutenberg、Squarespace、Storyblok、Builder.io）に基づいて全面刷新する。後方互換性不要。

## 調査結果サマリー

| CMS             | パターン                                            | 参考にする点                           |
| --------------- | --------------------------------------------------- | -------------------------------------- |
| **Gutenberg**   | List View + Canvas + Settings sidebar               | ページレベル設定をサイドバータブで切替 |
| **Squarespace** | Canvas + 右パネル（Content/Design/Background タブ） | セクション間「+」ボタン                |
| **Storyblok**   | Component tree + Visual editor                      | ツリー→フォーム遷移、back ボタン       |
| **Builder.io**  | Layers + Canvas + Style/Options タブ                | Style/Options の明示的分離             |

## 現状の問題点

1. **サイドバーの情報密度が低い** — アイコン + テキストのみ。セクションの要約（画像、テキスト抜粋）がない
2. **セクション間の「+」追加がない** — 下部ボタンのみ。Squarespace は各セクション間に inserter がある
3. **右パネルが冗長** — ヘッダー（アイコン+タイトル）+ タブ + フォーム。ヘッダー情報はサイドバーで既に見えている
4. **AdminDetailLayout のスペースが過大** — `space-y-6` の `div` ラッパーが余計な余白を作る
5. **MobileBackButton が lg で hidden なのに常にレンダリング**
6. **DesignPanel の保存ボタンが独立** — コンテンツとデザインの保存が別々（混乱の元）

## 設計

### レイアウト構造

```
page.tsx (AdminDetailLayout — ヘッダーのみ)
└── PageEditorShell (Client Component — 全体コンテナ)
    ├── PageEditorTabs [セクション | ページ設定]
    │
    ├── [セクション] tab:
    │   └── div.flex (マスターディテール)
    │       ├── SectionList (左 280px — 縮小)
    │       │   ├── ヘッダー: 「セクション (N)」
    │       │   ├── セクションアイテム × N
    │       │   │   └── 番号 + アイコン + タイトル + [⋯]メニュー
    │       │   │   └── ★セクション間に「+」inserter ボタン
    │       │   └── フッター: [+ 追加]
    │       │
    │       └── SectionEditor (右 flex-1)
    │           └── タブなし — 単一スクロールパネル
    │               ├── コンテンツフィールド（AutoSectionForm）
    │               ├── 区切り線
    │               └── デザインフィールド（DesignFields — Accordion 廃止、フラット表示）
    │               └── 保存ボタン（コンテンツ + デザイン統合）
    │
    └── [ページ設定] tab:
        └── PageSeoForm（変更なし）
```

### 変更点の詳細

#### 1. サイドバー幅を 320px → 280px に縮小

- Gutenberg (280px)、Storyblok (300px) に合わせる
- 右パネルのフォームスペースを確保

#### 2. セクション間 inserter（Squarespace パターン）

- 各セクションアイテムの間にホバーで表示される「+」ボタン
- クリックで AddSectionDialog を開く（挿入位置を指定）
- `createPageSection` の `order` 引数で位置を制御

#### 3. 右パネルのタブ廃止 → 単一スクロールパネル

- Content/Design タブを廃止
- 1つのスクロールパネルにコンテンツフィールド + デザインフィールドを連続配置
- Builder.io / Payload CMS と同じパターン（全フィールドが1画面）
- 保存ボタンを1つに統合（コンテンツ + デザインを同時保存）

#### 4. SectionDetailHeader を削除

- サイドバーで選択中セクションが既にハイライトされているため、右パネルのヘッダーは不要
- Storyblok / Builder.io はヘッダーを持たない

#### 5. デザインフィールドをフラット化

- Accordion の4カテゴリを廃止
- 「余白」「背景」「テキスト」「レイアウト」をセクション見出し（`<legend>`）で分離
- ToggleGroup / Select / カラーピッカーはそのまま維持
- フィールド数が少ない（12個）のため折りたたみ不要

#### 6. 保存の統合

- 現状: コンテンツ保存ボタン + デザイン保存ボタン が別々
- 変更: 1つの保存ボタンで config + design を同時送信
- dirty 状態も統合（config dirty || design dirty → 単一 isDirty）

### ファイル構成

| ファイル                                         | 操作              | 内容                                           |
| ------------------------------------------------ | ----------------- | ---------------------------------------------- |
| `SectionMasterDetail.tsx`                        | 書き換え          | PageEditorShell: タブ + マスターディテール統合 |
| `SectionSidebar.tsx` → `SectionList.tsx`         | リネーム+書き換え | リスト + セクション間 inserter                 |
| `SectionSidebarItem.tsx` → `SectionListItem.tsx` | リネーム+書き換え | 280px に最適化                                 |
| `SectionDetailPanel.tsx` → `SectionEditor.tsx`   | リネーム+書き換え | タブ廃止、統合フォーム                         |
| `SectionDetailHeader.tsx`                        | 削除              | 不要                                           |
| `SectionEmptyState.tsx`                          | 維持（微修正）    | 最小限                                         |
| `DesignPanel.tsx` → `DesignFields.tsx`           | リネーム+書き換え | Accordion 廃止、フラットフィールド             |
| `SectionInserter.tsx`                            | 新規              | セクション間「+」ボタン                        |

### 変更なし

- `page.tsx` — AdminDetailLayout ヘッダーはそのまま
- `PageSeoForm.tsx` — ページ設定タブの中身はそのまま
- `AutoSectionForm` — スキーマ駆動フォームはそのまま
- `section-design.ts` — Zod スキーマ、型、デフォルト値はそのまま
- DB / Prisma — Section.design JSON フィールドの構造は変わらない

## タスク

- [ ] 1. SectionInserter コンポーネント新規作成
- [ ] 2. SectionList（旧 SectionSidebar）書き換え — 280px + inserter 統合
- [ ] 3. SectionListItem（旧 SectionSidebarItem）書き換え
- [ ] 4. DesignFields（旧 DesignPanel）— Accordion 廃止、フラット化
- [ ] 5. SectionEditor（旧 SectionDetailPanel）— タブ廃止、統合保存
- [ ] 6. SectionMasterDetail 書き換え — 構造簡素化
- [ ] 7. SectionDetailHeader 削除
- [ ] 8. 検証（validate + build）
