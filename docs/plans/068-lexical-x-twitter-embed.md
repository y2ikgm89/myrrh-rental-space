# 068 - Lexical X（Twitter）埋め込み機能

## 概要

LexicalエディタにX（Twitter）投稿の埋め込み機能を追加。公式ベストプラクティスに準拠し、YouTubeNodeと同様の静的iframe方式で実装。

## 要件

- X（Twitter）投稿をエディタに埋め込み可能にする
- ツールバー「挿入」メニューとスラッシュコマンド（/x, /twitter）から挿入
- 全URL形式対応（twitter.com, x.com, mobile版）
- 後方互換性なしのクリーンな実装

## 設計判断

### 表示方式の選択

**採用: 静的iframe方式**

| 方式               | メリット                         | デメリット                         |
| ------------------ | -------------------------------- | ---------------------------------- |
| 静的iframe（採用） | 軽量、高速、レイアウトシフトなし | リッチ表示なし                     |
| Twitter Widget API | 公式UIで完全再現                 | 560KB JSロード、パフォーマンス影響 |

**選択理由:**

- YouTubeNodeとの一貫性
- パフォーマンス優先（外部JS不要）
- プライバシー保護（トラッキング削減）

### アーキテクチャ

YouTubeNodeパターンを完全踏襲:

- DecoratorNode直接継承
- 直接更新パターン（コマンド登録不要）
- useXDialogフックによる状態管理

## 実装内容

### 新規ファイル

| ファイル              | 内容                                       |
| --------------------- | ------------------------------------------ |
| `nodes/XNode.tsx`     | DecoratorNode実装、DOM変換、ファクトリ関数 |
| `plugins/XPlugin.tsx` | ダイアログUI、URL抽出ロジック、フック      |

### 変更ファイル

| ファイル                    | 変更内容                                  |
| --------------------------- | ----------------------------------------- |
| `nodes/index.ts`            | XNodeエクスポート追加                     |
| `plugins/index.ts`          | XPlugin/useXDialogエクスポート追加        |
| `ToolbarPlugin.tsx`         | onInsertX Props、メニュー項目追加         |
| `ComponentPickerPlugin.tsx` | onInsertX Props、メディアカテゴリーに追加 |
| `LexicalEditor.tsx`         | XNode登録、フック/ダイアログ追加          |
| `theme.ts`                  | X用テーマクラス追加                       |

### 対応URL形式

```
https://twitter.com/user/status/1234567890123456789
https://x.com/user/status/1234567890123456789
https://mobile.twitter.com/user/status/1234567890123456789
https://mobile.x.com/user/status/1234567890123456789
https://platform.twitter.com/embed/Tweet.html?id=1234567890123456789
直接ツイートID入力（15-19桁の数字）
```

### セキュリティ対策

1. **XSS防止**: tweetIdは15-19桁の数字のみ許可（コンストラクタで検証）
2. **入力バリデーション**: extractTweetId()で厳格な形式チェック
3. **importJSON保護**: デシリアライズ時もコンストラクタ検証を通過

### 技術詳細

```typescript
// tweetIdバリデーション（XNode.tsx）
function isValidTweetId(tweetId: string): boolean {
  return /^\d{15,19}$/.test(tweetId);
}

// URL抽出（XPlugin.tsx）
function extractTweetId(url: string): string | null {
  const standardMatch = url.match(
    /(?:mobile\.)?(?:twitter|x)\.com\/\w+\/status\/(\d+)/,
  );
  if (standardMatch?.[1]) return standardMatch[1];
  // ... 他の形式
}
```

## コードレビュー結果

- [x] XSS脆弱性対策（tweetIdバリデーション追加）
- [x] importDOM優先度設定（YouTubeNodeとの競合回避）
- [x] バージョンフィールド追加（将来のスキーマ移行対応）
- [x] 入力バリデーション強化（15-19桁制限）

## テスト

- [x] TypeScript型チェック通過
- [x] ESLint通過
- [x] ビルドコンパイル成功（DBエラーは環境依存）

## 変更量

- 新規: 約200行
- 変更: 約40行
- 合計: 約240行
