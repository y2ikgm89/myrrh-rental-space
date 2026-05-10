---
description: Lexical EditorState を Prisma の Json + HTML キャッシュ + plain text 派生で保存するパターン
paths:
  - src/shared/domain/posts/**
  - src/shared/domain/news/**
  - src/shared/domain/terms/**
  - src/shared/domain/spaces/**
  - src/shared/domain/sections/**
  - src/admin/lib/lazy-renderer.ts
  - src/shared/lib/lexical/**
  - src/**/actions/**/*.ts
---

# Lexical JSON Primary パターン

> Lexical EditorState を Prisma で保存する canonical 構成（2 カラム / 3 カラム）+ lazy-renderer + 公開表示。

## 6 モデル基本構成（contentJson + contentHtml）

6 モデル（Post, PostVersion, News, NewsVersion, TermsDocument, Section）が以下の構成を持つ:

```prisma
contentHtml String  @db.Text @map("content")  // HTML キャッシュ（公開表示用）
contentJson Json?                              // Lexical EditorState JSON（プライマリ）
```

## SEO プレーン派生を併用するパターン（3 カラム構成 — Space 方式）

SEO description / カード要約 / OG / JSON-LD に本文を使うモデルは **3 カラム**構成を採用する:

```prisma
descriptionJson      Json      // Lexical EditorState（正本）
descriptionHtml      String    @db.Text  // renderEditorStateToHtmlLazy キャッシュ
descriptionPlainText String    @db.Text  // stripHtmlToText(html, 200) 派生
```

- **共有ヘルパー**: `@/shared/lib/lexical/description-defaults.ts`（`buildParagraphEditorStateJson` / `buildParagraphHtml`）、`@/shared/lib/lexical/html-to-plain-text.ts`（`stripHtmlToText`）。seed・テスト・Server Action で同じ関数を使い、派生の二重実装を禁止
- **Server Action**: `renderEditorStateToHtmlLazy(json)` → `stripHtmlToText(html, 200)` で 3 値を一括生成（`src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts` の `buildSpaceCommandInput` が参照実装）
- **公開表示**: 詳細は `SanitizedHtml` + `*Html`、metadata / OG / JSON-LD / カード / 一覧 / ダイアログは `*PlainText` に統一
- **RHF 連携**: `register("xxxJson")` ではなく `useController({ control, name: "xxxJson" })` + `<LazyLexicalEditor contentJson={field.value} onChange={field.onChange} />`。編集初期値は `typeof v === "string" ? v : JSON.stringify(v ?? JSON.parse(EMPTY_LEXICAL_EDITOR_STATE_JSON))` で文字列化
- **Zod スキーマ**: `xxxJson: lexicalJsonSchema`、`defaultValues` には `EMPTY_LEXICAL_EDITOR_STATE_JSON` を渡す

## Server Actions での保存パターン

Editor の `onChange` は JSON 文字列を返す。Server Actions で `renderEditorStateToHtmlLazy()` を使い HTML を生成し、DB に同時保存する:

```typescript
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";

export async function updatePost(id: string, data: PostInput) {
  // contentJson（プライマリ）と contentHtml（キャッシュ）を同時保存
  const contentJson = JSON.parse(data.contentJson) as Prisma.InputJsonObject;
  const contentHtml = await renderEditorStateToHtmlLazy(data.contentJson);

  await prisma.post.update({
    where: { id },
    data: { contentJson, contentHtml },
  });
}
```

## lazy-renderer が必須な理由

`renderEditorStateToHtml` は Lexical headless editor を使用する。Server Actions でトップレベル import するとビルド時に `createContext is not a function` エラーが発生する。
`lazy-renderer.ts` の動的 import パターンが必須:

```typescript
// NG: トップレベル import（ビルドエラー）
import { renderEditorStateToHtml } from "@/admin/components/editor/lexical/preview/headless-renderer";

// OK: lazy-renderer 経由の動的 import
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
const html = await renderEditorStateToHtmlLazy(jsonString);
```

## 公開表示でのレンダリング

公開ページでは `contentHtml` を直接使用（再レンダリング不要）:

```typescript
// 公開ページコンポーネント
import { SanitizedHtml } from '@/shared/components/SanitizedHtml'

export function PostContent({ post }: { post: Post }) {
  return <SanitizedHtml html={post.contentHtml} />
}
```

管理画面の LexicalEditor は `contentJson`（EditorState JSON）のみを初期化に使用する。`contentHtml` は公開表示用の生成キャッシュであり、エディタ復元には使わない。
