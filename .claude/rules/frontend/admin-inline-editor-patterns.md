---
paths:
  - src/app/(admin)/**/editor/inline/**
  - src/app/(admin)/admin/(dashboard)/posts/_components/**
  - src/app/(admin)/admin/(dashboard)/news/_components/**
---

# 管理画面インラインコンテンツエディタ（Post / News）

> 対象: メタデータ用 **SettingsDialog** と **`content-types/*`**（本文編集は別系統の [Lexical エディタ](./lexical/core.md)）。
>
> **canonical (Phase 3-B 完了後の現状)**: 本 editor は **conform `useForm` + Zod 4 + Lexical client-side rendering** ベースで実装されている (Phase 3-A: `auto-section-form` PR #107 / Phase 3-B Task 2-7: PR #120 / Task 8: PR #121 / Phase 3-C: PR #122)。`react-hook-form` / `@hookform/resolvers` は `package.json` から削除済 (Phase 3-C)。新規実装も conform 統一。バージョン SSoT は `package.json` + `bun.lock`。

## 公式準拠の前提

- [conform](https://conform.guide/) — `@conform-to/react` の `useForm` / `FieldMetadata` / `useInputControl` / `getInputProps` / `getTextareaProps`、`@conform-to/zod/v4` の `parseWithZod` / `getZodConstraint`
- [Zod 4](https://zod.dev/) — schema 定義、in-place preprocess pattern (FormData transit + object literal test 両対応)
- [React 19](https://react.dev/) / React Compiler — 手動メモ化禁止 (派生計算は browser で auto-memo)
- [Lexical](https://lexical.dev/) — `contentJson` (primary) + `contentHtml` (cache)、HTML 生成は **必ず browser** で `renderEditorStateJsonToHtmlClient` を呼ぶ (`react-server` condition 非互換のため Server Action での render 禁止 → `prisma-patterns/lexical-storage.md`)

## ディレクトリ正本

| 領域           | パス                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| シェル・パネル | `…/editor/inline/SettingsDialog.tsx`, `InlineEditorShell.tsx`, `EditorHeader.tsx`                                                                                    |
| 型・定数       | `…/editor/inline/content-types/types.ts` (`SidePanelInjectedProps` / `SidePanelDefinition` / `PostSidePanelExtra` / `NewsSidePanelExtra` / `spreadOptionalDisabled`) |
| 設定 (実装)    | `…/content-types/post.tsx`, `news.tsx` (**`"use client"`** — `render(ctx)` で JSX を返す)                                                                            |
| 共有フィールド | `…/editor/inline/side-panel/*.tsx` (12 component)                                                                                                                    |
| Hooks          | `…/editor/inline/hooks/{usePostEditor,useNewsEditor}.ts` + `hooks/shared/use-editor-core.ts` + `hooks/use-content-width-styles.ts`                                   |
| ページ         | `posts/_components/PostEditor.tsx`, `news/_components/NewsEditor.tsx`                                                                                                |

## サイドパネル設計

### 採用パターン

- **`SidePanelDefinition<TForm, TExtra>`** — `tabs[].sections[]` は **`render: (ctx) => ReactNode`**
- **コンテキスト**: `ctx = SidePanelInjectedProps<TForm> & TExtra`
  - `fields: Required<{[K in keyof TForm]: FieldMetadata<TForm[K], TForm, string[]>}>` — conform per-field metadata
  - `form: FormMetadata<TForm, string[]>` — `form.update({name, value})` 等の操作
  - `disabled?: boolean`
- **`SettingsDialog`** — **`injected: { fields, form, disabled }`** + **`extraProps: TExtra`** を受け取り、`buildRenderContext` で各セクションへ合成
- **`extraProps`** — 種別固有 (`PostSidePanelExtra` / `NewsSidePanelExtra` 等)

### 禁止パターン

- RHF 系の `register / control / setValue / errors / getValues` を新規 component で受け取る (Phase 3-B で完全撤廃済)
- `ComponentType<any>` ベースのセクション登録 (型安全の放棄、過去の design で禁止済)
- `extraProps` の省略 (型と実行時両方で不整合)

## Post / News の型分離

- **`PostSidePanelExtra`** — `categories`, `availableTags`, `onCreateCategory`, `onCreateTag`, `statusValue`, `onStatusChange`
- **`NewsSidePanelExtra`** — `isPublishedValue`, `onIsPublishedChange`
- エディター側で `const extra = { … } satisfies PostSidePanelExtra` (または News) で型を固定

## conform fields の sub-component 流用

side-panel component は `FieldMetadata<T>` を per-field に受け取る:

```tsx
type BasicInfoFieldsProps = {
  titleField: FieldMetadata<string>;
  slugField: FieldMetadata<string>;
  excerptField: FieldMetadata<string | undefined>;
  onAutoGenerateSlug: () => void; // 親で title から slug を生成 + form.update を呼ぶ
  disabled?: boolean;
};
```

`onAutoGenerateSlug` のような派生処理は親 (`content-types/post.tsx` 等) で `ctx.form.update({ name: ctx.fields.slug.name, value: generateSlug(titleValue) })` を実行し、callback として渡す。

## `LayoutFields` の `FieldMetadata<...>` 境界 cast

`FieldMetadata<T>` は invariant のため、Pure Component (`LayoutFields`) + Connected wrapper (`LayoutFieldsConnected`) パターンで型ブリッジ。境界 cast は **`@/shared/lib/conform/typed-input-control`** の 4 helper (`useTypedInputControl` / `getTypedFieldList` / `getTypedFieldset` / `asTypedField`) 内部に集約済 (`type-safety/assertion-bans.md` §5 permanent exception)。Connected wrapper では `useTypedInputControl(fields["contentWidth"])` 経由で呼び出し側 cast 0 件を保つ。

## `exactOptionalPropertyTypes` と `disabled`

- セクション内に `disabled={ctx.disabled}` のように **`undefined` を明示プロップで渡さない**
- 共通ヘルパー: **`spreadOptionalDisabled(ctx)`** (`content-types/types.ts`)

## Lexical contentJson 派生 contentHtml 計算

本文 (Lexical) は軽量 `useState` で contentJson を管理、submit handler 内で `renderEditorStateJsonToHtmlClient(contentJson)` を **browser 側** で実行して contentHtml を派生 (React Compiler 自動メモ化、`useMemo` 不要):

```tsx
const onSubmitBody = () => {
  if (!post) return;
  core.startTransition(async () => {
    const contentHtml = renderEditorStateJsonToHtmlClient(contentJson);
    const result = await updatePostBody(post.id, { contentJson, contentHtml });
    // ...
  });
};
```

詳細: `prisma-patterns/lexical-storage.md` §Client-side HTML rendering pattern。

## 設定フォーム imperative validation pattern

SettingsDialog は `<form>` 要素を持たないため、save button から imperative に validate する canonical pattern:

```tsx
const validateSettings = (): PostSettingsFormData | null => {
  const formData = new FormData();
  for (const [key, field] of Object.entries(settingsFields)) {
    const fieldValue = field.value;
    if (Array.isArray(fieldValue)) {
      formData.append(key, JSON.stringify(fieldValue));
    } else if (typeof fieldValue === "boolean") {
      if (fieldValue) formData.append(key, "on");
    } else if (fieldValue != null) {
      formData.append(key, String(fieldValue));
    }
  }
  const submission = parseWithZod(formData, { schema: postSettingsFormSchema });
  if (submission.status !== "success") {
    toast.error("入力内容に誤りがあります");
    return null;
  }
  return submission.value;
};
```

## 新規コンテンツ種別を追加するとき

1. `content-types/types.ts` に **`*SidePanelExtra`** 型を追加
2. **`content-types/<id>.tsx`** で `post.tsx` / `news.tsx` を手本に **`sidePanel.tabs[].sections[].render(ctx)`** を記述 (各 side-panel component に `ctx.fields.X` / `ctx.form` を渡す、`spreadOptionalDisabled(ctx)` 適用)
3. エディター側で **`SettingsDialog`** に **`config={...settingsPanel}`** と **`injected={{ fields, form, disabled }}`** + **`extraProps satisfies …`** を渡す
4. 設定 form schema は conform 互換の **in-place preprocess pattern** で定義 (`@/admin/lib/validations/<entity>.ts` に追加、`tags` は JSON.stringify transit、`contentWidth` は string ↔ enum、`isPublished` は checkbox "on" ↔ boolean、`publishedAt` は datetime-local など)
5. Hook (`use<Entity>Editor`) は本文を useState + 設定を conform `useForm` で管理 (`usePostEditor.ts` / `useNewsEditor.ts` 参照)

## `ContentTypeId` と固定ページ

- インライン `content-types` の `ContentTypeId` は **`post` / `news` のみ**。固定ページのレイアウト (`showSidebar` 等) は **`@/shared/lib/validations/page`** とページ編集 UI が正本。

## 関連ドキュメント

| 内容                                              | 参照                                                |
| ------------------------------------------------- | --------------------------------------------------- |
| Lexical 本文・ブロック                            | `lexical/core.md`                                   |
| Lexical contentJson client-side rendering         | `prisma-patterns/lexical-storage.md`                |
| 管理 UI 全般                                      | `admin-ui-patterns.md`                              |
| conform canonical pattern                         | `frontend/admin-ui/forms.md`                        |
| In-place preprocess pattern                       | `server-actions/implementation/forms-and-public.md` |
| Server Actions                                    | `server-actions/use-cache.md`                       |
| permanent exception §5 conform generic invariance | `type-safety/assertion-bans.md` §5                  |
