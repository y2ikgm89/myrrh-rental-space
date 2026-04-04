# Puck ホームページ管理画面改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Puck ビジュアルエディタの管理画面を改善し、ホームページ編集を Puck に一本化する

**Architecture:** PageActions にビジュアルエディタリンクを追加、ホームページ編集画面を Puck エディタへのリダイレクトに変更（SectionMasterDetail を除外）、puck-editor-client に toast 通知を追加。破壊的変更で二重管理を解消。

**Tech Stack:** Next.js 16, Puck 0.20, sonner (toast), Tabler Icons

---

## File Structure

| ファイル                                                                          | 操作   | 責務                                        |
| --------------------------------------------------------------------------------- | ------ | ------------------------------------------- |
| `src/app/(admin)/.../pages/_components/PageActions.tsx`                           | Modify | ビジュアルエディタリンク追加                |
| `src/app/(admin)/.../pages/[slug]/edit/page.tsx`                                  | Modify | ホームページ時は visual-edit へリダイレクト |
| `src/app/(admin)/.../pages/[slug]/visual-edit/_components/puck-editor-client.tsx` | Modify | toast 通知追加                              |

---

### Task 1: PageActions にビジュアルエディタリンクを追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/_components/PageActions.tsx`

- [ ] **Step 1: IconLayoutDashboard を import に追加**

```typescript
import {
  IconEye,
  IconEyeOff,
  IconTrash,
  IconExternalLink,
  IconPencil,
  IconLayoutDashboard,
} from "@tabler/icons-react";
```

- [ ] **Step 2: editHref リンクの後にビジュアルエディタリンクを追加**

`editHref` の `ActionDropdownItem` ブロックの直後、プレビューの前に追加:

```tsx
{
  editHref && (
    <>
      <ActionDropdownItem href={editHref}>
        <IconPencil className="h-4 w-4 mr-2" />
        編集
      </ActionDropdownItem>
      {isHomepage && (
        <ActionDropdownItem href={`/admin/pages/${slug}/visual-edit`}>
          <IconLayoutDashboard className="h-4 w-4 mr-2" />
          ビジュアルエディタ
        </ActionDropdownItem>
      )}
      <ActionDropdownSeparator />
    </>
  );
}
```

- [ ] **Step 3: 動作確認**

管理画面 `/admin/pages` でホームページ行の `⋮` メニューを開き「ビジュアルエディタ」リンクが表示されることを確認。他ページには表示されないことを確認。

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(admin)/admin/(dashboard)/pages/_components/PageActions.tsx'
git commit -m "feat(admin): add visual editor link to PageActions for homepage"
```

---

### Task 2: ホームページ編集画面を Puck エディタにリダイレクト

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/page.tsx`

- [ ] **Step 1: redirect を import に追加**

```typescript
import { notFound, redirect } from "next/navigation";
```

- [ ] **Step 2: ホームページの場合は visual-edit へリダイレクト**

`getPageForEdit` の後、`return` の前にリダイレクト分岐を追加:

```typescript
export default async function EditPagePage({
  params,
}: PageProps): Promise<ReactElement> {
  const { slug } = await params;

  const page = await getPageForEdit(slug);

  if (!page) {
    notFound();
  }

  // ホームページは Puck ビジュアルエディタに一本化
  if (slug === "home") {
    redirect(`/admin/pages/home/visual-edit`);
  }

  return (
    // ... 既存の AdminDetailLayout（他ページ用に維持）
  );
}
```

- [ ] **Step 3: 動作確認**

`/admin/pages/home/edit` にアクセスすると `/admin/pages/home/visual-edit` にリダイレクトされることを確認。他のページ（例: `/admin/pages/about/edit`）は従来通り SectionMasterDetail が表示されることを確認。

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/page.tsx'
git commit -m "feat(admin): redirect homepage edit to Puck visual editor"
```

---

### Task 3: puck-editor-client に toast 通知を追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/visual-edit/_components/puck-editor-client.tsx`

- [ ] **Step 1: toast を import**

```typescript
import { toast } from "sonner";
```

- [ ] **Step 2: handlePublish の console.error/console.info を toast に置換**

```typescript
const handlePublish = (publishData: Data) => {
  startTransition(async () => {
    const plainData: Record<string, unknown> = JSON.parse(
      JSON.stringify(publishData),
    );
    const result = await savePuckData({
      slug,
      puckData: plainData,
    });

    if (isMutationError(result)) {
      toast.error("保存に失敗しました", {
        description: result.error,
      });
      return;
    }

    toast.success("保存しました");
  });
};
```

- [ ] **Step 3: 動作確認**

Puck エディタでセクションのテキストを変更し「Publish」ボタンを押す。成功時に toast が表示されることを確認。

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(admin)/admin/(dashboard)/pages/[slug]/visual-edit/_components/puck-editor-client.tsx'
git commit -m "feat(admin): add toast notifications to Puck editor save"
```

---

### Task 4: validate + build 検証

- [ ] **Step 1: validate 実行**

```bash
bun run validate
```

Expected: エラー・警告ゼロ

- [ ] **Step 2: build 実行**

```bash
bun run build:skip-env
```

Expected: ビルド成功

- [ ] **Step 3: CLAUDE.md キーファイルテーブル確認**

ホームページ編集が Puck に一本化されたことを反映して CLAUDE.md を確認。変更不要であればスキップ。
