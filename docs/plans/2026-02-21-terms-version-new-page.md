# 利用規約バージョン作成専用ページ化 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 利用規約の新バージョン作成をダイアログからフルページに移行し、既存編集ページのパターン違反と壊れたリダイレクトも同時修正する。

**Architecture:** `TermsVersionForm` の `onSuccess`/`onCancel` を `redirectTo: string` に置き換えてページネイティブな設計に変更。新規作成用ページを `terms/[id]/versions/new/page.tsx` として追加し、`AdminDetailLayout` で統一。

**Tech Stack:** Next.js 16 App Router, Server Components, `AdminDetailLayout`, `connection()`, `useRouter`

**設計ドキュメント:** `docs/plans/2026-02-21-terms-version-new-page-design.md`

---

## Task 1: `TermsVersionForm` — props 再設計（破壊的変更）

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/terms/_components/TermsVersionForm.tsx`

### Step 1: ファイル全体を新しい実装で置き換える

`onSuccess`/`onCancel` を削除し `redirectTo: string` + `editorHeight?: string` に変更。
成功後に `router.push(redirectTo)` を呼ぶ。キャンセルボタンを削除（`AdminDetailLayout` の backHref で代替）。

```tsx
"use client";

/**
 * 規約バージョン作成・編集フォーム
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import {
  getTemplatesForType,
  applyBusinessInfo,
} from "@/shared/lib/terms-templates";
import type { BusinessInfo } from "@/shared/lib/terms-templates";
import type { TermsType } from "@/shared/generated/prisma/client";

const LexicalEditor = dynamic(
  () =>
    import("@/admin/components/editor/lexical/LexicalEditor").then((mod) => ({
      default: mod.LexicalEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[600px] flex items-center justify-center border rounded-lg bg-muted/50">
        <div className="animate-pulse text-muted-foreground">
          エディタを読み込み中...
        </div>
      </div>
    ),
  },
);
import { createTermsVersion, updateTermsVersion } from "@/admin/actions/terms";
import type { TermsVersionDetail } from "@/shared/lib/validations/terms";

interface TermsVersionFormProps {
  termsId: string;
  termsType: TermsType;
  businessInfo?: BusinessInfo;
  version?: TermsVersionDetail | null;
  redirectTo: string;
  editorHeight?: string;
}

export function TermsVersionForm({
  termsId,
  termsType,
  businessInfo,
  version,
  redirectTo,
  editorHeight = "600px",
}: TermsVersionFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [contentJson, setContentJson] = useState(
    version?.contentJson ? JSON.stringify(version.contentJson) : "",
  );
  const [editorKey, setEditorKey] = useState(0);
  const [initialHtml, setInitialHtml] = useState(version?.contentHtml ?? "");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  const isEditing = !!version;
  const templates = getTemplatesForType(termsType);

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (templateId === "blank") {
      setContentJson("");
      setInitialHtml("");
      setEditorKey((k) => k + 1);
      return;
    }
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      const appliedContent = businessInfo
        ? applyBusinessInfo(template.content, businessInfo)
        : template.content;
      setContentJson("");
      setInitialHtml(appliedContent);
      setEditorKey((k) => k + 1);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!contentJson.trim()) {
      toast.error("規約内容を入力してください");
      return;
    }

    startTransition(async () => {
      const result = isEditing
        ? await updateTermsVersion(version.id, { contentJson })
        : await createTermsVersion({ termsId, contentJson });

      if (result.success) {
        toast.success(result.message);
        router.push(redirectTo);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* テンプレート選択（新規作成時のみ） */}
      {!isEditing && templates.length > 0 && (
        <div className="space-y-2">
          <Label>テンプレートから作成</Label>
          <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
            <SelectTrigger>
              <SelectValue placeholder="テンプレートを選択..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blank">空白から作成</SelectItem>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTemplate && selectedTemplate !== "blank" && (
            <p className="text-xs text-muted-foreground">
              {templates.find((t) => t.id === selectedTemplate)?.description}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>規約内容 *</Label>
        <div style={{ minHeight: editorHeight }}>
          <LexicalEditor
            key={editorKey}
            contentJson={contentJson || undefined}
            contentHtml={initialHtml}
            onChange={setContentJson}
            placeholder="規約の内容を入力してください..."
            className={EDITOR_PROSE_CLASSES}
            height={editorHeight}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          リッチテキストエディタを使用して規約内容を作成できます。
          見出し、リスト、表などの書式を使用できます。
        </p>
      </div>

      <div className="flex gap-2 justify-end pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? isEditing
              ? "更新中..."
              : "作成中..."
            : isEditing
              ? "バージョンを更新"
              : "バージョンを作成"}
        </Button>
      </div>
    </form>
  );
}
```

### Step 2: 型チェック実行

```bash
bun run type-check
```

Expected: エラーなし（まだ呼び出し元を修正していないためエラーが出る場合は次のタスクで解消）

---

## Task 2: 新規作成ページ `versions/new/page.tsx` を作成

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/terms/[id]/versions/new/page.tsx`

### Step 1: ファイルを作成する

```tsx
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTermsById } from "@/admin/actions/terms";
import { getSettings } from "@/admin/actions/settings";
import { TermsVersionForm } from "../../../_components/TermsVersionForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import type { Metadata } from "next";
import type { BusinessInfo } from "@/shared/lib/terms-templates";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const result = await getTermsById(id);
  if (!result.success || !result.data) {
    return { title: "新しいバージョンを作成 | Myrrh Rental Space" };
  }
  return {
    title: `新しいバージョンを作成 | ${result.data.title} | Myrrh Rental Space`,
  };
}

export default async function NewVersionPage({ params }: PageProps) {
  await connection();
  const { id } = await params;
  const [result, settings] = await Promise.all([
    getTermsById(id),
    getSettings(),
  ]);

  if (!result.success || !result.data) {
    notFound();
  }

  const terms = result.data;

  const businessInfo: BusinessInfo = {
    businessName: settings?.businessName ?? null,
    email: settings?.email ?? null,
    phoneNumber: settings?.phoneNumber ?? null,
    postalCode: settings?.postalCode ?? null,
    prefecture: settings?.prefecture ?? null,
    city: settings?.city ?? null,
    streetAddress: settings?.streetAddress ?? null,
    buildingName: settings?.buildingName ?? null,
  };

  return (
    <AdminDetailLayout
      backHref={`/admin/terms/${id}`}
      backLabel="詳細に戻る"
      title="新しいバージョンを作成"
      subtitle={terms.title}
    >
      <TermsVersionForm
        termsId={id}
        termsType={terms.type}
        businessInfo={businessInfo}
        redirectTo={`/admin/terms/${id}`}
      />
    </AdminDetailLayout>
  );
}
```

**注意:** `../../../_components/TermsVersionForm` の相対パス確認

- このファイルは `terms/[id]/versions/new/page.tsx`
- `_components` は `terms/_components/` にある
- よって `../../../_components` = `terms/[id]/versions/new` → 3階層上 → `terms/`

### Step 2: 型チェック実行

```bash
bun run type-check
```

Expected: 新規ページのエラーなし

---

## Task 3: 編集ページを修正（AdminDetailLayout 適用・redirectTo 追加）

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/terms/[id]/versions/[versionId]/edit/page.tsx`

### Step 1: ファイル全体を修正する

手動ヘッダー（`div + ArrowLeft + Button + Link`）を `AdminDetailLayout` に置き換え。
`onSuccess` 空実装を削除して `redirectTo` を追加。

```tsx
import { notFound, redirect } from "next/navigation";
import { getTermsById, getTermsVersionById } from "@/admin/actions/terms";
import { TermsVersionForm } from "../../../../_components/TermsVersionForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "バージョン編集 | Myrrh Rental Space",
};

interface EditVersionPageProps {
  params: Promise<{ id: string; versionId: string }>;
}

export default async function EditVersionPage({
  params,
}: EditVersionPageProps) {
  await connection();
  const { id, versionId } = await params;

  const [termsResult, versionResult] = await Promise.all([
    getTermsById(id),
    getTermsVersionById(versionId),
  ]);

  if (!termsResult.success || !termsResult.data) {
    notFound();
  }

  if (!versionResult.success || !versionResult.data) {
    notFound();
  }

  const version = versionResult.data;

  // 公開済みバージョンは編集不可
  if (version.status !== "DRAFT") {
    redirect(`/admin/terms/${id}`);
  }

  return (
    <AdminDetailLayout
      backHref={`/admin/terms/${id}/versions/${versionId}`}
      backLabel="詳細に戻る"
      title={`バージョン ${version.version} を編集`}
      subtitle={termsResult.data.title}
    >
      <TermsVersionForm
        termsId={id}
        termsType={termsResult.data.type}
        version={version}
        redirectTo={`/admin/terms/${id}/versions/${versionId}`}
      />
    </AdminDetailLayout>
  );
}
```

**削除した import:** `Link`, `ArrowLeft` from `lucide-react`, `Button` from ui

### Step 2: 型チェック実行

```bash
bun run type-check
```

Expected: エラーなし

---

## Task 4: `TermsDetailView` — ダイアログ削除・Link化

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/terms/_components/TermsDetailView.tsx`

### Step 1: 変更点を適用する

以下の変更をすべて行う:

**1. import の変更**

削除:

```tsx
import { TermsVersionForm } from "./TermsVersionForm";
```

追加:

```tsx
import Link from "next/link";
```

削除（`BusinessInfo` 型 — もう使わない）:

```tsx
import type { BusinessInfo } from "@/shared/lib/terms-templates";
```

**2. props から `businessInfo` を削除**

```tsx
// Before
interface TermsDetailViewProps {
  terms: TermsDetail
  businessInfo: BusinessInfo
}

export function TermsDetailView({ terms, businessInfo }: TermsDetailViewProps) {

// After
interface TermsDetailViewProps {
  terms: TermsDetail
}

export function TermsDetailView({ terms }: TermsDetailViewProps) {
```

**3. `showNewVersionDialog` state を削除**

```tsx
// 削除
const [showNewVersionDialog, setShowNewVersionDialog] = useState(false);
```

**4. バージョン一覧のボタンを Link に変更**

```tsx
// Before
<Button onClick={() => setShowNewVersionDialog(true)}>
  新しいバージョンを作成
</Button>

// After
<Button asChild>
  <Link href={`/admin/terms/${terms.id}/versions/new`}>
    新しいバージョンを作成
  </Link>
</Button>
```

**5. 新バージョン作成 Dialog ブロックを削除**

以下のブロック全体（約20行）を削除:

```tsx
{
  /* New Version Dialog */
}
<Dialog open={showNewVersionDialog} onOpenChange={setShowNewVersionDialog}>
  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>新しいバージョンを作成</DialogTitle>
      <DialogDescription>
        規約の新しいバージョンを作成します。作成後、公開することで有効になります。
      </DialogDescription>
    </DialogHeader>
    <TermsVersionForm
      termsId={terms.id}
      termsType={terms.type}
      businessInfo={businessInfo}
      onSuccess={() => {
        setShowNewVersionDialog(false);
        router.refresh();
      }}
      onCancel={() => setShowNewVersionDialog(false)}
    />
  </DialogContent>
</Dialog>;
```

**完成後のファイル全体イメージ:**

`useState` の import から `showNewVersionDialog` 削除、`useRouter` は削除確認（削除確認用: `router.refresh()` をまだ使っているか確認）。

`router` は `handlePublish`, `handleArchive`, `confirmDeleteVersion` の `router.refresh()` で引き続き使用しているので削除しない。

### Step 2: 型チェック実行

```bash
bun run type-check
```

Expected: エラーなし

---

## Task 5: 詳細ページから不要な `businessInfo` 処理を削除

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/terms/[id]/page.tsx`

### Step 1: `getSettings` 呼び出しと `businessInfo` 構築を削除

`TermsDetailView` が `businessInfo` を受け取らなくなったため、詳細ページから削除する。

```tsx
// Before
import { getSettings } from '@/admin/actions/settings'
import type { BusinessInfo } from '@/shared/lib/terms-templates'

const [result, settings] = await Promise.all([getTermsById(id), getSettings()])

const businessInfo: BusinessInfo = {
  businessName: settings?.businessName ?? null,
  email: settings?.email ?? null,
  phoneNumber: settings?.phoneNumber ?? null,
  postalCode: settings?.postalCode ?? null,
  prefecture: settings?.prefecture ?? null,
  city: settings?.city ?? null,
  streetAddress: settings?.streetAddress ?? null,
  buildingName: settings?.buildingName ?? null,
}

return (
  ...
  <TermsDetailView terms={terms} businessInfo={businessInfo} />
)

// After
// getSettings import 削除
// BusinessInfo import 削除
// Promise.all から getSettings を削除

const result = await getTermsById(id)  // または Promise.all の片方だけ

return (
  ...
  <TermsDetailView terms={terms} />
)
```

`generateMetadata` でも `settings` を使っていないことを確認（使っていない）。

### Step 2: 型チェック実行

```bash
bun run type-check
```

Expected: エラーなし

---

## Task 6: 最終検証とコミット

### Step 1: validate 実行

```bash
bun run validate
```

Expected: type-check + lint 両方 PASS

### Step 2: ビルド確認

```bash
bun run build
```

Expected: ビルド成功

### Step 3: コミット

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/terms/
git commit -m "refactor(terms): バージョン作成をダイアログから専用ページに移行

- TermsVersionForm: onSuccess/onCancel を redirectTo に置き換え
- 新規作成ページ: /admin/terms/{id}/versions/new を追加
- 編集ページ: AdminDetailLayout 適用・リダイレクト修正
- TermsDetailView: ダイアログ削除・Link化"
```

---

## チェックリスト

- [ ] Task 1: `TermsVersionForm` props 再設計
- [ ] Task 2: `versions/new/page.tsx` 作成
- [ ] Task 3: 編集ページ修正
- [ ] Task 4: `TermsDetailView` ダイアログ削除
- [ ] Task 5: 詳細ページ `businessInfo` 削除
- [ ] Task 6: validate + build + commit

## 注意事項

- `versions/new` は静的セグメントのため `versions/[versionId]` より優先される（Next.js App Router の仕様）
- `TermsVersionForm` の `LexicalEditor` ローディング表示の `h-[400px]` → `h-[600px]` に合わせること（Task 1 のコードに含まれている）
- 編集ページの `redirectTo` は `/admin/terms/${id}/versions/${versionId}`（バージョンプレビューへ戻る）
- 新規作成ページの `redirectTo` は `/admin/terms/${id}`（規約詳細へ戻る）
