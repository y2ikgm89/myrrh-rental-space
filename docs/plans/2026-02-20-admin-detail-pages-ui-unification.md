# Admin 詳細・編集ページ UI 統一 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 管理画面の全詳細・編集ページを統一された UI/UX パターン（AdminDetailLayout + DetailSection + DetailField）に完全刷新する。connection() バグ修正・generateMetadata 統一・ボタン variant ルール適用を含む破壊的変更。

**Architecture:** 4つの共有コンポーネント（AdminDetailLayout, DetailSection, DetailField, DangerZone）を全詳細・編集ページに統一適用。特殊インラインエディタ（PostEditor/NewsEditor/SpaceInlineEditor/SectionEditor）は InlineEditorShell を使うため AdminDetailLayout 対象外（connection() バグのみ修正）。

**Tech Stack:** Next.js 16 PPR (`connection()` from `next/server`), React 19, TypeScript 6 strict, Prisma 7 enum constants, shadcn/ui

---

## 共有コンポーネント仕様（変更なし・参照のみ）

```
@/admin/components/AdminDetailLayout  — 詳細・編集ページヘッダー統一
@/admin/components/DetailSection      — Card+CardHeader(text-base font-semibold)+CardContent
@/admin/components/DetailField        — dt/dd ラベル+値ペア (value: ReactNode)
@/admin/components/DangerZone         — 削除確認（onDelete は .bind(null, id) で渡す）
```

**Button variant ルール:**

- 編集ボタン（primary action） = `<Button asChild>` (variant なし = primary blue)
- 外部リンク・secondary action = `variant="outline"`

**connection() ルール:**

- `export async function Page()` と `export async function generateMetadata()` それぞれで 1 回のみ
- 同一関数内での複数呼び出し禁止

---

## Task 1: connection() 重複バグ修正（5ファイル）

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/posts/[id]/page.tsx:34`
- Modify: `src/app/(admin)/admin/(dashboard)/news/[id]/page.tsx:34`
- Modify: `src/app/(admin)/admin/(dashboard)/spaces/[id]/edit/page.tsx:35`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/page.tsx:43`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/homepage/edit/page.tsx:24`

**Step 1: posts/[id]/page.tsx の重複削除**

```diff
 export default async function EditPostPage({ params }: PageProps) {
-  await connection();
-  await connection()
+  await connection()
   const { id } = await params
```

**Step 2: news/[id]/page.tsx の重複削除**

```diff
 export default async function EditNewsPage({ params }: PageProps) {
-  await connection();
-  await connection()
+  await connection()
   const { id } = await params
```

**Step 3: spaces/[id]/edit/page.tsx の重複削除**

```diff
 export default async function EditSpacePage({ params }: PageProps) {
-  await connection();
-  await connection()
+  await connection()
   const { id } = await params
```

**Step 4: pages/[slug]/edit/page.tsx の重複削除**

```diff
 export default async function EditPagePage({ params }: PageProps): Promise<ReactElement> {
-  await connection();
-  await connection()
+  await connection()
   const { slug } = await params
```

**Step 5: pages/homepage/edit/page.tsx の重複削除**

`connection()` が 2 回呼ばれている（24 行目と 26 行目）。コメント付きの 2 回目を残して最初の呼び出しを削除:

```diff
 export default async function HomepageEditPage(): Promise<ReactElement> {
-  await connection();
-  // ensureHomepageSections/ensureSystemPage は uncached DB 呼び出しのため connection() でオプトイン
-  await connection()
+  // ensureHomepageSections/ensureSystemPage は uncached DB 呼び出しのため connection() でオプトイン
+  await connection()
```

**Step 6: 検証**

```bash
bun run validate
```

Expected: 型エラーなし、lint エラーなし

**Step 7: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/posts/\[id\]/page.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/news/\[id\]/page.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/spaces/\[id\]/edit/page.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/pages/\[slug\]/edit/page.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/pages/homepage/edit/page.tsx
git commit -m "fix(admin): remove duplicate connection() calls in inline editor pages"
```

---

## Task 2: customers/[id]/edit generateMetadata に connection() 追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/customers/[id]/edit/page.tsx:12-22`

**現状の問題:**

```tsx
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  // ← connection() がない！DB アクセス前に PPR opt-in が必要
  const { id } = await params;
  const customer = await getCustomerById(id);
```

**Step 1: generateMetadata に connection() を追加**

```diff
 export async function generateMetadata({
   params,
 }: PageProps): Promise<Metadata> {
+  await connection();
   const { id } = await params;
   const customer = await getCustomerById(id);
```

`connection` は既にファイル内で import されているため、import 追加は不要。

**Step 2: 検証**

```bash
bun run validate
```

**Step 3: コミット**

```bash
git commit -m "fix(admin): add connection() to customers/edit generateMetadata for PPR"
```

---

## Task 3: terms/[id]/page.tsx — generateMetadata + AdminDetailLayout

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/terms/[id]/page.tsx`

**現状の問題:**

- `export const metadata` (静的タイトル) → `generateMetadata` (動的タイトル)
- 手動ヘッダー (`ArrowLeft Button + h1`) → `AdminDetailLayout`

**Step 1: ファイル全体を以下に置き換え**

```tsx
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTermsById } from "@/admin/actions/terms";
import { getSettings } from "@/admin/actions/settings";
import { TermsDetailView } from "../_components/TermsDetailView";
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
    return { title: "規約詳細 | Myrrh Rental Space" };
  }
  return {
    title: `${result.data.title} | 規約管理 | Myrrh Rental Space`,
  };
}

export default async function TermsDetailPage({ params }: PageProps) {
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

  const businessInfo: BusinessInfo = settings
    ? {
        businessName: settings.businessName,
        email: settings.email,
        phoneNumber: settings.phoneNumber,
        postalCode: settings.postalCode,
        prefecture: settings.prefecture,
        city: settings.city,
        streetAddress: settings.streetAddress,
        buildingName: settings.buildingName,
      }
    : {
        businessName: null,
        email: null,
        phoneNumber: null,
        postalCode: null,
        prefecture: null,
        city: null,
        streetAddress: null,
        buildingName: null,
      };

  return (
    <AdminDetailLayout
      backHref="/admin/terms"
      title={terms.title}
      subtitle="規約の編集とバージョン管理"
    >
      <TermsDetailView terms={terms} businessInfo={businessInfo} />
    </AdminDetailLayout>
  );
}
```

**Step 2: 検証**

```bash
bun run validate
```

**Step 3: コミット**

```bash
git commit -m "refactor(admin): unify terms detail page with AdminDetailLayout + generateMetadata"
```

---

## Task 4: terms/[id]/versions/[versionId]/page.tsx — generateMetadata + AdminDetailLayout

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/terms/[id]/versions/[versionId]/page.tsx`

**現状の問題:**

- `export const metadata` (静的タイトル) → `generateMetadata` (動的タイトル)
- 手動ヘッダー + Breadcrumb → AdminDetailLayout (Breadcrumb は children 内に保持)
- 編集ボタンが CardHeader 内 → AdminDetailLayout `actions` へ移動

**Step 1: ファイル全体を以下に置き換え**

```tsx
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { getTermsById, getTermsVersionById } from "@/admin/actions/terms";
import { SanitizedHtml } from "@/admin/components/SanitizedHtml";
import { PROSE_CLASSES } from "@/shared/lib/styles/prose";
import { cn } from "@/shared/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  Breadcrumb,
} from "@/admin/components/ui";
import Link from "next/link";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ id: string; versionId: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();
  const { id, versionId } = await params;
  const [termsResult, versionResult] = await Promise.all([
    getTermsById(id),
    getTermsVersionById(versionId),
  ]);

  if (
    !termsResult.success ||
    !termsResult.data ||
    !versionResult.success ||
    !versionResult.data
  ) {
    return { title: "バージョンプレビュー | Myrrh Rental Space" };
  }

  return {
    title: `${termsResult.data.title} v${versionResult.data.version} | 規約管理 | Myrrh Rental Space`,
  };
}

export default async function VersionPreviewPage({ params }: PageProps) {
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

  const terms = termsResult.data;
  const version = versionResult.data;

  const getStatusBadge = () => {
    if (version.isCurrentVersion) {
      return <Badge className="bg-success">現在のバージョン</Badge>;
    }

    switch (version.status) {
      case "DRAFT":
        return <Badge variant="outline">下書き</Badge>;
      case "PUBLISHED":
        return <Badge variant="secondary">公開済み</Badge>;
      case "ARCHIVED":
        return (
          <Badge variant="secondary" className="opacity-60">
            アーカイブ
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <AdminDetailLayout
      backHref={`/admin/terms/${id}`}
      backLabel="詳細に戻る"
      title={`バージョン ${version.version} プレビュー`}
      subtitle={terms.title}
      actions={
        version.status === "DRAFT" ? (
          <Button variant="outline" asChild>
            <Link href={`/admin/terms/${id}/versions/${versionId}/edit`}>
              編集
            </Link>
          </Button>
        ) : undefined
      }
    >
      <Breadcrumb
        items={[
          { label: "利用規約", href: "/admin/terms" },
          { label: terms.title, href: `/admin/terms/${id}` },
          { label: `バージョン ${version.version}` },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            バージョン {version.version}
            {getStatusBadge()}
          </CardTitle>
          <CardDescription>
            作成:{" "}
            {formatDistanceToNow(new Date(version.createdAt), {
              addSuffix: true,
              locale: ja,
            })}
            {version.publishedAt && (
              <>
                {" "}
                · 公開:{" "}
                {formatDistanceToNow(new Date(version.publishedAt), {
                  addSuffix: true,
                  locale: ja,
                })}
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg p-6 bg-card">
            <SanitizedHtml
              html={version.contentHtml}
              className={cn(PROSE_CLASSES, "prose-sm max-w-none")}
            />
          </div>
        </CardContent>
      </Card>
    </AdminDetailLayout>
  );
}
```

**Step 2: 検証**

```bash
bun run validate
```

**Step 3: コミット**

```bash
git commit -m "refactor(admin): unify terms version preview with AdminDetailLayout + generateMetadata"
```

---

## Task 5: staff/[id]/page.tsx — generateMetadata + RoleBadge + DetailSection/DetailField

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/staff/[id]/page.tsx`

**現状の問題:**

- `export const metadata` (静的) → `generateMetadata` (動的)
- `RoleBadge` が `"ADMIN"` / `"USER"` 文字列リテラル → `Role.ADMIN` / `Role.USER` enum 定数
- `grid-cols-3 dt/dd` → `DetailSection + DetailField`

**Step 1: ファイル全体を以下に置き換え**

```tsx
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { getUser, deleteUser } from "@/admin/actions/user";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
import { DangerZone } from "@/admin/components/DangerZone";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/admin/components/ui/card";
import { Button } from "@/admin/components/ui/button";
import { Badge } from "@/admin/components/ui/badge";
import { formatDate } from "@/shared/lib/utils";
import { Role } from "@/shared/generated/prisma/enums";
import { UserActions } from "../_components/UserActions";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const user = await getUser(id);
  if (!user) {
    return { title: "スタッフ詳細 | 管理画面" };
  }
  return {
    title: `${user.name ?? user.email} | スタッフ管理 | Myrrh Rental Space`,
  };
}

export default async function StaffDetailPage({ params }: Props) {
  await connection();
  const { id } = await params;
  const user = await getUser(id);

  if (!user) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref="/admin/staff"
      title={user.name ?? "(未設定)"}
      subtitle={user.email}
      actions={
        <>
          <Button size="sm" asChild>
            <Link href={`/admin/staff/${user.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              編集
            </Link>
          </Button>
          <UserActions user={user} />
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <DetailSection title="基本情報">
          <div className="space-y-4">
            <DetailField label="名前" value={user.name ?? "(未設定)"} />
            <DetailField label="メールアドレス" value={user.email} />
            <DetailField
              label="ロール"
              value={<RoleBadge role={user.role} />}
            />
            <DetailField
              label="メール認証"
              value={
                user.emailVerified ? (
                  <Badge variant="default">認証済み</Badge>
                ) : (
                  <Badge variant="secondary">未認証</Badge>
                )
              }
            />
          </div>
        </DetailSection>

        <DetailSection title="統計情報">
          <div className="space-y-4">
            <DetailField
              label="予約数"
              value={`${user._count.reservations}件`}
            />
            <DetailField label="投稿数" value={`${user._count.posts}件`} />
            <DetailField
              label="登録日"
              value={formatDate(user.createdAt, true)}
            />
            <DetailField
              label="最終更新"
              value={formatDate(user.updatedAt, true)}
            />
          </div>
        </DetailSection>
      </div>

      {user._count.reservations > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">関連予約</CardTitle>
            <CardDescription>
              このスタッフに関連付けられた予約があります
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href={`/admin/reservations?userId=${user.id}`}>
                予約一覧を表示
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {user._count.posts > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">投稿</CardTitle>
            <CardDescription>
              このスタッフが作成した投稿があります
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href={`/admin/posts?authorId=${user.id}`}>
                記事一覧を表示
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <DangerZone
        deleteLabel="スタッフを削除"
        itemName={user.name ?? user.email}
        onDelete={deleteUser.bind(null, user.id)}
        redirectTo="/admin/staff"
      />
    </AdminDetailLayout>
  );
}

function RoleBadge({ role }: { role: Role }) {
  switch (role) {
    case Role.ADMIN:
      return <Badge variant="default">管理者</Badge>;
    case Role.USER:
      return <Badge variant="secondary">スタッフ</Badge>;
    default:
      return <Badge variant="outline">{role}</Badge>;
  }
}
```

**Step 2: 検証**

```bash
bun run validate
```

**Step 3: コミット**

```bash
git commit -m "refactor(admin): staff detail — generateMetadata + DetailField + Role enum constants"
```

---

## Task 6: staff/[id]/edit/page.tsx — generateMetadata + DetailSection

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/staff/[id]/edit/page.tsx`

**現状の問題:**

- `export const metadata` (静的) → `generateMetadata` (動的)
- `Card+CardHeader+CardContent` wrapping UserForm → `DetailSection`

**Step 1: ファイル全体を以下に置き換え**

```tsx
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getUser } from "@/admin/actions/user";
import { UserForm } from "../../_components/UserForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailSection } from "@/admin/components/DetailSection";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const user = await getUser(id);
  if (!user) {
    return { title: "スタッフ編集 | 管理画面" };
  }
  return {
    title: `${user.name ?? user.email} 編集 | スタッフ管理 | Myrrh Rental Space`,
  };
}

export default async function EditStaffPage({ params }: Props) {
  await connection();
  const { id } = await params;
  const user = await getUser(id);

  if (!user) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref={`/admin/staff/${user.id}`}
      backLabel="詳細に戻る"
      title="スタッフ情報を編集"
      subtitle={user.email}
    >
      <DetailSection
        title="スタッフ情報"
        description="スタッフ情報を編集します。パスワードを変更しない場合は空欄のままにしてください。"
      >
        <UserForm mode="edit" user={user} />
      </DetailSection>
    </AdminDetailLayout>
  );
}
```

**Step 2: 検証**

```bash
bun run validate
```

**Step 3: コミット**

```bash
git commit -m "refactor(admin): staff edit — generateMetadata + DetailSection"
```

---

## Task 7: faq/categories/[id]/edit/page.tsx — generateMetadata

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/faq/categories/[id]/edit/page.tsx`

**現状の問題:**

- `export const metadata` (静的) → `generateMetadata` (動的、カテゴリ名を含む)

**Step 1: ファイル全体を以下に置き換え**

```tsx
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { getFaqCategoryById } from "@/admin/actions/faq";
import { FaqCategoryForm } from "../../../_components/FaqCategoryForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const category = await getFaqCategoryById(id);
  if (!category) {
    return { title: "カテゴリ編集 | FAQ管理 | Myrrh Rental Space" };
  }
  return {
    title: `${category.name} 編集 | FAQ管理 | Myrrh Rental Space`,
  };
}

export default async function EditFaqCategoryPage({ params }: PageProps) {
  await connection();
  const { id } = await params;
  const category = await getFaqCategoryById(id);

  if (!category) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref="/admin/faq"
      title="カテゴリ編集"
      subtitle={`「${category.name}」を編集します`}
    >
      <FaqCategoryForm category={category} mode="edit" />
    </AdminDetailLayout>
  );
}
```

**Step 2: 検証**

```bash
bun run validate
```

**Step 3: コミット**

```bash
git commit -m "refactor(admin): faq category edit — generateMetadata with dynamic category name"
```

---

## Task 8: Button variant + DangerZone itemName 修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/customers/[id]/page.tsx:51`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx:52,61`

**現状の問題:**

- `customers/[id]/page.tsx` の編集ボタンに誤った `variant="outline"` が付いている
- `reservations/[id]/page.tsx` の編集ボタンに誤った `variant="outline"` が付いている
- `reservations/[id]/page.tsx` の `DangerZone` に `itemName` が欠落している

**Step 1: customers/[id]/page.tsx — variant="outline" 削除**

```diff
-        <Button variant="outline" size="sm" asChild>
+        <Button size="sm" asChild>
           <Link href={`/admin/customers/${customer.id}/edit`}>
```

**Step 2: reservations/[id]/page.tsx — variant="outline" 削除 + DangerZone itemName 追加**

```diff
-        <Button variant="outline" size="sm" asChild>
+        <Button size="sm" asChild>
           <Link href={`/admin/reservations/${id}/edit`}>
```

```diff
       <DangerZone
         deleteLabel="予約を削除"
+        itemName={`${reservation.customer.lastName}${reservation.customer.firstName} 様の予約`}
         onDelete={deleteReservation.bind(null, reservation.id)}
         redirectTo="/admin/reservations"
       />
```

**Step 3: 検証**

```bash
bun run validate
```

**Step 4: コミット**

```bash
git commit -m "fix(admin): correct edit button variant and add DangerZone itemName for reservations"
```

---

## Task 9: ReservationDetail.tsx — DetailField 統一

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx`

**現状の問題:**

- `<div><div className="text-sm text-muted-foreground">...<div className="font-medium">...` パターン → `DetailField`
- `Card+CardHeader+CardTitle+CardContent` → `DetailSection`（読み取り専用セクションのみ）
- インタラクティブセクション（ステータス変更、メモ）は Card のまま維持

**Step 1: import 追加**

```diff
 import {
   Card,
   CardContent,
   CardHeader,
   CardTitle,
   Button,
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
   Input,
 } from "@/admin/components/ui";
+import { DetailSection } from "@/admin/components/DetailSection";
+import { DetailField } from "@/admin/components/DetailField";
```

**Step 2: 「予約情報」Card を DetailSection + DetailField に置き換え**

```diff
-      {/* 予約情報 */}
-      <Card>
-        <CardHeader>
-          <CardTitle>予約情報</CardTitle>
-        </CardHeader>
-        <CardContent className="space-y-4">
-          <div className="grid gap-4 sm:grid-cols-2">
-            <div>
-              <div className="text-sm text-muted-foreground">スペース</div>
-              <div className="font-medium">{reservation.space.name}</div>
-            </div>
-            <div>
-              <div className="text-sm text-muted-foreground">料金</div>
-              <div className="font-medium">
-                {formatPrice(reservation.totalPrice)}
-              </div>
-            </div>
-            <div>
-              <div className="text-sm text-muted-foreground">開始日時</div>
-              <div className="font-medium">
-                {formatDateTimeFull(reservation.startTime)}
-              </div>
-            </div>
-            <div>
-              <div className="text-sm text-muted-foreground">終了日時</div>
-              <div className="font-medium">
-                {formatDateTimeFull(reservation.endTime)}
-              </div>
-            </div>
-            <div>
-              <div className="text-sm text-muted-foreground">作成日時</div>
-              <div className="font-medium">
-                {formatDateTimeFull(reservation.createdAt)}
-              </div>
-            </div>
-            <div>
-              <div className="text-sm text-muted-foreground">更新日時</div>
-              <div className="font-medium">
-                {formatDateTimeFull(reservation.updatedAt)}
-              </div>
-            </div>
-          </div>
-        </CardContent>
-      </Card>
+      {/* 予約情報 */}
+      <DetailSection title="予約情報">
+        <div className="grid gap-4 sm:grid-cols-2">
+          <DetailField label="スペース" value={reservation.space.name} />
+          <DetailField label="料金" value={formatPrice(reservation.totalPrice)} />
+          <DetailField label="開始日時" value={formatDateTimeFull(reservation.startTime)} />
+          <DetailField label="終了日時" value={formatDateTimeFull(reservation.endTime)} />
+          <DetailField label="作成日時" value={formatDateTimeFull(reservation.createdAt)} />
+          <DetailField label="更新日時" value={formatDateTimeFull(reservation.updatedAt)} />
+        </div>
+      </DetailSection>
```

**Step 3: 「顧客情報」Card を DetailSection + DetailField に置き換え**

```diff
-      {/* 顧客情報 */}
-      <Card>
-        <CardHeader>
-          <CardTitle>顧客情報</CardTitle>
-        </CardHeader>
-        <CardContent className="space-y-4">
-          <div className="grid gap-4 sm:grid-cols-2">
-            <div>
-              <div className="text-sm text-muted-foreground">氏名</div>
-              <div className="font-medium">
-                {reservation.customer.lastName} {reservation.customer.firstName}
-              </div>
-            </div>
-            <div>
-              <div className="text-sm text-muted-foreground">
-                メールアドレス
-              </div>
-              <div className="font-medium">{reservation.customer.email}</div>
-            </div>
-            <div>
-              <div className="text-sm text-muted-foreground">電話番号</div>
-              <div className="font-medium">
-                {reservation.customer.phoneNumber || "-"}
-              </div>
-            </div>
-          </div>
-        </CardContent>
-      </Card>
+      {/* 顧客情報 */}
+      <DetailSection title="顧客情報">
+        <div className="grid gap-4 sm:grid-cols-2">
+          <DetailField
+            label="氏名"
+            value={`${reservation.customer.lastName} ${reservation.customer.firstName}`}
+          />
+          <DetailField label="メールアドレス" value={reservation.customer.email} />
+          <DetailField label="電話番号" value={reservation.customer.phoneNumber} />
+        </div>
+      </DetailSection>
```

**Step 4: 「ステータス」「メモ」は Card のまま維持（インタラクティブ UI）**

これらは変更なし（Select, Input, Button を含むため）。

**Step 5: 使われなくなった import を削除**

`Card`, `CardHeader`, `CardTitle` は「ステータス」「メモ」で引き続き使用されるため削除しない。

**Step 6: 検証**

```bash
bun run validate
```

**Step 7: コミット**

```bash
git commit -m "refactor(admin): ReservationDetail — standardize read-only fields with DetailField"
```

---

## Task 10: LocationDetail.tsx — DetailField 統一

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/locations/[id]/_components/LocationDetail.tsx`

**現状の問題:**

- `<div><div className="text-sm text-muted-foreground">...<div className="font-medium">...` パターン → `DetailField`
- 「基本情報」「メタ情報」Card → `DetailSection`

**Step 1: import 追加**

```diff
 import {
   Card,
   CardContent,
   CardHeader,
   CardTitle,
   Badge,
   Switch,
 } from "@/admin/components/ui";
+import { DetailSection } from "@/admin/components/DetailSection";
+import { DetailField } from "@/admin/components/DetailField";
```

**Step 2: 「基本情報」Card を DetailSection + DetailField に置き換え**

```diff
-      {/* 基本情報 */}
-      <Card>
-        <CardHeader>
-          <CardTitle>基本情報</CardTitle>
-        </CardHeader>
-        <CardContent className="space-y-4">
-          <div className="grid gap-4 sm:grid-cols-2">
-            <div>
-              <div className="text-sm text-muted-foreground">場所名</div>
-              <div className="font-medium">{location.name}</div>
-            </div>
-            <div>
-              <div className="text-sm text-muted-foreground">スペース数</div>
-              <div className="font-medium">
-                <Badge variant="secondary">{location._count.spaces}件</Badge>
-              </div>
-            </div>
-            {location.description && (
-              <div className="sm:col-span-2">
-                <div className="text-sm text-muted-foreground">説明</div>
-                <div className="whitespace-pre-wrap">
-                  {location.description}
-                </div>
-              </div>
-            )}
-            <div className="sm:col-span-2">
-              <div className="text-sm text-muted-foreground">住所</div>
-              <div className="font-medium">{location.address}</div>
-            </div>
-            {location.access && (
-              <div className="sm:col-span-2">
-                <div className="text-sm text-muted-foreground">アクセス</div>
-                <div className="whitespace-pre-wrap">{location.access}</div>
-              </div>
-            )}
-            <div>
-              <div className="text-sm text-muted-foreground">並び順</div>
-              <div className="font-medium">{location.sortOrder}</div>
-            </div>
-          </div>
-        </CardContent>
-      </Card>
+      {/* 基本情報 */}
+      <DetailSection title="基本情報">
+        <div className="grid gap-4 sm:grid-cols-2">
+          <DetailField label="場所名" value={location.name} />
+          <DetailField
+            label="スペース数"
+            value={<Badge variant="secondary">{location._count.spaces}件</Badge>}
+          />
+          {location.description && (
+            <DetailField
+              label="説明"
+              value={<span className="whitespace-pre-wrap">{location.description}</span>}
+              className="sm:col-span-2"
+            />
+          )}
+          <DetailField label="住所" value={location.address} className="sm:col-span-2" />
+          {location.access && (
+            <DetailField
+              label="アクセス"
+              value={<span className="whitespace-pre-wrap">{location.access}</span>}
+              className="sm:col-span-2"
+            />
+          )}
+          <DetailField label="並び順" value={String(location.sortOrder)} />
+        </div>
+      </DetailSection>
```

**Step 3: 「メタ情報」Card を DetailSection + DetailField に置き換え**

```diff
-      {/* メタ情報 */}
-      <Card>
-        <CardHeader>
-          <CardTitle>メタ情報</CardTitle>
-        </CardHeader>
-        <CardContent>
-          <div className="grid gap-4 sm:grid-cols-2">
-            <div>
-              <div className="text-sm text-muted-foreground">作成日時</div>
-              <div className="font-medium">
-                {formatDateTimeShort(location.createdAt)}
-              </div>
-            </div>
-            <div>
-              <div className="text-sm text-muted-foreground">更新日時</div>
-              <div className="font-medium">
-                {formatDateTimeShort(location.updatedAt)}
-              </div>
-            </div>
-            <div>
-              <div className="text-sm text-muted-foreground">状態</div>
-              <div className="font-medium">
-                <Badge
-                  variant={location.isActive ? "secondary" : "destructive"}
-                >
-                  {location.isActive ? "アクティブ" : "削除済み"}
-                </Badge>
-              </div>
-            </div>
-          </div>
-        </CardContent>
-      </Card>
+      {/* メタ情報 */}
+      <DetailSection title="メタ情報">
+        <div className="grid gap-4 sm:grid-cols-2">
+          <DetailField label="作成日時" value={formatDateTimeShort(location.createdAt)} />
+          <DetailField label="更新日時" value={formatDateTimeShort(location.updatedAt)} />
+          <DetailField
+            label="状態"
+            value={
+              <Badge variant={location.isActive ? "secondary" : "destructive"}>
+                {location.isActive ? "アクティブ" : "削除済み"}
+              </Badge>
+            }
+          />
+        </div>
+      </DetailSection>
```

**Step 4: 「公開状態」「画像」「営業時間」は Card のまま維持**（Switch はインタラクティブ、画像/営業時間はレイアウト都合）

**Step 5: 不要になった import を削除**

`Card`, `CardHeader`, `CardTitle` は引き続き他セクションで使用されるため削除しない。

**Step 6: 検証**

```bash
bun run validate
```

**Step 7: コミット**

```bash
git commit -m "refactor(admin): LocationDetail — standardize read-only fields with DetailField"
```

---

## Task 11: InquiryDetail.tsx — DetailField 統一

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/inquiries/[id]/_components/InquiryDetail.tsx`

**現状の問題:**

- 「送信者情報」カードの `<p>` パターン → `DetailField`

**Step 1: import 追加**

```diff
 import {
   Button,
   Card,
   CardContent,
   CardHeader,
   CardTitle,
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "@/admin/components/ui";
+import { DetailSection } from "@/admin/components/DetailSection";
+import { DetailField } from "@/admin/components/DetailField";
```

**Step 2: 「送信者情報」Card を DetailSection + DetailField に置き換え**

```diff
-        {/* 送信者情報 */}
-        <Card>
-          <CardHeader>
-            <CardTitle>送信者情報</CardTitle>
-          </CardHeader>
-          <CardContent className="space-y-4">
-            <div>
-              <p className="text-sm text-muted-foreground">お名前</p>
-              <p className="font-medium">{inquiry.name}</p>
-            </div>
-            <div>
-              <p className="text-sm text-muted-foreground">メールアドレス</p>
-              <a
-                href={`mailto:${inquiry.email}`}
-                className="text-primary hover:underline"
-              >
-                {inquiry.email}
-              </a>
-            </div>
-          </CardContent>
-        </Card>
+        {/* 送信者情報 */}
+        <DetailSection title="送信者情報">
+          <div className="space-y-4">
+            <DetailField label="お名前" value={inquiry.name} />
+            <DetailField
+              label="メールアドレス"
+              value={
+                <a href={`mailto:${inquiry.email}`} className="text-primary hover:underline">
+                  {inquiry.email}
+                </a>
+              }
+            />
+          </div>
+        </DetailSection>
```

**Step 3: 「件名」「お問い合わせ内容」は既存の Card+CardContent で良いが、CardTitle を text-base font-semibold に統一**

```diff
-          <CardTitle>件名</CardTitle>
+          <CardTitle className="text-base font-semibold">件名</CardTitle>
```

```diff
-          <CardTitle>お問い合わせ内容</CardTitle>
+          <CardTitle className="text-base font-semibold">お問い合わせ内容</CardTitle>
```

**Step 4: 検証**

```bash
bun run validate
```

**Step 5: コミット**

```bash
git commit -m "refactor(admin): InquiryDetail — standardize sender info with DetailField"
```

---

## Task 12: SpaceDetail.tsx — DetailField 統一

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/spaces/[id]/_components/SpaceDetail.tsx`

**現状の問題:**

- 「基本情報」「メタ情報」の `<div>` パターン → `DetailField`
- 「料金」セクションは大きい typography (`text-xl font-bold`) を使うため CustomRender パターンで対応

**Step 1: import 追加**

```diff
 import {
   Card,
   CardContent,
   CardHeader,
   CardTitle,
   Badge,
   Switch,
 } from "@/admin/components/ui";
+import { DetailSection } from "@/admin/components/DetailSection";
+import { DetailField } from "@/admin/components/DetailField";
```

**Step 2: 「基本情報」Card を DetailSection + DetailField に置き換え**

```diff
-      {/* 基本情報 */}
-      <Card>
-        <CardHeader>
-          <CardTitle>基本情報</CardTitle>
-        </CardHeader>
-        <CardContent className="space-y-4">
-          <div className="grid gap-4 sm:grid-cols-2">
-            <div>
-              <div className="text-sm text-muted-foreground">スペース名</div>
-              <div className="font-medium">{space.name}</div>
-            </div>
-            <div>
-              <div className="text-sm text-muted-foreground">予約数</div>
-              <div className="font-medium">
-                <Badge variant="secondary">{space._count.reservations}件</Badge>
-              </div>
-            </div>
-            <div className="sm:col-span-2">
-              <div className="text-sm text-muted-foreground">説明</div>
-              <div className="whitespace-pre-wrap">{space.description}</div>
-            </div>
-            <div>
-              <div className="text-sm text-muted-foreground">住所</div>
-              <div className="font-medium">{space.address}</div>
-            </div>
-            {space.access && (
-              <div>
-                <div className="text-sm text-muted-foreground">アクセス</div>
-                <div className="font-medium">{space.access}</div>
-              </div>
-            )}
-            <div>
-              <div className="text-sm text-muted-foreground">定員</div>
-              <div className="font-medium">{space.capacity}名</div>
-            </div>
-            {space.area && (
-              <div>
-                <div className="text-sm text-muted-foreground">面積</div>
-                <div className="font-medium">{space.area}m²</div>
-              </div>
-            )}
-          </div>
-        </CardContent>
-      </Card>
+      {/* 基本情報 */}
+      <DetailSection title="基本情報">
+        <div className="grid gap-4 sm:grid-cols-2">
+          <DetailField label="スペース名" value={space.name} />
+          <DetailField
+            label="予約数"
+            value={<Badge variant="secondary">{space._count.reservations}件</Badge>}
+          />
+          <DetailField
+            label="説明"
+            value={<span className="whitespace-pre-wrap">{space.description}</span>}
+            className="sm:col-span-2"
+          />
+          <DetailField label="住所" value={space.address} />
+          {space.access && <DetailField label="アクセス" value={space.access} />}
+          <DetailField label="定員" value={`${space.capacity}名`} />
+          {space.area && <DetailField label="面積" value={`${space.area}m²`} />}
+        </div>
+      </DetailSection>
```

**Step 3: 「料金」Card を DetailSection + カスタム値に置き換え**

```diff
-      {/* 料金 */}
-      <Card>
-        <CardHeader>
-          <CardTitle>料金</CardTitle>
-        </CardHeader>
-        <CardContent>
-          <div className="grid gap-4 sm:grid-cols-2">
-            <div>
-              <div className="text-sm text-muted-foreground">時間料金</div>
-              <div className="text-xl font-bold">
-                {formatCurrency(space.hourlyPrice)}
-                <span className="text-sm font-normal text-muted-foreground">
-                  /時間
-                </span>
-              </div>
-            </div>
-            {space.dailyPrice && (
-              <div>
-                <div className="text-sm text-muted-foreground">日額料金</div>
-                <div className="text-xl font-bold">
-                  {formatCurrency(space.dailyPrice)}
-                  <span className="text-sm font-normal text-muted-foreground">
-                    /日
-                  </span>
-                </div>
-              </div>
-            )}
-          </div>
-        </CardContent>
-      </Card>
+      {/* 料金 */}
+      <DetailSection title="料金">
+        <div className="grid gap-4 sm:grid-cols-2">
+          <DetailField
+            label="時間料金"
+            value={
+              <span className="text-xl font-bold">
+                {formatCurrency(space.hourlyPrice)}
+                <span className="text-sm font-normal text-muted-foreground">/時間</span>
+              </span>
+            }
+          />
+          {space.dailyPrice && (
+            <DetailField
+              label="日額料金"
+              value={
+                <span className="text-xl font-bold">
+                  {formatCurrency(space.dailyPrice)}
+                  <span className="text-sm font-normal text-muted-foreground">/日</span>
+                </span>
+              }
+            />
+          )}
+        </div>
+      </DetailSection>
```

**Step 4: 「メタ情報」Card を DetailSection + DetailField に置き換え**

```diff
-      {/* メタ情報 */}
-      <Card>
-        <CardHeader>
-          <CardTitle>メタ情報</CardTitle>
-        </CardHeader>
-        <CardContent>
-          <div className="grid gap-4 sm:grid-cols-2">
-            <div>
-              <div className="text-sm text-muted-foreground">作成日時</div>
-              <div className="font-medium">
-                {formatDateTimeShort(space.createdAt)}
-              </div>
-            </div>
-            <div>
-              <div className="text-sm text-muted-foreground">更新日時</div>
-              <div className="font-medium">
-                {formatDateTimeShort(space.updatedAt)}
-              </div>
-            </div>
-            {space.publishedAt && (
-              <div>
-                <div className="text-sm text-muted-foreground">公開日時</div>
-                <div className="font-medium">
-                  {formatDateTimeShort(space.publishedAt)}
-                </div>
-              </div>
-            )}
-          </div>
-        </CardContent>
-      </Card>
+      {/* メタ情報 */}
+      <DetailSection title="メタ情報">
+        <div className="grid gap-4 sm:grid-cols-2">
+          <DetailField label="作成日時" value={formatDateTimeShort(space.createdAt)} />
+          <DetailField label="更新日時" value={formatDateTimeShort(space.updatedAt)} />
+          {space.publishedAt && (
+            <DetailField label="公開日時" value={formatDateTimeShort(space.publishedAt)} />
+          )}
+        </div>
+      </DetailSection>
```

**Step 5: 検証**

```bash
bun run validate
```

**Step 6: コミット**

```bash
git commit -m "refactor(admin): SpaceDetail — standardize read-only fields with DetailField"
```

---

## Task 13: coupons/[id]/page.tsx — Card → DetailSection 修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/coupons/[id]/page.tsx`

**現状の問題:**

- `<Card className="p-4">` + `<h3>` の非標準パターン → `DetailSection + DetailField`
- `<p className="text-sm text-muted-foreground">` + `<p className="text-2xl font-bold">` → `DetailField` with custom value

**Step 1: import 修正**

```diff
 import { getCouponById, deleteCoupon } from "@/admin/actions/coupon";
 import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
 import { DangerZone } from "@/admin/components/DangerZone";
 import { CouponForm } from "../_components/CouponForm";
-import { Card } from "@/admin/components/ui";
+import { DetailSection } from "@/admin/components/DetailSection";
+import { DetailField } from "@/admin/components/DetailField";
 import { formatDateShort, formatPrice } from "@/shared/lib/utils";
```

**Step 2: 「利用統計」Card を DetailSection + DetailField に置き換え**

```diff
-      {/* 利用統計 */}
-      <Card className="p-4">
-        <h3 className="mb-3 font-medium">利用統計</h3>
-        <div className="grid gap-4 sm:grid-cols-4">
-          <div>
-            <p className="text-sm text-muted-foreground">利用回数</p>
-            <p className="text-2xl font-bold">
-              {coupon.usageCount}
-              {coupon.usageLimit && (
-                <span className="text-sm font-normal text-muted-foreground">
-                  {" "}
-                  / {coupon.usageLimit}
-                </span>
-              )}
-            </p>
-          </div>
-          <div>
-            <p className="text-sm text-muted-foreground">割引タイプ</p>
-            <p className="text-lg font-medium">
-              {coupon.type === "PERCENTAGE"
-                ? `${coupon.discountValue}%`
-                : formatPrice(coupon.discountValue)}
-            </p>
-          </div>
-          <div>
-            <p className="text-sm text-muted-foreground">開始日</p>
-            <p className="text-lg">{formatDateShort(coupon.validFrom)}</p>
-          </div>
-          <div>
-            <p className="text-sm text-muted-foreground">終了日</p>
-            <p className="text-lg">
-              {coupon.validUntil
-                ? formatDateShort(coupon.validUntil)
-                : "無期限"}
-            </p>
-          </div>
-        </div>
-      </Card>
+      {/* 利用統計 */}
+      <DetailSection title="利用統計">
+        <div className="grid gap-4 sm:grid-cols-4">
+          <DetailField
+            label="利用回数"
+            value={
+              <span className="text-2xl font-bold">
+                {coupon.usageCount}
+                {coupon.usageLimit && (
+                  <span className="text-sm font-normal text-muted-foreground">
+                    {" "}/ {coupon.usageLimit}
+                  </span>
+                )}
+              </span>
+            }
+          />
+          <DetailField
+            label="割引タイプ"
+            value={
+              <span className="text-lg font-medium">
+                {coupon.type === "PERCENTAGE"
+                  ? `${coupon.discountValue}%`
+                  : formatPrice(coupon.discountValue)}
+              </span>
+            }
+          />
+          <DetailField
+            label="開始日"
+            value={<span className="text-lg">{formatDateShort(coupon.validFrom)}</span>}
+          />
+          <DetailField
+            label="終了日"
+            value={
+              <span className="text-lg">
+                {coupon.validUntil ? formatDateShort(coupon.validUntil) : "無期限"}
+              </span>
+            }
+          />
+        </div>
+      </DetailSection>
```

**Step 3: 検証**

```bash
bun run validate
```

**Step 4: コミット**

```bash
git commit -m "refactor(admin): coupons detail — replace non-standard Card with DetailSection"
```

---

## Task 14: CustomerDetail.tsx — DetailField 統一

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/customers/[id]/_components/CustomerDetail.tsx`

**現状の問題:**

- 「基本情報」「統計情報」の `<p>` パターン → `DetailField`
- インタラクティブセクション（ステータス、メモ、アクション、予約履歴）は Card のまま維持

**Step 1: import 追加**

```diff
 import {
   Button,
   Card,
   CardContent,
   CardHeader,
   CardTitle,
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
   Textarea,
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
   Switch,
   Label,
 } from "@/admin/components/ui";
+import { DetailSection } from "@/admin/components/DetailSection";
+import { DetailField } from "@/admin/components/DetailField";
```

**Step 2: 「基本情報」Card を DetailSection + DetailField に置き換え**

```diff
-        <Card>
-          <CardHeader>
-            <CardTitle>基本情報</CardTitle>
-          </CardHeader>
-          <CardContent className="grid gap-4 sm:grid-cols-2">
-            <div>
-              <p className="text-sm text-muted-foreground">お名前</p>
-              <p className="font-medium">
-                {customer.lastName} {customer.firstName}
-              </p>
-            </div>
-            <div>
-              <p className="text-sm text-muted-foreground">メールアドレス</p>
-              <a
-                href={`mailto:${customer.email}`}
-                className="text-primary hover:underline"
-              >
-                {customer.email}
-              </a>
-            </div>
-            <div>
-              <p className="text-sm text-muted-foreground">電話番号</p>
-              <p>{customer.phoneNumber || "-"}</p>
-            </div>
-            <div>
-              <p className="text-sm text-muted-foreground">住所</p>
-              <p>{customer.address || "-"}</p>
-            </div>
-          </CardContent>
-        </Card>
+        <DetailSection title="基本情報">
+          <div className="grid gap-4 sm:grid-cols-2">
+            <DetailField
+              label="お名前"
+              value={`${customer.lastName} ${customer.firstName}`}
+            />
+            <DetailField
+              label="メールアドレス"
+              value={
+                <a href={`mailto:${customer.email}`} className="text-primary hover:underline">
+                  {customer.email}
+                </a>
+              }
+            />
+            <DetailField label="電話番号" value={customer.phoneNumber} />
+            <DetailField label="住所" value={customer.address} />
+          </div>
+        </DetailSection>
```

**Step 3: 「統計情報」Card を DetailSection + DetailField に置き換え**

統計情報は `text-2xl font-bold` などの大きい typography を使うため、`DetailField.value` に JSX を渡す:

```diff
-        <Card>
-          <CardHeader>
-            <CardTitle>統計情報</CardTitle>
-          </CardHeader>
-          <CardContent className="grid gap-4 sm:grid-cols-3">
-            <div>
-              <p className="text-sm text-muted-foreground">予約回数</p>
-              <p className="text-2xl font-bold">{customer.totalReservations}</p>
-            </div>
-            <div>
-              <p className="text-sm text-muted-foreground">累計利用金額</p>
-              <p className="text-2xl font-bold">
-                {formatPrice(customer.totalSpent, "-")}
-              </p>
-            </div>
-            <div>
-              <p className="text-sm text-muted-foreground">最終予約日</p>
-              <p className="text-lg">
-                {formatDateShort(customer.lastReservationAt)}
-              </p>
-            </div>
-          </CardContent>
-        </Card>
+        <DetailSection title="統計情報">
+          <div className="grid gap-4 sm:grid-cols-3">
+            <DetailField
+              label="予約回数"
+              value={<span className="text-2xl font-bold">{customer.totalReservations}</span>}
+            />
+            <DetailField
+              label="累計利用金額"
+              value={<span className="text-2xl font-bold">{formatPrice(customer.totalSpent, "-")}</span>}
+            />
+            <DetailField
+              label="最終予約日"
+              value={<span className="text-lg">{formatDateShort(customer.lastReservationAt)}</span>}
+            />
+          </div>
+        </DetailSection>
```

**Step 4: 予約履歴・ステータス・メモ・アクションは Card のまま維持（インタラクティブ）**

**Step 5: 検証**

```bash
bun run validate
```

**Step 6: コミット**

```bash
git commit -m "refactor(admin): CustomerDetail — standardize read-only fields with DetailField"
```

---

## Task 15: 最終検証 + ビルド確認

**Step 1: 型検査 + lint + ビルド**

```bash
bun run validate && bun run build
```

Expected: 型エラーなし、lint エラーなし、ビルド成功

**Step 2: 問題があれば修正して再実行**

型エラーが出た場合は当該ファイルを修正してから再度 `bun run validate && bun run build`

**Step 3: 最終コミット（必要に応じて）**

```bash
git commit -m "chore: final validation after admin detail/edit pages UI unification"
```

---

## 変更範囲サマリー

| カテゴリ                                    | ファイル数 | 内容                                                                                      |
| ------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| Bug Fix: connection() 重複                  | 5          | posts, news, spaces/edit, pages/[slug]/edit, pages/homepage/edit                          |
| Bug Fix: generateMetadata connection() 欠落 | 1          | customers/[id]/edit                                                                       |
| AdminDetailLayout 追加                      | 2          | terms/[id], terms/[id]/versions/[versionId]                                               |
| generateMetadata 動的化                     | 5          | terms/[id], terms/versions/[versionId], staff/[id], staff/edit, faq/categories/edit       |
| Button variant 修正                         | 2          | customers/[id], reservations/[id]                                                         |
| DangerZone itemName 追加                    | 1          | reservations/[id]                                                                         |
| DetailSection/DetailField 統一              | 6          | staff/[id], ReservationDetail, LocationDetail, InquiryDetail, SpaceDetail, CustomerDetail |
| DetailSection 構造修正                      | 2          | staff/edit, coupons/[id]                                                                  |

**除外（特殊エディタ、変更対象外）:**

- `posts/[id]`, `news/[id]`, `spaces/[id]/edit`, `pages/[slug]/edit`, `pages/homepage/edit` — connection() バグ修正済み（Task 1）。InlineEditorShell を使う特殊レイアウトのため AdminDetailLayout は適用しない
