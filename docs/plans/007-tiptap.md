# Tiptap エディタ導入計画

> **目的**: ブログ記事編集のリッチテキストエディタ導入

---

## 1. 現状分析

### 1.1 現在の実装

- **ファイル**: `src/app/admin/blog/_components/BlogForm.tsx`
- **本文入力**: `<Textarea rows={20}>` （プレーンテキスト）
- **データ形式**: 文字列（HTML未対応）

### 1.2 課題

1. 見出し・リスト・引用などの装飾ができない
2. 画像の挿入が困難
3. コードブロックの表現ができない
4. プレビュー機能がない

---

## 2. Tiptap 構成

### 2.1 パッケージ選定

```bash
# コア
@tiptap/react          # React統合
@tiptap/pm             # ProseMirror依存
@tiptap/starter-kit    # 基本エクステンション（見出し、リスト、太字など）

# 追加エクステンション
@tiptap/extension-image        # 画像挿入
@tiptap/extension-link         # リンク
@tiptap/extension-placeholder  # プレースホルダー
@tiptap/extension-code-block-lowlight  # シンタックスハイライト
@tiptap/extension-typography   # タイポグラフィ（引用符自動変換など）

# シンタックスハイライト
lowlight               # コードブロック用

# セキュリティ
dompurify              # HTMLサニタイズ
@types/dompurify       # 型定義
```

### 2.2 エクステンション構成

| エクステンション | 機能 | 優先度 |
|---------------|------|-------|
| StarterKit | 見出し/太字/斜体/リスト/引用/コードブロック | 必須 |
| Image | 画像挿入（URL指定） | 必須 |
| Link | リンク挿入 | 必須 |
| Placeholder | プレースホルダーテキスト | 必須 |
| CodeBlockLowlight | シンタックスハイライト | 推奨 |
| Typography | スマート引用符 | オプション |

---

## 3. 実装計画

### 3.1 ディレクトリ構成

```
src/components/admin/
├── ui/
│   └── ... (既存)
└── editor/
    ├── index.ts                    # エクスポート
    ├── RichTextEditor.tsx          # メインエディタ
    ├── EditorToolbar.tsx           # ツールバー
    └── extensions/
        └── index.ts                # カスタムエクステンション
```

### 3.2 コンポーネント設計

#### RichTextEditor

```tsx
interface RichTextEditorProps {
  content: string              // 初期コンテンツ（HTML）
  onChange: (html: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}
```

#### ツールバー機能

| グループ | 機能 |
|---------|------|
| テキスト | 太字 / 斜体 / 取り消し線 / コード |
| 見出し | H1 / H2 / H3 |
| リスト | 箇条書き / 番号付き |
| 挿入 | リンク / 画像 / 水平線 |
| ブロック | 引用 / コードブロック |
| その他 | 元に戻す / やり直し |

### 3.3 実装ステップ

| # | タスク | 詳細 |
|---|-------|------|
| 1 | パッケージインストール | Tiptap関連パッケージ + DOMPurify |
| 2 | RichTextEditor作成 | メインエディタコンポーネント |
| 3 | EditorToolbar作成 | ツールバーUI |
| 4 | スタイリング | Tailwind CSSでエディタスタイル |
| 5 | BlogFormに統合 | Textareaを置き換え |
| 6 | 公開ページ対応 | HTMLサニタイズ + prose設定 |
| 7 | テスト | 動作確認 |

---

## 4. データフロー

### 4.1 保存形式

**HTML形式**を採用（Prismaスキーマ変更不要）

```
ユーザー入力 → Tiptap (ProseMirror) → HTML文字列 → DB保存
```

### 4.2 表示フロー

```
DB → HTML文字列 → DOMPurify.sanitize() → 安全なHTML → prose CSS → 表示
```

### 4.3 セキュリティ

- **入力時**: Tiptapが自動でサニタイズ（許可されたタグのみ）
- **表示時**: DOMPurifyで追加サニタイズ（XSS対策）
- **スタイル**: Tailwind Typography（@tailwindcss/typography）

---

## 5. UI設計

### 5.1 エディタレイアウト

```
┌─────────────────────────────────────────────────────────────┐
│ [B] [I] [S] │ H1 H2 H3 │ • ─ │ 🔗 🖼 ─ │ " </> │ ↩ ↪    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  記事の本文を入力...                                         │
│                                                             │
│  ## 見出し                                                  │
│                                                             │
│  本文テキスト。**太字**や*斜体*も使えます。                    │
│                                                             │
│  - リスト項目1                                              │
│  - リスト項目2                                              │
│                                                             │
│  > 引用テキスト                                             │
│                                                             │
│  ```javascript                                              │
│  const hello = 'world';                                    │
│  ```                                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 スタイル方針

- ツールバー: shadcn/ui Button + Toggle
- エディタ領域: Tailwind Typography (prose)
- フォーカス時: リング表示
- 最小高さ: 400px

---

## 6. 公開ページの対応

### 6.1 Tailwind Typography

```bash
bun add @tailwindcss/typography
```

### 6.2 安全なHTML表示コンポーネント

```tsx
// src/components/site/SafeHtml.tsx
import DOMPurify from 'dompurify'

interface SafeHtmlProps {
  html: string
  className?: string
}

export function SafeHtml({ html, className }: SafeHtmlProps) {
  // DOMPurifyでサニタイズしてから表示
  const sanitizedHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'pre', 'code', 'strong', 'em', 'hr'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'target', 'rel'],
  })

  return (
    <div
      className={className}
      // サニタイズ済みのHTMLを安全に表示
      {...{ dangerouslySetInnerHTML: { __html: sanitizedHtml } }}
    />
  )
}
```

---

## 7. 成果物

| ファイル | 説明 |
|---------|------|
| `src/components/admin/editor/RichTextEditor.tsx` | メインエディタ |
| `src/components/admin/editor/EditorToolbar.tsx` | ツールバー |
| `src/components/admin/editor/index.ts` | エクスポート |
| `src/components/site/SafeHtml.tsx` | 安全なHTML表示 |
| `src/app/admin/blog/_components/BlogForm.tsx` | 統合後のフォーム |

---

## 8. 将来の拡張

| 機能 | 説明 | 優先度 |
|-----|------|-------|
| 画像アップロード | Supabase Storage連携 | 高 |
| YouTube埋め込み | URLから自動埋め込み | 中 |
| テーブル挿入 | 表の作成 | 中 |
| Markdown入力 | ショートカット対応 | 低 |
| 共同編集 | Yjs連携 | 将来 |

---

*作成日: 2026-01-09*
