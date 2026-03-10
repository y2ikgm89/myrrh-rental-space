# 069 - Lexical テキスト変換機能（大文字/小文字）

## 概要

LexicalエディタにテキストのCase変換機能を追加。Lexical Playgroundと同様の実装パターンでlowercase、uppercase、capitalizeをサポート。

## 要件

- テキストの大文字/小文字変換機能
- ツールバードロップダウンからアクセス
- スラッシュコマンド（/lowercase, /uppercase, /capitalize）からアクセス

## 設計判断

### 実装方式

**採用: FORMAT_TEXT_COMMAND**

Lexicalコアの`FORMAT_TEXT_COMMAND`を使用。Lexical Playgroundと同じパターン。

| 方式                        | メリット               | デメリット               |
| --------------------------- | ---------------------- | ------------------------ |
| FORMAT_TEXT_COMMAND（採用） | 公式パターン、シンプル | なし                     |
| Node Transform              | カスタマイズ可能       | オーバーエンジニアリング |

**選択理由:**

- Lexical Playgroundとの一貫性
- 追加のコマンド登録不要
- 既存のHighlightPlugin/TextColorPluginパターンと整合

### UI配置

- **ツールバー**: TextColor隣にドロップダウン（Aaアイコン）
- **スラッシュコマンド**: /lowercase, /uppercase, /capitalize（formatカテゴリ）

## 実装内容

### 新規ファイル

| ファイル                     | 内容                                                    |
| ---------------------------- | ------------------------------------------------------- |
| `plugins/TextCasePlugin.tsx` | ドロップダウンUI、useTextCaseフック、ユーティリティ関数 |

### 変更ファイル

| ファイル                            | 変更内容                                        |
| ----------------------------------- | ----------------------------------------------- |
| `plugins/index.ts`                  | TextCasePluginエクスポート追加                  |
| `plugins/ToolbarPlugin.tsx`         | TextCasePluginインポート・配置                  |
| `plugins/ComponentPickerPlugin.tsx` | formatカテゴリ追加、3つのスラッシュコマンド追加 |

### 対応変換タイプ

| タイプ     | 説明       | コマンド    |
| ---------- | ---------- | ----------- |
| lowercase  | 全て小文字 | /lowercase  |
| uppercase  | 全て大文字 | /uppercase  |
| capitalize | 先頭大文字 | /capitalize |

### 技術詳細

```typescript
// FORMAT_TEXT_COMMANDで変換を適用
editor.dispatchCommand(FORMAT_TEXT_COMMAND, "lowercase");
editor.dispatchCommand(FORMAT_TEXT_COMMAND, "uppercase");
editor.dispatchCommand(FORMAT_TEXT_COMMAND, "capitalize");

// 状態チェック
selection.hasFormat("lowercase");
selection.hasFormat("uppercase");
selection.hasFormat("capitalize");
```

## コードレビュー結果

- [x] React Compiler互換（useCallback使用）
- [x] メモリリーク防止（mergeRegister使用）
- [x] 型安全（satisfiesキーワード使用）
- [x] アクセシビリティ（title属性、アクティブ状態表示）

## テスト

- [x] TypeScript型チェック通過
- [x] ESLint通過
- [x] ビルドコンパイル成功

## 変更量

- 新規: 約170行
- 変更: 約30行
- 合計: 約200行
