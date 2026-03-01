# Table Inspector Panel — Design Document

> 作成日: 2026-03-01
> ステータス: 承認済み

## 概要

Lexical エディタのテーブルブロックに、WordPress コア相当のサイドパネル（Inspector）を追加する。
`@lexical/table` の `TableNode` / `TableCellNode` を継承したカスタムノードを作成し、NodeState API で状態管理する。
破壊的変更を許容し、後方互換性のないクリーンな実装とする。

---

## 目標

- テーブル全体のスタイル（プリセット・カラー・Border）をサイドパネルで編集できる
- 個別セルの背景色をサイドパネルで編集できる
- Lexical 公式ベストプラクティス（`$config` + NodeState API）に完全準拠
- プロジェクト既存の Inspector パターンと統一した設計
- 既存コンテンツを DBマイグレーションスクリプトで完全移行

---

## 技術方針

### Lexical 公式ベストプラクティス

Lexical v0.33+ の `$config` + NodeState API を使用する。
これにより `static clone`・`static importFromJSON`・`updateFromJSON`・`afterCloneFrom`・`exportJSON` のボイラープレートが不要になる。

```typescript
// 公式推奨パターン
class CustomTableNode extends TableNode {
  $config() {
    return this.config("custom-table", {
      extends: TableNode,
      stateConfigs: [
        { flat: true, stateConfig: tableStyleState },
        // ...
      ],
    });
  }
}
```

### ノードタイプの完全置換

- 旧: `type: "table"` / `type: "tablecell"`
- 新: `type: "custom-table"` / `type: "custom-tablecell"`
- `TableRowNode` は変更なし（`@lexical/table` をそのまま使用）

---

## ノード設計

### CustomTableNode（`type: "custom-table"`）

| state key         | 型                       | デフォルト  | 説明               |
| ----------------- | ------------------------ | ----------- | ------------------ |
| `tableStyle`      | `"default" \| "stripes"` | `"default"` | 行の縞模様         |
| `hasHeader`       | `boolean`                | `true`      | ヘッダー行表示     |
| `hasFooter`       | `boolean`                | `false`     | フッター行表示     |
| `fixedLayout`     | `boolean`                | `true`      | セル幅均等         |
| `backgroundColor` | `string`                 | `""`        | テーブル全体背景色 |
| `borderColor`     | `string`                 | `""`        | 枠線色             |
| `borderWidth`     | `number`                 | `1`         | 枠線幅(px)         |
| `htmlAnchor`      | `string`                 | `""`        | HTML アンカー ID   |
| `cssClass`        | `string`                 | `""`        | 追加 CSS クラス    |

### CustomTableCellNode（`type: "custom-tablecell"`）

| state key         | 型       | デフォルト | 説明           |
| ----------------- | -------- | ---------- | -------------- |
| `backgroundColor` | `string` | `""`       | セル個別背景色 |

### TableRowNode

`@lexical/table` の `TableRowNode` をそのまま使用（変更なし）。

---

## Inspector UI 設計

### TableInspectorPanel（テーブル全体選択時）

```
InspectorHeader "テーブル"
├─ InspectorSection "スタイル"
│  ├─ 表示スタイル  [Select: デフォルト / 縞模様]
│  ├─ ヘッダー行    [Switch]
│  ├─ フッター行    [Switch]
│  └─ セル幅均等    [Switch]
├─ InspectorSection "カラー"
│  ├─ 背景色        [TableColorPicker]
│  ├─ 枠線色        [TableColorPicker]
│  └─ 枠線幅        [Select: なし / 1px / 2px / 3px]
└─ InspectorSection "詳細"
   ├─ HTML アンカー [Input]
   └─ CSS クラス    [Input]
```

### TableCellInspectorPanel（セル選択時）

```
InspectorHeader "テーブルセル"
└─ InspectorSection "カラー"
   └─ セル背景色    [TableColorPicker]
```

### TableColorPicker（新規共通コンポーネント）

テーマカラーパレット + カスタム HEX 入力を両立する新規コンポーネント。

```
[なし]ボタン + admin.css テーマカラースウォッチ（グリッド）
───────────────────────────────────────────────────────
カスタムカラー: [#xxxxxx] [■ <input type="color" />]
```

- スウォッチは `admin.css` の CSS 変数から色を参照
- 値は HEX 文字列で NodeState に保存
- 「なし」選択時は空文字 `""`

---

## ファイル構成

### 新規作成（6ファイル）

```
src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/
├─ nodes/
│  ├─ CustomTableNode.tsx          ← CustomTableNode + 型ガード・ファクトリ
│  └─ CustomTableCellNode.tsx      ← CustomTableCellNode + 型ガード・ファクトリ
├─ inspector/
│  ├─ panels/
│  │  ├─ TableInspectorPanel.tsx   ← テーブル全体の Inspector
│  │  └─ TableCellInspectorPanel.tsx ← セルの Inspector
│  └─ components/
│     └─ TableColorPicker.tsx      ← パレット + HEX 入力の複合カラーピッカー
scripts/
└─ migrate-table-nodes.ts          ← DB マイグレーションスクリプト
```

### 修正（8ファイル）

```
src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/
├─ config/
│  └─ inspector-registry.ts        ← CustomTableNode/CustomTableCellNode の型ガード登録
├─ inspector/
│  ├─ inspectable-nodes.ts         ← ユニオン型に 'table' / 'tableCell' 追加
│  ├─ InspectorSidebar.tsx         ← switch ケース追加
│  └─ use-selected-node.ts         ← 新ノードタイプの選択検出追加
├─ plugins/
│  ├─ TableInsertPlugin.tsx        ← CustomTableNode 使用に変更
│  └─ TableActionMenuPlugin.tsx    ← CustomTableCellNode 使用に変更
└─ nodes/
   └─ index.ts（またはエディタ設定） ← ノード登録更新
```

---

## DBマイグレーション設計

### 変換ルール

| 変換前（`type`） | 変換後（`type`）         |
| ---------------- | ------------------------ |
| `"table"`        | `"custom-table"`         |
| `"tablecell"`    | `"custom-tablecell"`     |
| `"tablerow"`     | `"tablerow"`（変更なし） |

### スクリプト方針

`scripts/migrate-table-nodes.ts` を作成：

1. Prisma Client で `content` JSONカラムを持つ全テーブルをスキャン
2. JSON 内の `"type": "table"` / `"type": "tablecell"` を再帰的に変換
3. `--dry-run` フラグで変換対象を確認してから実行
4. 変換件数・失敗件数をコンソール出力

```bash
# 確認（変更なし）
bunx tsx scripts/migrate-table-nodes.ts --dry-run

# 実行（DB更新あり）
bunx tsx scripts/migrate-table-nodes.ts
```

---

## 実装順序

1. `CustomTableNode` / `CustomTableCellNode` の作成（NodeState API）
2. エディタへのノード登録 + `TableInsertPlugin` / `TableActionMenuPlugin` の切り替え
3. `TableColorPicker` コンポーネントの作成
4. `TableInspectorPanel` / `TableCellInspectorPanel` の作成
5. Inspector 配線（`inspectable-nodes.ts` / `inspector-registry.ts` / `InspectorSidebar.tsx` / `use-selected-node.ts`）
6. DBマイグレーションスクリプト作成・実行
7. 型チェック + lint + build 検証

---

## 参考

- [Lexical: Custom Nodes with $config and NodeState](https://lexical.dev/docs/concepts/nodes)
- [Lexical: NodeState](https://lexical.dev/docs/concepts/node-state)
- [WordPress Table Block](https://wordpress.org/documentation/article/table-block/)
