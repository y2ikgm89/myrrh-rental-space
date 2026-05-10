---
description: Lexical コンポジットノード設計（単一レベル vs コンポジット / 階層 / isShadowRoot / canBeEmpty / collapseAtStart / insertNewAfter / カラムレイアウト）
paths:
  - src/shared/lib/lexical/**
  - src/**/editor/**
  - src/**/*lexical*
  - src/**/*Layout*Node*
---

# Lexical コンポジットノードアーキテクチャ

> 単一レベルコンテナ vs コンポジット / ContainerNode + Title/Content 階層 / 6 メソッド (isShadowRoot / canBeEmpty / canInsertText{Before,After} / collapseAtStart / insertNewAfter) + LayoutContainer/Item の特殊化。

## 単一レベルコンテナ vs コンポジットノード

| 分類                   | 例                                          | isShadowRoot | Arrow key escape        | 用途                         |
| ---------------------- | ------------------------------------------- | ------------ | ----------------------- | ---------------------------- |
| **単一レベルコンテナ** | CalloutNode, GroupNode                      | **不要**     | **不要**                | 装飾・意味付きラッパー       |
| **コンポジットノード** | Collapsible, Steps, Tabs, Layout, PullQuote | **必須**     | **必要**（`$onEscape`） | Title/Content 内部構造を保護 |

単一レベルコンテナに `isShadowRoot` を追加するとカーソルが閉じ込められ、`$onEscape` で段落挿入が必要になる悪循環を生む。Lexical のデフォルト矢印キー動作で自然に脱出できる。

## コンポジットノードアーキテクチャ

複数ノードで構成される複合コンポーネント（Tabs、Steps、Collapsible、PullQuote 等）のパターン。
公式 Lexical Playground に準拠。

### ノード階層

```
ContainerNode（ルート）
├── TitleNode / ListNode（子: タイトル/リスト部分）
└── ContentNode / PanelNode（子: コンテンツ領域）
```

### メソッドガイドライン

| メソッド                | コンテナノード | 子ノード（Title/Content） | 目的                     |
| ----------------------- | -------------- | ------------------------- | ------------------------ |
| `isShadowRoot()`        | ✅ 必須        | ✅ 必須                   | 編集境界の確立           |
| `canBeEmpty()`          | ✅ `false`     | —                         | 空コンテナ防止           |
| `collapseAtStart()`     | ✅ 実装        | ❌ 禁止                   | Backspace でノード解除   |
| `canInsertTextBefore()` | ✅ `false`     | ✅ `false`                | テキスト漏れ防止         |
| `canInsertTextAfter()`  | ✅ `false`     | ✅ `false`                | テキスト漏れ防止         |
| `insertNewAfter()`      | —              | △ TitleNodeのみ           | Enter でコンテンツへ移動 |

### isShadowRoot()

**すべてのコンテナ・中間コンテナ・子ノード ElementNode に必須**。キャレットがキーボード操作で境界外に漏れるのを防止:

```typescript
isShadowRoot(): boolean {
  return true
}
```

**実装済み（32 ノード — 全 ElementNode コンポジット子ノード）:**

- Collapsible: ContainerNode, ItemNode, TitleNode, ContentNode
- Steps: ContainerNode, StepItemNode, StepTitleNode, StepContentNode
- Tabs: ContainerNode, TabListNode, TabTitleNode, TabPanelNode
- PullQuote: Node, TextNode, CitationNode
- Gallery / Testimonial / Timeline / FeatureIconList / PricingTable / Layout / CaptionBox / Cover: ContainerNode + 各 ItemNode

#### カラムレイアウト（LayoutContainer / LayoutItem）

- **状態**: `templateColumnsState`（広い画面の `grid-template-columns`）と `templateColumnsNarrowState`（狭い画面用。DOM では `LAYOUT_MOBILE_COLUMNS_VAR` = `--lexical-layout-mobile`）。列数と子 `LayoutItem` の整合は **`register-layout-node-transforms.ts` のコンテナ Transform のみ**が行い、`templateColumns` のトークン数のみを見る（狭い画面の列数はレイアウトのみ変更しスロット数は変えない）
- **DOM 取り込み**: `data-lexical-layout-container` かつ **インライン `gridTemplateColumns` が空でない**ときのみコンテナとして変換。狭い画面用は `style` の `--lexical-layout-mobile` が無ければ `1fr`
- **DOM 出力**: `data-lexical-layout-container` + インライン `grid-template-columns`（広い画面）+ `--lexical-layout-mobile`（狭い画面）。`lexical-content.css` の `@media (max-width: 768px)` で後者に `!important` 切替
- **編集 UX**: キャレットがカラム内にあるときツールバーに「カラム」ドロップダウン（`LayoutToolbarSection`）。挿入ダイアログ・インスペクターと同一プリセット（`LAYOUT_TEMPLATES` / `LAYOUT_NARROW_TEMPLATES`）を共有
- **挿入**: スロット生成は `lib/layout-insert.ts` の `$createPopulatedLayoutContainer`。配置は `@lexical/utils` の `$insertNodeToNearestRoot`
- **列減**: 右端列の子ブロックは `register-layout-node-transforms` により新しい最終列へマージされる（データ消失なし、編集 UI に注意書きあり）
- **空カラム**: 通常は空段落 1 つ。`$isEmptyLayoutItemNode`（Playground 同名）で「未入力カラム」を判定する

### canBeEmpty()

コンテナノードで `false` を返し、空のコンテナが残存するのを防止:

```typescript
override canBeEmpty(): false {
  return false
}
```

**対象:** CollapsibleContainerNode, StepsContainerNode, TabsContainerNode, LayoutContainerNode, PricingTableNode, TestimonialNode（ContainerNode）, FeatureIconListNode（ContainerNode）

### collapseAtStart()

**コンテナノードのみに実装**。Backspace でコンポジットノード全体をパラグラフに分解:

```typescript
collapseAtStart(): boolean {
  const children = this.getChildren()
  const paragraph = $createParagraphNode()

  if (children.length > 0) {
    const firstChild = children[0]
    if ($isElementNode(firstChild)) {
      const firstChildChildren = firstChild.getChildren()
      for (const child of firstChildChildren) {
        paragraph.append(child)
      }
    }
  }

  this.replace(paragraph)
  return true
}
```

**子ノード（Title/Content 等）には collapseAtStart を実装しない**。isShadowRoot が境界保護を担当する。

### insertNewAfter()（CollapsibleTitleNode 専用パターン）

タイトルで Enter を押した際、コンテナを開いてコンテンツ先頭にフォーカス移動:

```typescript
insertNewAfter(_selection: RangeSelection, restoreSelection = true): null | ElementNode {
  const container = this.getParent()
  if ($isCollapsibleContainerNode(container)) {
    $setState(container, openState, true)
    const content = container.getChildren().find($isCollapsibleContentNode)
    if (content) {
      const firstChild = content.getFirstChild()
      if (firstChild) {
        if (restoreSelection) firstChild.selectStart()
        return null
      }
    }
  }
  return null
}
```
