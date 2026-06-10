---
description: Lexical EditorState を Prisma の Json + HTML キャッシュ + plain text 派生で保存するパターン
paths:
  - src/shared/domain/posts/**
  - src/shared/domain/news/**
  - src/shared/domain/terms/**
  - src/shared/domain/spaces/**
  - src/shared/domain/sections/**
  - src/shared/lib/lexical/**
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
- **conform 連携**: Lexical の hidden input transit は `useState<string>` で local 管理 + `<input type="hidden" name={fields.xxxJson.name} value={contentJson} />` で送信。`<LazyLexicalEditor contentJson={contentJson} onChange={setContentJson} />` は state を直接受け取る。編集初期値は `typeof v === "string" ? v : JSON.stringify(v ?? JSON.parse(EMPTY_LEXICAL_EDITOR_STATE_JSON))` で文字列化（`SpaceEditForm` / `TermsForm` canonical）
- **Zod スキーマ**: `xxxJson: lexicalJsonSchema`、`defaultValue` には `EMPTY_LEXICAL_EDITOR_STATE_JSON` を渡す

## Client-side HTML rendering pattern (Next.js 16 公式準拠)

**Lexical の HTML 生成は必ず client (browser) で実行する**。Server Action から呼ばない。理由は `react-server` condition との非互換 — 詳細は `frontend/lexical/conventions.md` §禁止事項 28。

### Client (form submit handler)

```typescript
import { renderEditorStateJsonToHtmlClient } from "@/admin/components/editor/lexical/preview/render-editor-state-to-html-client";

const onSubmitBody = (bodyData: PostBodyFormData) => {
  startTransition(async () => {
    // browser で render（withDOM が既存 window を再利用、Lexical の Node + react-dom/server も問題なく動作）
    const contentHtml = renderEditorStateJsonToHtmlClient(bodyData.contentJson);
    const result = await updatePostBody(post.id, {
      contentJson: bodyData.contentJson,
      contentHtml, // ← 事前 render 済み HTML を送る
    });
  });
};
```

### Server Action (event / space は plain text 派生も server で計算)

```typescript
// Server Action は contentHtml を input から受け取るだけ
export async function updatePostBody(id: string, input: UpdatePostBodyInput) {
  const parsed = updatePostBodySchema.safeParse(input); // contentHtml: z.string()
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    resourceId: id,
    execute: async () => {
      await postCommands.updatePostBody(id, {
        contentJson: parsed.data.contentJson,
        contentHtml: parsed.data.contentHtml, // ← そのまま保存
      });
    },
    // ...
  });
}
```

### Zod 入力スキーマ

```typescript
export const updatePostBodySchema = z.object({
  contentJson: lexicalJsonSchema,
  contentHtml: z.string().min(1, { error: "本文HTMLは必須です" }),
});
```

### 削除済（2026-05-11）

- `src/app/(admin)/admin/(dashboard)/_shared/lib/lazy-renderer.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/preview/headless-renderer.ts`

これらの server-side rendering helper は Next.js 16 の `react-server` condition と本質的に非互換のため復活禁止。`render-editor-state-to-html-client.ts` を唯一の canonical renderer として保持する（browser only）。

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

## レガシー行の一括修正（PostgreSQL）

`root.children` が空配列の JSON が残っている場合、`EMPTY_LEXICAL_EDITOR_STATE_JSON`（`src/shared/lib/validations/lexical.ts`）と同一の値へ更新する。Lexical の `setEditorState` は root のみの状態を拒否するため、空段落 1 ブロックを持つ canonical 形に揃える必要がある。

```sql
UPDATE posts
SET "contentJson" = $EMPTY$
{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1,"textFormat":0,"textStyle":""}],"direction":null,"format":"","indent":0,"type":"root","version":1}}
$EMPTY$::jsonb
WHERE "contentJson" IS NOT NULL
  AND jsonb_typeof("contentJson") = 'object'
  AND "contentJson"->'root'->'children' = '[]'::jsonb;
```

対象テーブル: `news.contentJson` / `news_versions.contentJson` / `posts.contentJson` / `post_versions.contentJson` / `sections.contentJson` / `terms_versions.contentJson`（`faq_items` は `answer` プレーンテキスト単一列のため Lexical JSON 列を持たず対象外）。`block_templates.nodeJson` は EditorState 全体とは限らないため、条件を絞るか手動確認する。本番実行前にバックアップとステージングでの検証必須。
