# 利用規約管理 UX 全面見直し 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 利用規約の InlineEditor 統合・バージョン管理 UI 完全実装・公開ページ新設

**Architecture:** InlineEditor にバージョン選択・公開フロー・バージョン管理を統合。既存の TermsDetailView・TermsVersionForm・versions サブページを廃止。公開ページ `/terms/[slug]` を新設。

**Tech Stack:** Next.js 16 App Router, Server Actions (`withPermission`), LexicalEditor (non-controlled, `editorKey` re-mount), React Hook Form + Zod 4, `'use cache'` + `cacheTag` + `safeFetch`

---

## 前提知識

- **LexicalEditor は非制御コンポーネント** — 初期化後に props 変更を無視する。バージョン切り替え時は `editorKey` をインクリメントして re-mount する
- **`connection()` は各 async 関数で1回のみ** — 同一関数内での複数呼び出しは Gotcha 違反
- **`SanitizedHtml`** — `@/shared/components/SanitizedHtml` に存在（ブログ詳細ページで使用実績あり）
- **`CACHE_TAGS.TERMS`** — 既存（値: `'terms'`）
- **既存 Server Actions** — `getTermsById`, `getTermsVersionById`, `createTermsVersion`, `updateTermsVersion`, `publishTermsVersion`, `archiveTermsVersion`, `deleteTermsVersion`, `updateTerms`, `deleteTerms` はすべて `withPermission` HOF で実装済み
- **`getTermsById` の `versions` select** — `{ id, version, status, publishedAt, isCurrentVersion, createdAt }` を返す（変更不要）
- **`TermsStatus` enum** — `DRAFT | PUBLISHED | ARCHIVED`（`@/shared/generated/prisma/enums` から import）

---

### Task 1: 廃止ファイルを削除する

**Files:**

- Delete: `src/app/(admin)/admin/(dashboard)/terms/[id]/versions/new/page.tsx`
- Delete: `src/app/(admin)/admin/(dashboard)/terms/[id]/versions/[versionId]/page.tsx`
- Delete: `src/app/(admin)/admin/(dashboard)/terms/[id]/versions/[versionId]/edit/page.tsx`
- Delete: `src/app/(admin)/admin/(dashboard)/terms/_components/TermsDetailView.tsx`
- Delete: `src/app/(admin)/admin/(dashboard)/terms/_components/TermsVersionForm.tsx`

**Step 1: Git で追跡ファイルを削除する**

MINGW64 では `rm -rf` が deny されているため `git rm` を使用する。
バックスラッシュ問題を避けるため Python で削除してから git add する方法も可。

```bash
git rm -r 'src/app/(admin)/admin/(dashboard)/terms/[id]/versions'
git rm 'src/app/(admin)/admin/(dashboard)/terms/_components/TermsDetailView.tsx'
git rm 'src/app/(admin)/admin/(dashboard)/terms/_components/TermsVersionForm.tsx'
```

**Step 2: 型チェックでビルドエラーがないか確認**

```bash
bun run type-check
```

Expected: PASS（削除ファイルへの参照があればエラーが出る。Task 3〜4 で修正する）

**Step 3: コミット**

```bash
git add -u
git commit -m "feat(terms): 廃止ファイルを削除（TermsDetailView・TermsVersionForm・versionsサブページ）"
```

---

### Task 2: new/page.tsx の connection() 二重呼び出しバグを修正する

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/terms/new/page.tsx`

**Step 1: ファイルを確認する**

Read でファイルを開き、`await connection()` の呼び出し箇所を確認する。

**Step 2: 重複した `await connection()` を削除する**

現在のバグ（行12-13付近に2回ある）:

```typescript
// NG: 2回呼んでいる
await connection();
await connection();
```

修正後（1回のみ残す）:

```typescript
// OK
await connection();
```

Edit ツールで2行目の `await connection();` を削除する。

**Step 3: 型チェック確認**

```bash
bun run type-check
```

Expected: PASS

**Step 4: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/terms/new/page.tsx'
git commit -m "fix(terms): new/page.tsx の connection() 二重呼び出しを修正"
```

---

### Task 3: TermsInlineEditor を edit モード完全実装にリライトする

**Files:**

- Rewrite: `src/app/(admin)/admin/(dashboard)/terms/_components/TermsInlineEditor.tsx`

**Step 1: ファイル全体を以下のコードで置き換える**

```typescript
"use client";

/**
 * 規約インラインエディター
 *
 * create モード: 規約新規作成（テンプレート選択あり）
 * edit モード: バージョン選択・公開フロー・バージョン管理を統合
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import {
  EditorHeader,
  SidePanelShell,
  InlineEditorShell,
} from "@/admin/components/editor/inline";
import {
  createTermsWithVersion,
  updateTerms,
  updateTermsVersion,
  deleteTerms,
  getDefaultsForTermsType,
  getTermsVersionById,
  createTermsVersion,
  publishTermsVersion,
  archiveTermsVersion,
  deleteTermsVersion,
} from "@/admin/actions/terms";
import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { TERMS_TYPES, parseTermsType } from "@/shared/lib/validations/terms";
import {
  getTemplatesForType,
  applyBusinessInfo,
  type BusinessInfo,
} from "@/shared/lib/terms-templates";
import type { TermsType } from "@/shared/generated/prisma/client";
import { TermsStatus } from "@/shared/generated/prisma/enums";
import type { TermsVersionDetail } from "@/shared/lib/validations/terms";

const LexicalEditor = dynamic(
  () =>
    import("@/admin/components/editor/lexical").then((mod) => ({
      default: mod.LexicalEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[500px] flex items-center justify-center bg-muted/50">
        <div className="animate-pulse text-muted-foreground">
          エディタを読み込み中...
        </div>
      </div>
    ),
  },
);

// =============================================================================
// Schema
// =============================================================================

const termsFormSchema = z.object({
  title: z.string().min(1, { error: "タイトルを入力してください" }).max(100),
  slug: z
    .string()
    .min(1, { error: "スラッグを入力してください" })
    .max(50)
    .regex(/^[a-z0-9-]+$/, { error: "小文字英数字とハイフンのみ" }),
  type: z.string().min(1, { error: "規約タイプを選択してください" }),
  contentJson: z.string().min(1, { error: "コンテンツを入力してください" }),
  selectedTemplate: z.string().optional(),
});

type FormData = z.infer<typeof termsFormSchema>;

// =============================================================================
// Types
// =============================================================================

interface TermsVersionSummary {
  id: string;
  version: number;
  status: TermsStatus;
  isCurrentVersion: boolean;
  publishedAt: Date | null;
  createdAt: Date;
}

interface TermsData {
  id: string;
  title: string;
  slug: string;
  type: TermsType;
  isActive: boolean;
  versions: TermsVersionSummary[];
}

interface TermsInlineEditorProps {
  terms?: TermsData;
  initialVersion?: TermsVersionDetail | null;
  businessInfo?: BusinessInfo;
  mode?: "create" | "edit";
}

// =============================================================================
// Helpers
// =============================================================================

function versionLabel(v: TermsVersionSummary): string {
  return `v${v.version} ${
    v.status === TermsStatus.DRAFT
      ? "（下書き）"
      : v.status === TermsStatus.PUBLISHED
        ? v.isCurrentVersion
          ? "（公開中・現行）"
          : "（公開済み）"
        : "（アーカイブ）"
  }`;
}

function statusBadgeVariant(
  status: TermsStatus,
): "default" | "secondary" | "outline" {
  if (status === TermsStatus.PUBLISHED) return "default";
  if (status === TermsStatus.DRAFT) return "secondary";
  return "outline";
}

function statusLabel(status: TermsStatus): string {
  if (status === TermsStatus.PUBLISHED) return "公開中";
  if (status === TermsStatus.DRAFT) return "下書き";
  return "アーカイブ";
}

// =============================================================================
// Component
// =============================================================================

export function TermsInlineEditor({
  terms,
  initialVersion,
  businessInfo,
  mode = "edit",
}: TermsInlineEditorProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(true);
  const [hasEditorChanges, setHasEditorChanges] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [templateHtml, setTemplateHtml] = useState<string | null>(null);

  // Version management state (edit mode only)
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    initialVersion?.id ?? "",
  );
  const [selectedVersionContent, setSelectedVersionContent] =
    useState<TermsVersionDetail | null>(initialVersion ?? null);
  const [localVersions, setLocalVersions] = useState<TermsVersionSummary[]>(
    terms?.versions ?? [],
  );
  const [isLoadingVersion, setIsLoadingVersion] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(termsFormSchema),
    defaultValues: terms
      ? {
          title: terms.title,
          slug: terms.slug,
          type: terms.type,
          contentJson: initialVersion?.contentJson
            ? JSON.stringify(initialVersion.contentJson)
            : "",
          selectedTemplate: "",
        }
      : {
          title: "",
          slug: "",
          type: "",
          contentJson: "",
          selectedTemplate: "",
        },
  });

  const title = useWatch({ control, name: "title" });
  const contentJson = useWatch({ control, name: "contentJson" });
  const slug = useWatch({ control, name: "slug" });
  const selectedTypeRaw = useWatch({ control, name: "type" });
  const selectedTemplate = useWatch({ control, name: "selectedTemplate" });

  const selectedType = parseTermsType(selectedTypeRaw);
  const templates = selectedType ? getTemplatesForType(selectedType) : [];

  // 選択中バージョンが DRAFT 以外なら読み取り専用
  const isEditorReadOnly =
    mode === "edit" &&
    !!selectedVersionContent &&
    selectedVersionContent.status !== TermsStatus.DRAFT;

  // =============================================================================
  // Create mode handlers
  // =============================================================================

  const handleTypeChange = async (newType: string) => {
    setValue("type", newType, { shouldDirty: true });
    if (mode !== "create") return;
    const defaults = await getDefaultsForTermsType(newType);
    if (!defaults) return;
    setValue("title", defaults.title, { shouldDirty: true });
    setValue("slug", defaults.slug, { shouldDirty: true });
    setValue("selectedTemplate", "");
  };

  const handleTemplateChange = (templateId: string) => {
    setValue("selectedTemplate", templateId);
    if (templateId === "blank") {
      setValue("contentJson", "", { shouldDirty: true });
      setTemplateHtml("");
      setEditorKey((k) => k + 1);
      setHasEditorChanges(true);
      return;
    }
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      const appliedContent = businessInfo
        ? applyBusinessInfo(template.content, businessInfo)
        : template.content;
      setValue("contentJson", "", { shouldDirty: true });
      setTemplateHtml(appliedContent);
      setEditorKey((k) => k + 1);
      setHasEditorChanges(true);
    }
  };

  // =============================================================================
  // Version management handlers (edit mode only)
  // =============================================================================

  const handleVersionSwitch = async (newVersionId: string) => {
    if (isPending || isLoadingVersion || newVersionId === selectedVersionId)
      return;

    if (isDirty || hasEditorChanges) {
      const confirmed = await confirm({
        title: "変更を破棄して切り替えますか？",
        description: "保存されていない変更は失われます。",
        confirmLabel: "切り替える",
        variant: "destructive",
      });
      if (!confirmed) return;
    }

    setIsLoadingVersion(true);
    try {
      const result = await getTermsVersionById(newVersionId);
      if (result.success && result.data) {
        setValue(
          "contentJson",
          result.data.contentJson
            ? JSON.stringify(result.data.contentJson)
            : "",
          { shouldDirty: false },
        );
        setSelectedVersionContent(result.data);
        setSelectedVersionId(newVersionId);
        setEditorKey((k) => k + 1);
        setHasEditorChanges(false);
      } else {
        toast.error("バージョンの読み込みに失敗しました");
      }
    } catch (error) {
      logger.error("バージョン切り替えに失敗しました", {
        error: getErrorMessage(error),
      });
      toast.error("バージョンの切り替えに失敗しました");
    } finally {
      setIsLoadingVersion(false);
    }
  };

  const handleCreateNewVersion = () => {
    if (!terms || isPending) return;
    startTransition(async () => {
      const confirmed = await confirm({
        title: "新しいバージョンを作成しますか？",
        description: "現在の内容から新しい下書きバージョンを作成します。",
        confirmLabel: "作成する",
      });
      if (!confirmed) return;

      try {
        const result = await createTermsVersion({
          termsId: terms.id,
          contentJson: contentJson || "",
        });
        if (result.success && result.data) {
          const newVersionSummary: TermsVersionSummary = {
            id: result.data.id,
            version: result.data.version,
            status: TermsStatus.DRAFT,
            isCurrentVersion: false,
            publishedAt: null,
            createdAt: new Date(),
          };
          setLocalVersions((prev) => [newVersionSummary, ...prev]);
          await handleVersionSwitch(result.data.id);
          toast.success(`v${result.data.version} を作成しました`);
        } else {
          toast.error(result.error ?? "バージョンの作成に失敗しました");
        }
      } catch (error) {
        logger.error("バージョン作成に失敗しました", {
          error: getErrorMessage(error),
        });
        toast.error("バージョンの作成に失敗しました");
      }
    });
  };

  const handlePublishVersion = () => {
    if (!selectedVersionId || isPending) return;
    startTransition(async () => {
      const confirmed = await confirm({
        title: "このバージョンを公開しますか？",
        description: "公開すると現在の公開バージョンが置き換えられます。",
        confirmLabel: "公開する",
      });
      if (!confirmed) return;

      try {
        const result = await publishTermsVersion(selectedVersionId);
        if (result.success) {
          setLocalVersions((prev) =>
            prev.map((v) => ({
              ...v,
              status:
                v.id === selectedVersionId ? TermsStatus.PUBLISHED : v.status,
              isCurrentVersion: v.id === selectedVersionId,
            })),
          );
          setSelectedVersionContent((prev) =>
            prev
              ? { ...prev, status: TermsStatus.PUBLISHED, isCurrentVersion: true }
              : null,
          );
          toast.success("バージョンを公開しました");
          router.refresh();
        } else {
          toast.error(result.error ?? "公開に失敗しました");
        }
      } catch (error) {
        logger.error("公開に失敗しました", { error: getErrorMessage(error) });
        toast.error("公開に失敗しました");
      }
    });
  };

  const handleArchiveVersion = () => {
    if (!selectedVersionId || isPending) return;
    startTransition(async () => {
      const confirmed = await confirm({
        title: "このバージョンをアーカイブしますか？",
        description:
          "アーカイブすると現在のバージョンとして使用できなくなります。",
        confirmLabel: "アーカイブ",
        variant: "destructive",
      });
      if (!confirmed) return;

      try {
        const result = await archiveTermsVersion(selectedVersionId);
        if (result.success) {
          setLocalVersions((prev) =>
            prev.map((v) =>
              v.id === selectedVersionId
                ? {
                    ...v,
                    status: TermsStatus.ARCHIVED,
                    isCurrentVersion: false,
                  }
                : v,
            ),
          );
          setSelectedVersionContent((prev) =>
            prev
              ? {
                  ...prev,
                  status: TermsStatus.ARCHIVED,
                  isCurrentVersion: false,
                }
              : null,
          );
          toast.success("バージョンをアーカイブしました");
        } else {
          toast.error(result.error ?? "アーカイブに失敗しました");
        }
      } catch (error) {
        logger.error("アーカイブに失敗しました", {
          error: getErrorMessage(error),
        });
        toast.error("アーカイブに失敗しました");
      }
    });
  };

  const handleDeleteVersion = () => {
    if (!selectedVersionId || isPending) return;
    startTransition(async () => {
      const confirmed = await confirm({
        title: "このバージョンを削除しますか？",
        description: "この操作は取り消せません。",
        confirmLabel: "削除",
        variant: "destructive",
      });
      if (!confirmed) return;

      try {
        const result = await deleteTermsVersion(selectedVersionId);
        if (result.success) {
          const newVersions = localVersions.filter(
            (v) => v.id !== selectedVersionId,
          );
          setLocalVersions(newVersions);
          if (newVersions.length > 0) {
            await handleVersionSwitch(newVersions[0].id);
          } else {
            setSelectedVersionId("");
            setSelectedVersionContent(null);
            setEditorKey((k) => k + 1);
          }
          toast.success("バージョンを削除しました");
        } else {
          toast.error(result.error ?? "削除に失敗しました");
        }
      } catch (error) {
        logger.error("バージョン削除に失敗しました", {
          error: getErrorMessage(error),
        });
        toast.error("バージョンの削除に失敗しました");
      }
    });
  };

  // =============================================================================
  // Common handlers
  // =============================================================================

  const handleJsonChange = (json: string) => {
    setValue("contentJson", json, { shouldDirty: true });
    setHasEditorChanges(true);
  };

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        const termsType = parseTermsType(data.type);
        if (!termsType) {
          toast.error("無効な規約タイプです");
          return;
        }

        if (mode === "create") {
          const result = await createTermsWithVersion({
            title: data.title,
            slug: data.slug,
            type: termsType,
            isActive: true,
            contentJson: data.contentJson,
          });
          if (result.success) {
            toast.success("規約を作成しました");
            router.push(`/admin/terms/${result.data.id}/edit`);
          } else {
            toast.error(result.error);
          }
          return;
        }

        if (!terms) return;

        // 基本情報の更新（title/slug が変更されている場合）
        if (isDirty) {
          const updateResult = await updateTerms(terms.id, {
            title: data.title,
            slug: data.slug,
          });
          if (!updateResult.success) {
            toast.error(updateResult.error);
            return;
          }
        }

        // DRAFT バージョンのコンテンツ更新
        if (
          hasEditorChanges &&
          selectedVersionContent?.status === TermsStatus.DRAFT
        ) {
          const versionResult = await updateTermsVersion(selectedVersionId, {
            contentJson: data.contentJson,
          });
          if (!versionResult.success) {
            toast.error(versionResult.error);
            return;
          }
        }

        // PUBLISHED バージョン選択中でコンテンツ変更あり → 新バージョン作成を提案
        if (
          hasEditorChanges &&
          selectedVersionContent &&
          selectedVersionContent.status !== TermsStatus.DRAFT
        ) {
          const confirmed = await confirm({
            title: "新しいバージョンを作成しますか？",
            description:
              "公開済みバージョンは直接編集できません。新しい下書きバージョンを作成して変更を保存します。",
            confirmLabel: "作成する",
          });
          if (!confirmed) return;

          const versionResult = await createTermsVersion({
            termsId: terms.id,
            contentJson: data.contentJson,
          });
          if (!versionResult.success) {
            toast.error(versionResult.error ?? "バージョンの作成に失敗しました");
            return;
          }

          const newVersionSummary: TermsVersionSummary = {
            id: versionResult.data.id,
            version: versionResult.data.version,
            status: TermsStatus.DRAFT,
            isCurrentVersion: false,
            publishedAt: null,
            createdAt: new Date(),
          };
          setLocalVersions((prev) => [newVersionSummary, ...prev]);
          await handleVersionSwitch(versionResult.data.id);
          toast.success(`v${versionResult.data.version} として保存しました`);
          return;
        }

        setHasEditorChanges(false);
        router.refresh();
        toast.success("保存しました");
      } catch (error) {
        logger.error("保存中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("保存中にエラーが発生しました");
      }
    });
  };

  const handleSave = () => {
    if (isPending) return;
    handleSubmit(onSubmit)();
  };

  const handlePreview = () => {
    if (mode === "create") {
      toast.info("規約を作成後にプレビューできます");
      return;
    }
    if (isDirty || hasEditorChanges) {
      toast.info("プレビューには保存済みのコンテンツが表示されます");
    }
    if (terms) {
      window.open(`/terms/${terms.slug}`, "_blank");
    }
  };

  const handleBack = async () => {
    const isUnsaved = isDirty || hasEditorChanges;
    if (isUnsaved) {
      const confirmed = await confirm({
        title: "変更を破棄しますか？",
        description:
          "保存されていない変更があります。破棄してもよろしいですか？",
        confirmLabel: "破棄",
        variant: "destructive",
      });
      if (!confirmed) return;
    }
    router.push("/admin/terms");
  };

  const handleDeleteTerms = () => {
    if (!terms) return;
    startTransition(async () => {
      try {
        const result = await deleteTerms(terms.id);
        if (result.success) {
          toast.success("規約を削除しました");
          router.push("/admin/terms");
        } else {
          toast.error(result.error);
        }
      } catch (error) {
        logger.error("削除中にエラーが発生しました", {
          error: getErrorMessage(error),
        });
        toast.error("削除中にエラーが発生しました");
      }
    });
  };

  const isFormDirty = isDirty || hasEditorChanges;

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <InlineEditorShell
      onSubmit={handleSubmit(onSubmit)}
      onSave={handleSave}
      isDirty={isFormDirty}
      isPanelOpen={isSidePanelOpen}
      header={
        <EditorHeader
          title={title || (mode === "create" ? "新規規約" : terms?.title ?? "")}
          slug={
            mode === "create"
              ? "terms/new"
              : `terms/${slug || terms?.slug ?? ""}`
          }
          isDirty={isFormDirty}
          isPending={isPending || isLoadingVersion}
          isSidePanelOpen={isSidePanelOpen}
          onToggleSidePanel={() => setIsSidePanelOpen((prev) => !prev)}
          onSave={handleSave}
          onPreview={handlePreview}
          onBack={handleBack}
          extraActions={
            mode === "edit" && terms ? (
              <div className="flex items-center gap-2">
                {isEditorReadOnly && (
                  <Badge variant="outline" className="text-xs">
                    読み取り専用
                  </Badge>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={isPending}
                  onClick={handleDeleteTerms}
                >
                  削除
                </Button>
              </div>
            ) : undefined
          }
        />
      }
      panel={
        <SidePanelShell
          isOpen={isSidePanelOpen}
          onClose={() => setIsSidePanelOpen(false)}
          title="規約設定"
          width="default"
        >
          <div className="space-y-6">
            {/* バージョン管理（edit モードのみ） */}
            {mode === "edit" && localVersions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium">バージョン管理</h3>

                {/* 選択中バージョンのバッジ */}
                {selectedVersionContent && (
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={statusBadgeVariant(
                        selectedVersionContent.status,
                      )}
                    >
                      v{selectedVersionContent.version}{" "}
                      {statusLabel(selectedVersionContent.status)}
                    </Badge>
                    {selectedVersionContent.isCurrentVersion && (
                      <span className="text-xs text-muted-foreground">
                        現行
                      </span>
                    )}
                  </div>
                )}

                {/* バージョン選択ドロップダウン */}
                <Select
                  value={selectedVersionId}
                  onValueChange={(id) => void handleVersionSwitch(id)}
                  disabled={isPending || isLoadingVersion}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="バージョンを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {localVersions.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {versionLabel(v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* バージョン別アクション */}
                {selectedVersionContent?.status === TermsStatus.DRAFT && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handlePublishVersion}
                      disabled={isPending}
                      className="flex-1"
                    >
                      公開する
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={handleDeleteVersion}
                      disabled={isPending}
                    >
                      削除
                    </Button>
                  </div>
                )}

                {selectedVersionContent?.status === TermsStatus.PUBLISHED &&
                  !selectedVersionContent.isCurrentVersion && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleArchiveVersion}
                        disabled={isPending}
                        className="flex-1"
                      >
                        アーカイブ
                      </Button>
                    </div>
                  )}

                {selectedVersionContent?.status === TermsStatus.PUBLISHED &&
                  selectedVersionContent.isCurrentVersion && (
                    <p className="text-xs text-muted-foreground">
                      現行の公開バージョンは編集できません
                    </p>
                  )}

                {/* 新しいバージョンを作成 */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCreateNewVersion}
                  disabled={isPending || isLoadingVersion}
                  className="w-full"
                >
                  新しいバージョンを作成
                </Button>
              </div>
            )}

            {/* 基本情報 */}
            <div className="space-y-4 border-t pt-4 first:border-t-0 first:pt-0">
              <h3 className="text-sm font-medium">基本情報</h3>

              <div className="space-y-2">
                <Label htmlFor="title">タイトル *</Label>
                <Input
                  id="title"
                  placeholder="規約のタイトル"
                  {...register("title")}
                  disabled={isPending}
                />
                {errors.title && (
                  <p className="text-xs text-destructive">
                    {errors.title.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">スラッグ *</Label>
                <Input
                  id="slug"
                  placeholder="terms-of-use"
                  {...register("slug")}
                  disabled={isPending}
                />
                {errors.slug && (
                  <p className="text-xs text-destructive">
                    {errors.slug.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  URLに使用されます: /terms/{slug || "slug"}
                </p>
              </div>

              <div className="space-y-2">
                <Label>規約タイプ</Label>
                {mode === "edit" ? (
                  <p className="text-sm text-muted-foreground">
                    {TERMS_TYPES.find((t) => t.value === selectedTypeRaw)
                      ?.label ?? selectedTypeRaw}
                  </p>
                ) : (
                  <Select
                    value={selectedType ?? ""}
                    onValueChange={(v) => void handleTypeChange(v)}
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="規約タイプを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {TERMS_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errors.type && (
                  <p className="text-xs text-destructive">
                    {errors.type.message}
                  </p>
                )}
              </div>
            </div>

            {/* テンプレート選択（create モードのみ） */}
            {mode === "create" && selectedType && templates.length > 0 && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="text-sm font-medium">テンプレート</h3>
                <div className="space-y-2">
                  <Label>テンプレートから作成</Label>
                  <Select
                    value={selectedTemplate || ""}
                    onValueChange={handleTemplateChange}
                    disabled={isPending}
                  >
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
                      {
                        templates.find((t) => t.id === selectedTemplate)
                          ?.description
                      }
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ショートカットヒント */}
            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground">
                ショートカット: Ctrl/Cmd + S で保存
              </p>
            </div>
          </div>
        </SidePanelShell>
      }
    >
      <LexicalEditor
        key={editorKey}
        contentJson={contentJson || undefined}
        contentHtml={
          templateHtml ??
          (initialVersion?.contentHtml && editorKey === 0
            ? initialVersion.contentHtml
            : "")
        }
        onChange={handleJsonChange}
        disabled={isPending || isEditorReadOnly || isLoadingVersion}
        className={EDITOR_PROSE_CLASSES}
        showToolbar
        height="100%"
      />
    </InlineEditorShell>
  );
}
```

**Step 2: 型チェック確認**

```bash
bun run type-check
```

Expected: 型エラーが出ればそれを修正する。`TermsStatus` の import が解決できているか、`archiveTermsVersion` / `deleteTermsVersion` が `terms.ts` からエクスポートされているか確認する。

**Step 3: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/terms/_components/TermsInlineEditor.tsx'
git commit -m "feat(terms): TermsInlineEditor を edit モード完全実装（バージョン管理統合）"
```

---

### Task 4: terms/[id]/edit/page.tsx を新規作成する

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/terms/[id]/edit/page.tsx`

**Step 1: ファイルを作成する**

```typescript
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getTermsById, getTermsVersionById } from "@/admin/actions/terms";
import { TermsInlineEditor } from "../_components/TermsInlineEditor";
import { TermsStatus } from "@/shared/generated/prisma/enums";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TermsEditPage({ params }: PageProps) {
  await connection();
  const { id } = await params;

  const termsResult = await getTermsById(id);

  if (!termsResult.success || !termsResult.data) {
    notFound();
  }

  const terms = termsResult.data;

  // 初期バージョンを取得: 最新 DRAFT → 最新 PUBLISHED → 先頭
  const initialVersionId =
    terms.versions.find((v) => v.status === TermsStatus.DRAFT)?.id ??
    terms.versions.find((v) => v.status === TermsStatus.PUBLISHED)?.id ??
    terms.versions[0]?.id;

  let initialVersion = null;
  if (initialVersionId) {
    const versionResult = await getTermsVersionById(initialVersionId);
    if (versionResult.success) {
      initialVersion = versionResult.data;
    }
  }

  return (
    <TermsInlineEditor
      terms={{
        id: terms.id,
        title: terms.title,
        slug: terms.slug,
        type: terms.type,
        isActive: terms.isActive,
        versions: terms.versions,
      }}
      initialVersion={initialVersion}
      mode="edit"
    />
  );
}
```

**Step 2: 型チェック確認**

```bash
bun run type-check
```

Expected: PASS

**Step 3: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/terms/[id]/edit/page.tsx'
git commit -m "feat(terms): terms/[id]/edit/page.tsx を新規作成"
```

---

### Task 5: terms/[id]/page.tsx をリダイレクトに変換する

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/terms/[id]/page.tsx`

**Step 1: ファイルを Read で確認する**

現在の実装（AdminDetailLayout + TermsDetailView）を確認する。

**Step 2: リダイレクト実装に書き換える**

```typescript
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TermsDetailPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/admin/terms/${id}/edit`);
}
```

**Step 3: 型チェック確認**

```bash
bun run type-check
```

Expected: PASS

**Step 4: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/terms/[id]/page.tsx'
git commit -m "feat(terms): terms/[id] を edit ページへリダイレクト"
```

---

### Task 6: 公開用 Server Action を作成する

**Files:**

- Create: `src/app/(public)/_shared/actions/terms.ts`

**Step 1: ファイルを作成する**

既存の `(public)/_shared/actions/post.ts` と同じパターンに従う。

```typescript
/**
 * 公開規約データ取得
 *
 * 'use cache' + cacheTag で Next.js 16 キャッシュ管理
 */

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/lib/prisma";
import {
  criticalFetch,
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { TermsStatus } from "@/shared/generated/prisma/enums";
import { slugParamSchema } from "@/shared/lib/validations/params";
import { toPlainObject } from "@/shared/lib/serialize";

// =============================================================================
// Types
// =============================================================================

const publicTermsSelect = {
  id: true,
  title: true,
  slug: true,
  type: true,
  versions: {
    where: {
      isCurrentVersion: true,
      status: TermsStatus.PUBLISHED,
    },
    take: 1,
    select: {
      id: true,
      version: true,
      contentHtml: true,
      publishedAt: true,
    },
  },
} as const;

export type PublicTermsData = {
  id: string;
  title: string;
  slug: string;
  type: string;
  currentVersion: {
    id: string;
    version: number;
    contentHtml: string;
    publishedAt: Date | null;
  } | null;
};

// =============================================================================
// Queries
// =============================================================================

/**
 * スラッグで公開規約を取得（公開ページ用）
 *
 * isCurrentVersion=true かつ status=PUBLISHED のバージョンを返す。
 * 存在しない場合は null を返す。
 */
export async function getPublicTermsBySlug(
  slug: string,
): Promise<PublicTermsData | null> {
  "use cache";
  cacheLife("days");
  cacheTag(CACHE_TAGS.TERMS);

  const validated = slugParamSchema.safeParse(slug);
  if (!validated.success) return null;

  const result = await safeFetch({
    fetch: () =>
      prisma.terms.findUnique({
        where: { slug: validated.data, isActive: true },
        select: publicTermsSelect,
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.HIGH,
    operationName: "getPublicTermsBySlug",
  });

  if (!result) return null;

  const currentVersion = result.versions[0] ?? null;

  return toPlainObject({
    id: result.id,
    title: result.title,
    slug: result.slug,
    type: result.type,
    currentVersion: currentVersion
      ? {
          id: currentVersion.id,
          version: currentVersion.version,
          contentHtml: currentVersion.contentHtml,
          publishedAt: currentVersion.publishedAt,
        }
      : null,
  });
}
```

**Step 2: 型チェック確認**

```bash
bun run type-check
```

Expected: PASS

**Step 3: コミット**

```bash
git add 'src/app/(public)/_shared/actions/terms.ts'
git commit -m "feat(terms): 公開用 Server Action getPublicTermsBySlug を追加"
```

---

### Task 7: 公開ページ /terms/[slug] を作成する

**Files:**

- Create: `src/app/(public)/terms/[slug]/page.tsx`

**Step 1: `(public)/terms/` ディレクトリが存在することを確認**

既存の `src/app/(public)/terms/page.tsx` があるので `[slug]` サブディレクトリを追加するだけ。

**Step 2: ファイルを作成する**

```typescript
/**
 * /terms/[slug] — 規約詳細公開ページ
 *
 * 最新の公開バージョン（isCurrentVersion=true, status=PUBLISHED）を表示する。
 * SEO: generateArticleMetadata + BreadcrumbJsonLd
 */

import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { BreadcrumbJsonLd } from "@/public/components/seo/JsonLd";
import { generateArticleMetadata } from "@/public/lib/seo/metadata-factory";
import { getBaseUrl } from "@/shared/lib/constants";
import { toISOString } from "@/shared/lib/serialize";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { PROSE_CLASSES } from "@/shared/lib/styles/prose";
import { getPublicTermsBySlug } from "@/public/actions/terms";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { slug } = await params;
  const terms = await getPublicTermsBySlug(slug);

  if (!terms || !terms.currentVersion) {
    return { title: "規約が見つかりません" };
  }

  return generateArticleMetadata(
    {
      title: terms.title,
      description: `${terms.title}をご確認ください。`,
    },
    {
      canonicalUrl: `${getBaseUrl()}/terms/${slug}`,
    },
  );
}

export default async function TermsDetailPage({ params }: PageProps) {
  await connection();

  const { slug } = await params;
  const terms = await getPublicTermsBySlug(slug);

  if (!terms || !terms.currentVersion) {
    notFound();
  }

  const baseUrl = getBaseUrl();
  const publishedAt = terms.currentVersion.publishedAt
    ? toISOString(terms.currentVersion.publishedAt)
    : null;

  return (
    <main className="mx-auto max-w-3xl px-5 py-16 md:px-8 md:py-24">
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: baseUrl },
          { name: terms.title, url: `${baseUrl}/terms/${slug}` },
        ]}
      />

      <article>
        <header className="mb-10 border-b pb-8">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {terms.title}
          </h1>
          {publishedAt && (
            <p className="mt-3 text-sm text-muted-foreground">
              最終更新:{" "}
              <time dateTime={publishedAt}>
                {new Date(publishedAt).toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </p>
          )}
        </header>

        <SanitizedHtml
          html={terms.currentVersion.contentHtml}
          className={PROSE_CLASSES}
        />
      </article>
    </main>
  );
}
```

**Note on `PROSE_CLASSES`**:

- `@/shared/lib/styles/prose` から import。ファイルが `EDITOR_PROSE_CLASSES` のみを export している場合は、それを使用するか公開ページ用の別定数を確認すること。もし存在しない場合は代わりに `"prose prose-stone max-w-none dark:prose-invert"` などを直接指定する。

**Step 3: 型チェック確認**

```bash
bun run type-check
```

Expected: PASS。`PROSE_CLASSES` の export が存在しない場合は適切な定数に修正する。

**Step 4: コミット**

```bash
git add 'src/app/(public)/terms/[slug]/page.tsx'
git commit -m "feat(terms): 公開ページ /terms/[slug] を新設"
```

---

### Task 8: 最終検証とコミット

**Step 1: validate を実行**

```bash
bun run validate
```

Expected: PASS（type-check + lint が全て通る）

**Step 2: ビルドを実行**

```bash
bun run build
```

Expected: BUILD SUCCESS

**Step 3: エラーがあれば修正**

よくある修正ポイント:

- `TermsStatus` の import パス（`@/shared/generated/prisma/enums` vs `@/shared/generated/prisma/client`）
- `PROSE_CLASSES` の export 有無
- `createTermsVersion` の返り値型（`data.id`, `data.version` のフィールド確認）
- `archiveTermsVersion` / `deleteTermsVersion` の export 確認

**Step 4: 最終コミット**

```bash
git add -u
git commit -m "feat(terms): 利用規約管理 UX 全面見直し（InlineEditor 統合・edit ページ・公開ページ）"
```

---

## 動作確認チェックリスト

実装完了後に以下を手動確認する:

- [x] `/admin/terms` の一覧から `[編集]` クリック → `/admin/terms/[id]/edit` に遷移する
- [x] `/admin/terms/[id]` にアクセス → `/admin/terms/[id]/edit` にリダイレクトされる
- [x] edit ページのサイドパネルにバージョン一覧が表示される
- [x] バージョンドロップダウンで切り替えるとエディタが更新される（re-mount）
- [x] DRAFT バージョン選択中: 「公開する」「削除」ボタンが表示される
- [x] PUBLISHED & 現行バージョン選択中: 「読み取り専用」バッジ表示・エディタが disabled
- [x] PUBLISHED & 非現行バージョン選択中: 「アーカイブ」ボタンが表示される
- [x] 「新しいバージョンを作成」でバージョンが追加されドロップダウンに現れる
- [x] 「公開する」で PUBLISHED に変わり `router.refresh()` が呼ばれる
- [x] `/admin/terms/new` で規約作成後 `/admin/terms/[id]/edit` に遷移する
- [x] `/terms/[slug]` で公開されている規約の contentHtml が表示される
- [x] 未公開の規約スラッグでアクセス → 404
- [x] ヘッダーの「プレビュー」ボタンが `/terms/[slug]` を新タブで開く
