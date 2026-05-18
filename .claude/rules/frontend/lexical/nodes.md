---
description: Lexical ノード実装パターン（NodeState API・単一レベル vs コンポジット・新規ノード登録チェックリスト）
paths:
  - "src/shared/lib/lexical/**"
  - "src/**/editor/**"
  - "src/**/*lexical*"
  - "src/app/(admin)/**/lexical/**"
---

# Lexical ノード実装パターン

## NodeState `parse` 関数の共通ヘルパー（`config/type-guards.ts`）

文字列・真偽値の `parse` 関数は `config/type-guards.ts` の共通ヘルパーを使う。inline lambda の重複禁止:

```typescript
import { parseString, parseBoolean } from "../config/type-guards";

// OK: ヘルパー使用
export const titleState = createState("title", { parse: parseString });
export const openState = createState("open", { parse: parseBoolean });

// NG: inline lambda の重複（parseString/parseBoolean で代替）
export const titleState = createState("title", {
  parse: (v: unknown): string => (typeof v === "string" ? v : ""),
});
```

enum/カスタム型（デフォルト値あり・型ガード必要）の場合のみカスタム `parse` を書く。

### 型ガードユーティリティ（createEnumGuard）

ノード固有のリテラル型に対する型ガードは `config/type-guards.ts` の `createEnumGuard` を使用:

```typescript
import { createEnumGuard } from "../config/type-guards";

export type StepsStyle = "numbered" | "big" | "small" | "icon" | "timeline";
export const STEPS_STYLES: readonly StepsStyle[] = [
  "numbered",
  "big",
  "small",
  "icon",
  "timeline",
] as const;
export const isStepsStyle = createEnumGuard<StepsStyle>(STEPS_STYLES);
```

**注意:** これは Prisma enum ではないため `enums.ts` ではなくノードファイル内に定義する。

## 新規ノード登録チェックリスト

ノード + プラグイン + インスペクターパネルをフル追加する場合の登録箇所（合計 9 箇所）:

| ファイル                                       | 内容                                       | 必須条件                                       |
| ---------------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| `config/nodes.ts`                              | `EDITOR_NODES` に追加                      | 全ノード                                       |
| `nodes/index.ts`                               | barrel export                              | 全ノード                                       |
| `config/dialog-registry.ts`                    | `REGISTRY_DIALOG_IDS` + `DIALOG_REGISTRY`  | Dialog 使用時                                  |
| `config/insert-items.ts`                       | `INSERT_ITEMS`                             | ツールバー/ピッカーに表示する場合              |
| `plugins/index.ts`                             | Plugin export                              | Plugin あり                                    |
| `config/inspector-registry.ts`                 | `getInspectableInfoFromRegistry`           | Inspector あり                                 |
| `inspector/hooks/inspectable-nodes.ts`         | `InspectableNodeType` + `SelectedNodeInfo` | Inspector あり                                 |
| `inspector/InspectorSidebar.tsx`               | switch case                                | Inspector あり                                 |
| `inspector/panels/index.ts`                    | Panel export                               | Inspector あり                                 |
| `__tests__/unit/.../inspectable-nodes.test.ts` | カウントと `expectedTypes` を更新          | Inspector あり（`InspectableNodeType` 追加時） |

### Inspector 要否の判断基準

- **Inspector 必須**: 複数 state を持ち編集後に「変更」させたい複合ノード（Image / Button / Callout / Steps / Tabs / Layout 等）
- **Inspector 省略可**: 単純な単一 state（`name` / `emoji` / `text` のみ等）で「削除→再挿入」が自然な inline ノード（Notion / Slack の inline emoji と同パターン、`InlineIconNode` が参照実装）

Inspector 省略時は `inspector-registry.ts` / `inspector/hooks/inspectable-nodes.ts` / `inspector/InspectorSidebar.tsx` switch case / `inspector/panels/index.ts` / `inspectable-nodes.test.ts` の 5 箇所更新が不要になり scope が小さくなる。

**HTML→Lexical JSON**: `tryConvertHtmlStringToLexicalJsonString`（`html-to-lexical-json.ts`）の戻りは `ConvertHtmlToLexicalJsonResult`。失敗時に `EMPTY` へ黙ってフォールバックしない。空 HTML（trim 後）のみ意図した空ドキュメントとして `ok: true` + `EMPTY_LEXICAL_EDITOR_STATE_JSON`。

**挿入メニュー UI**: ツールバー「挿入」は **カテゴリごとのサブメニュー**（`DropdownMenuSub`）。項目が **6 件以上**のカテゴリはサブメニュー内 **2 カラム**。タイムライン・料金表等は `patterns`、カラム・コールアウト等は `layout`。詳細は `.claude/rules/frontend/lexical/toolbar-layout.md` の「挿入メニュー」。

**挿入実行**: ツールバーは `executeInsertItem`（`dialog` は同期 `openDialog`、それ以外は 1 回の `editor.update`）。スラッシュメニューはトリガー削除と同一 `update` 内で `applyInsertItemInUpdate`（`dialog` は `queueMicrotask` で `openDialog`）。`type: "transform"` は `applyInUpdate` で $ API のみとし、ネストした `editor.update` を禁止。

**ポイント**: Floating Text Format Toolbar 経由で開くインラインノード（Ruby / Tooltip 等)は `INSERT_ITEMS` 不要だが `dialog-registry` への登録は必要。登録漏れは型エラーではなく実行時に無音で失敗するため注意。
