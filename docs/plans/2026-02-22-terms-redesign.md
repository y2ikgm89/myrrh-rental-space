# 利用規約管理リデザイン Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Terms モデルの未使用 SEO フィールドを削除し、DRAFT 1本制約・TermsAgreement 閲覧ページ・サイドパネル整理でUXを改善する

**Architecture:** Prisma migration で DB をクリーンアップ後、関連コードを削除・変更する。新規機能（同意記録閲覧）は Server Action + Client Component の標準パターンで実装する。

**Tech Stack:** Next.js 16 `'use cache'`, Prisma 7 WASM, withPermission HOF, nuqs, shadcn/ui Tabs

**設計ドキュメント:** `docs/plans/2026-02-22-terms-redesign-design.md`

---

## Task 1: Prisma migration — Terms の SEO フィールド削除

**Files:**

- Modify: `prisma/schema.prisma`（Lines 1479, 1484-1489, 1498 — フィールド・インデックス削除）
- Create: `prisma/migrations/` （新規 migration SQL）

**Step 1: schema.prisma を変更**

`prisma/schema.prisma` の Terms モデルから以下を削除:

```prisma
// 削除するフィールド
isSiteWide Boolean   @default(false) // サイト全体の規約か（true: 公開ページで表示）

// 削除する SEO/OGP ブロック（コメント行も含む）
// SEO/OGP設定（サイト全体規約用）
metaDescription String? // メタディスクリプション
metaKeywords    String? // メタキーワード
ogpTitle        String? // OGPタイトル
ogpDescription  String? // OGP説明
ogpImageUrl     String? // OGP画像URL

// 削除するインデックス（isSiteWide を含む）
@@index([type, isSiteWide])
```

変更後の Terms モデル（Relations 直前）:

```prisma
model Terms {
  id        String    @id @default(uuid())
  type      TermsType
  title     String
  slug      String    @unique
  isActive  Boolean   @default(true)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  // Relations
  versions   TermsVersion[]
  spaces     Space[]
  agreements TermsAgreement[]
  settingsAsCancellation Settings[] @relation("CancellationPolicy")

  @@index([type, isActive])
  @@map("terms")
}
```

**Step 2: migration を実行**

```bash
bunx --bun prisma migrate dev --name remove_terms_site_wide_and_seo_fields
```

Expected: migration SQL が生成され適用される（DROP COLUMN 6本 + DROP INDEX 1本）

**Step 3: Prisma client を再生成（migration が自動実行するが念のため確認）**

```bash
bun run db:generate
```

Expected: `src/shared/generated/` が更新される

**Step 4: 型チェック実行**

```bash
bun run type-check
```

Expected: Terms.isSiteWide / metaDescription 等を参照しているファイルで型エラーが出る（次タスクで修正）

**Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/shared/generated/
git commit -m "feat(terms): remove isSiteWide and SEO fields from Terms model"
```

---

## Task 2: コード削除 — SEO 関連 Actions・バリデーション・コンポーネント

**Files:**

- Delete: `src/app/(admin)/admin/(dashboard)/terms/_components/TermsSeoForm.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts`（L676-750 削除）
- Modify: `src/shared/lib/validations/terms.ts`（L99-124 削除）

**Step 1: TermsSeoForm.tsx を削除**

```bash
git rm "src/app/(admin)/admin/(dashboard)/terms/_components/TermsSeoForm.tsx"
```

**Step 2: actions/terms.ts から SEO 関連コードを削除**

`src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts` の以下を削除:

- L675-676: `// ===... Site-Wide Terms SEO Management` セクションコメント
- L679-703: `getSiteWideTermsSeo` 関数全体
- L705-750: `updateSiteWideTermsSeo` 関数全体

また、import の `UpdateTermsSeoInput` も不要になるので削除:

```typescript
// 削除
import type { ..., UpdateTermsSeoInput } from "@/shared/lib/validations/terms";
// ↓ UpdateTermsSeoInput のみを削除（他の型は残す）
```

`updateTermsSeoSchema` の import も削除:

```typescript
// 削除
import { ..., updateTermsSeoSchema, ... } from "@/shared/lib/validations/terms";
```

**Step 3: validations/terms.ts から SEO スキーマ・型を削除**

`src/shared/lib/validations/terms.ts` の以下を削除:

- L98-112: `updateTermsSeoSchema` 定義 + `export type UpdateTermsSeoInput`
- L114-124: `SiteWideTermsSeo` interface

（`recordTermsAgreementSchema` 等は残す）

**Step 4: 型チェック実行**

```bash
bun run type-check
```

Expected: terms/page.tsx での import エラー（次タスクで修正）

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(terms): remove TermsSeoForm and site-wide SEO actions"
```

---

## Task 3: terms/page.tsx — メタ情報タブ削除・シンプル化

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/terms/page.tsx`
- Modify: `src/shared/lib/nuqs/parsers.ts`（adminTermsTabs から "meta" を削除）

**Step 1: parsers.ts の adminTermsTabs を変更**

`src/shared/lib/nuqs/parsers.ts` の Line 325:

```typescript
// Before
const adminTermsTabs = ["list", "meta"] as const;

// After
const adminTermsTabs = ["list"] as const;
```

（`adminTermsSearchParamsCache` の `tab` デフォルト値 `"list"` はそのまま）

**Step 2: terms/page.tsx を書き直す**

タブ構成を廃止し、シンプルな一覧ページに変更。`getSiteWideTermsSeo`・`TermsSeoForm`・タブ関連の import をすべて削除し、以下の構成にする:

```typescript
import { Suspense } from "react";
import Link from "next/link";
import { getTermsList } from "@/admin/actions/terms";
import { TermsList } from "./_components/TermsList";
import { Button } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "利用規約管理 | Myrrh Rental Space",
};

async function TermsListContent() {
  const result = await getTermsList();
  if (!result.success) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-destructive">{result.error}</p>
      </div>
    );
  }
  return <TermsList terms={result.data ?? []} />;
}

export default async function TermsPage() {
  await connection();
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            利用規約管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            スペースに紐づける利用規約を管理します。バージョン管理により変更履歴を追跡できます。
          </p>
        </div>
        <Button asChild className="min-h-10 sm:min-h-9">
          <Link href="/admin/terms/new">規約を追加</Link>
        </Button>
      </div>
      <Suspense fallback={<LoadingState />}>
        <TermsListContent />
      </Suspense>
    </div>
  );
}
```

**Step 3: 型チェック実行**

```bash
bun run type-check
```

Expected: PASS（searchParams 関連の型エラーがなくなる）

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(terms): remove meta info tab from terms list page"
```

---

## Task 4: createTermsVersion に DRAFT 1本制約を追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts`（createTermsVersion 関数）

**Step 1: createTermsVersion に重複チェックを追加**

`src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts` の `createTermsVersion` 関数（L450-501）内、バリデーション後かつ DB 操作前に以下を追加:

```typescript
// バリデーション直後（L463の後）
const existingDraft = await prisma.termsVersion.findFirst({
  where: {
    termsId: validation.data.termsId,
    status: TermsStatus.DRAFT,
  },
  select: { id: true },
});

if (existingDraft) {
  return createFailure(
    "下書きが既に存在します。先に公開または削除してください。",
  );
}
```

完成後の `createTermsVersion` の流れ:

1. `validation = createTermsVersionSchema.safeParse(input)` — バリデーション
2. 既存 DRAFT チェック（新規追加）
3. `[latestVersion, contentHtml] = await Promise.all([...])` — 最新バージョン番号・HTML変換
4. `prisma.termsVersion.create(...)` — 作成

**Step 2: 型チェック実行**

```bash
bun run type-check
```

Expected: PASS

**Step 3: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts"
git commit -m "feat(terms): enforce single DRAFT constraint in createTermsVersion"
```

---

## Task 5: TermsInlineEditor — サイドパネル整理・DRAFT 制約の UI 反映

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/terms/_components/TermsInlineEditor.tsx`

**変更内容:**

1. **状態バッジを大きく**: `Badge` の variant そのまま、状態テキストを明確化
2. **「新しいバージョンを作成」ボタン**: DRAFT 既存時に `disabled` + tooltip

**Step 1: localVersions に DRAFT 存在チェックを追加**

コンポーネント内の computed value セクション（`selectedVersionContent` 定義付近）に:

```typescript
const hasDraftVersion = localVersions.some(
  (v) => v.status === TermsStatus.DRAFT,
);
```

**Step 2: 「新しいバージョンを作成」ボタンの disabled 条件を更新**

現在（L754-764）:

```tsx
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
```

変更後:

```tsx
<Button
  type="button"
  size="sm"
  variant="outline"
  onClick={handleCreateNewVersion}
  disabled={isPending || isLoadingVersion || hasDraftVersion}
  className="w-full"
  title={hasDraftVersion ? "下書きを先に公開または削除してください" : undefined}
>
  新しいバージョンを作成
</Button>
```

**Step 3: ARCHIVED バージョン選択時にアクションボタンなし表示**

ARCHIVED 時の表示（PUBLISHED 旧版のアクションブロックの後に追加）:

現在 L738-752 に PUBLISHED 旧版の「アーカイブ」ボタンがある。その後に ARCHIVED 用の表示がない。
以下を追加（PUBLISHED 旧版ブロックの `)}` の後）:

```tsx
{
  selectedVersionContent?.status === TermsStatus.ARCHIVED && (
    <p className="text-xs text-muted-foreground">アーカイブ済み（参照のみ）</p>
  );
}
```

**Step 4: 型チェック実行**

```bash
bun run type-check
```

Expected: PASS

**Step 5: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/terms/_components/TermsInlineEditor.tsx"
git commit -m "feat(terms): enforce single DRAFT in UI and add ARCHIVED label"
```

---

## Task 6: getTermsAgreements Server Action を作成

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts`（末尾に追加）

**Step 1: TermsAgreementItem 型を validations/terms.ts に追加**

`src/shared/lib/validations/terms.ts` の末尾に追加:

```typescript
/**
 * 管理画面での同意記録表示用（シリアライズ済み）
 */
export interface TermsAgreementItem {
  id: string;
  agreedAt: string; // ISO 8601
  version: number;
  guestName: string | null;
  guestEmail: string | null;
  userName: string | null;
  userEmail: string | null;
  reservationId: string | null;
  ipAddress: string | null; // 末尾マスク済み
}
```

**Step 2: IPアドレスマスク関数を追加（actions/terms.ts の先頭 import 付近のローカル関数として）**

`src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts` の末尾（関数定義の前、ローカルヘルパーとして）に追加:

```typescript
// IPアドレスの末尾をマスク（例: 192.168.1.*** ）
function maskIpAddress(ip: string | null): string | null {
  if (!ip) return null;
  const lastDot = ip.lastIndexOf(".");
  if (lastDot === -1) return ip; // IPv6等は未対応→そのまま返す
  return `${ip.slice(0, lastDot + 1)}***`;
}
```

**Step 3: getTermsAgreements 関数を追加**

`src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts` の末尾に追加:

```typescript
// =============================================================================
// Terms Agreement Viewer
// =============================================================================

const AGREEMENTS_PER_PAGE = 20;

/**
 * 同意記録一覧を取得（管理画面閲覧用）
 */
export const getTermsAgreements = withPermission<
  [string, number],
  { agreements: TermsAgreementItem[]; total: number }
>("terms", "read", { audit: false })(async (
  _user,
  termsId,
  page,
): Promise<ActionResult<{ agreements: TermsAgreementItem[]; total: number }>> => {
  const skip = (page - 1) * AGREEMENTS_PER_PAGE;

  const [rawAgreements, total] = await Promise.all([
    prisma.termsAgreement.findMany({
      where: { termsId },
      orderBy: { agreedAt: "desc" },
      skip,
      take: AGREEMENTS_PER_PAGE,
      select: {
        id: true,
        agreedAt: true,
        guestName: true,
        guestEmail: true,
        reservationId: true,
        ipAddress: true,
        version: {
          select: { version: true },
        },
        user: {
          select: { name: true, email: true },
        },
      },
    }),
    prisma.termsAgreement.count({ where: { termsId } }),
  ]);

  const agreements: TermsAgreementItem[] = rawAgreements.map((a) => ({
    id: a.id,
    agreedAt: a.agreedAt.toISOString(),
    version: a.version.version,
    guestName: a.guestName,
    guestEmail: a.guestEmail,
    userName: a.user?.name ?? null,
    userEmail: a.user?.email ?? null,
    reservationId: a.reservationId,
    ipAddress: maskIpAddress(a.ipAddress),
  }));

  return createSuccess("同意記録を取得しました", { agreements, total });
});
```

**Step 4: import に TermsAgreementItem を追加**

`src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts` の import に `TermsAgreementItem` を追加:

```typescript
import type {
  // ... 既存の型
  TermsAgreementItem,
} from "@/shared/lib/validations/terms";
```

**Step 5: 型チェック実行**

```bash
bun run type-check
```

Expected: PASS（Prisma の TermsAgreement に user リレーションがあることを確認）

**Step 6: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts" "src/shared/lib/validations/terms.ts"
git commit -m "feat(terms): add getTermsAgreements server action"
```

---

## Task 7: TermsAgreementsTab コンポーネントを新規作成

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/terms/[id]/edit/_components/TermsAgreementsTab.tsx`

**Step 1: TermsAgreementsTab.tsx を作成**

```typescript
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { getTermsAgreements } from "@/admin/actions/terms";
import type { TermsAgreementItem } from "@/shared/lib/validations/terms";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { Button } from "@/admin/components/ui";
import { toast } from "sonner";

const PER_PAGE = 20;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  termsId: string;
  initialAgreements: TermsAgreementItem[];
  initialTotal: number;
}

export function TermsAgreementsTab({
  termsId,
  initialAgreements,
  initialTotal,
}: Props) {
  const [agreements, setAgreements] =
    useState<TermsAgreementItem[]>(initialAgreements);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.ceil(total / PER_PAGE);

  const loadPage = (newPage: number) => {
    startTransition(async () => {
      const result = await getTermsAgreements(termsId, newPage);
      if (result.success) {
        setAgreements(result.data.agreements);
        setTotal(result.data.total);
        setPage(newPage);
      } else {
        toast.error(result.error);
      }
    });
  };

  if (total === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-muted-foreground">同意記録がありません。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">全 {total} 件</p>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>日時</TableHead>
              <TableHead>バージョン</TableHead>
              <TableHead>名前</TableHead>
              <TableHead>メール</TableHead>
              <TableHead>予約</TableHead>
              <TableHead>IPアドレス</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agreements.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatDateTime(a.agreedAt)}
                </TableCell>
                <TableCell className="text-sm">
                  v{a.version}
                </TableCell>
                <TableCell className="text-sm">
                  {a.guestName ?? a.userName ?? "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {a.guestEmail ?? a.userEmail ?? "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {a.reservationId ? (
                    <Link
                      href={`/admin/reservations/${a.reservationId}`}
                      className="underline hover:no-underline"
                    >
                      {a.reservationId.slice(0, 8)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-sm font-mono">
                  {a.ipAddress ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <nav aria-label="ページネーション" className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadPage(page - 1)}
            disabled={page <= 1 || isPending}
          >
            前へ
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadPage(page + 1)}
            disabled={page >= totalPages || isPending}
          >
            次へ
          </Button>
        </nav>
      )}
    </div>
  );
}
```

**Step 2: 型チェック実行**

```bash
bun run type-check
```

Expected: PASS

**Step 3: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/terms/[id]/edit/_components/TermsAgreementsTab.tsx"
git commit -m "feat(terms): add TermsAgreementsTab component"
```

---

## Task 8: edit/page.tsx をタブ付きレイアウトに変更

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/terms/[id]/edit/page.tsx`
- (New directory: `src/app/(admin)/admin/(dashboard)/terms/[id]/edit/_components/` は Task 7 で作成済み)

**Step 1: edit/page.tsx を書き直す**

`src/app/(admin)/admin/(dashboard)/terms/[id]/edit/page.tsx` を以下に変更:

```typescript
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getTermsById, getTermsVersionById, getTermsAgreements } from "@/admin/actions/terms";
import { TermsInlineEditor } from "../../_components/TermsInlineEditor";
import { TermsAgreementsTab } from "./_components/TermsAgreementsTab";
import { TermsStatus } from "@/shared/generated/prisma/enums";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/admin/components/ui";

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
    if (versionResult.success && versionResult.data) {
      initialVersion = versionResult.data;
    }
  }

  // 同意記録の初期データを取得
  const agreementsResult = await getTermsAgreements(id, 1);
  const initialAgreements = agreementsResult.success
    ? agreementsResult.data.agreements
    : [];
  const initialTotal = agreementsResult.success
    ? agreementsResult.data.total
    : 0;

  return (
    <Tabs defaultValue="edit" className="h-full">
      <div className="border-b px-4 sm:px-6">
        <TabsList className="h-12 bg-transparent p-0 gap-0">
          <TabsTrigger
            value="edit"
            className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4"
          >
            編集
          </TabsTrigger>
          <TabsTrigger
            value="agreements"
            className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4"
          >
            同意記録
            {initialTotal > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                {initialTotal}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="edit" forceMount className="mt-0 data-[state=inactive]:hidden">
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
      </TabsContent>

      <TabsContent value="agreements" forceMount className="mt-0 p-4 sm:p-6 data-[state=inactive]:hidden">
        <TermsAgreementsTab
          termsId={id}
          initialAgreements={initialAgreements}
          initialTotal={initialTotal}
        />
      </TabsContent>
    </Tabs>
  );
}
```

**Step 2: 型チェック・Lint 実行**

```bash
bun run validate
```

Expected: PASS

**Step 3: ビルド確認**

```bash
bun run build
```

Expected: PASS

**Step 4: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/terms/[id]/edit/page.tsx"
git commit -m "feat(terms): add agreements tab to terms edit page"
```

---

## Task 9: 最終検証・動作確認

**Step 1: 全テスト実行**

```bash
bun run validate && bun run build
```

Expected: type-check・lint・build がすべて PASS

**Step 2: 手動動作確認チェックリスト**

- [ ] `/admin/terms` — メタ情報タブが消えて一覧のみ表示される
- [ ] `/admin/terms/new` — 新規作成が正常動作する
- [ ] `/admin/terms/[id]/edit` — 「編集」「同意記録」タブが表示される
- [ ] 同意記録タブ — 件数バッジが表示される（記録がある場合）
- [ ] DRAFT 作成後 — サイドパネルで「新しいバージョンを作成」が disabled になる
- [ ] ARCHIVED バージョン選択時 — 「アーカイブ済み（参照のみ）」テキストが表示される
- [ ] DRAFT が存在する状態で `createTermsVersion` を呼ぶとエラーが返る

**Step 3: 設計ドキュメントをステータス更新**

`docs/plans/2026-02-22-terms-redesign-design.md` の先頭:

```markdown
**ステータス**: 完了
```

**Step 4: docs/plans/README.md を更新**

該当エントリに `✅` を付ける。
