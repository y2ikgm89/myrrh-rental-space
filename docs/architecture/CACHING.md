# キャッシング戦略ガイド

> **Note**: このドキュメントには、Next.js 16 App Routerの最新のキャッシングAPIに基づく詳細なキャッシング戦略が記載されています。技術スタックの詳細については、[`CLAUDE.md`](../../CLAUDE.md)を参照してください。

**最終更新**: 2026-01-12

## 実装方針

**後方互換性を考慮しないクリーンな実装**: このプロジェクトは、最新の公式ベストプラクティスに準拠したクリーンでモダンな実装を優先します。古いバージョンや非推奨APIとの後方互換性は維持しません。すべての実装は、フレームワークとライブラリの最新の安定版を使用し、レガシーな回避策なしに公式推奨事項に従う必要があります。

---

## 概要

Next.js 16では、`cacheComponents: true`を有効にすることで、PPR（Partial Prerendering）とCache Componentsが利用可能になります。これにより、静的コンテンツと動的コンテンツを同じルート内で組み合わせ、高速な初期ページロードを実現できます。

### コア概念

| 概念                         | 説明                                               |
| ---------------------------- | -------------------------------------------------- |
| **静的シェル**               | 事前レンダリングされるHTML構造                     |
| **動的ストリーミング**       | リクエスト時にストリーミングされるコンテンツ       |
| **キャッシュコンポーネント** | `'use cache'`でキャッシュされるコンポーネント/関数 |

---

## 設定

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PPR/Cache Componentsを有効化
  // 'use cache' ディレクティブによる明示的キャッシュ制御
  cacheComponents: true,
};

export default nextConfig;
```

---

## キャッシングAPI一覧

### 推奨API（Next.js 16）

#### 1. `'use cache'` ディレクティブ

**用途**: 関数やコンポーネントの結果をキャッシュ

```typescript
import { cacheLife, cacheTag } from "next/cache";

// 関数レベルでのキャッシュ
async function getSpaces() {
  "use cache";
  cacheLife("hours"); // キャッシュ期間
  cacheTag("spaces"); // 無効化用タグ

  return await prisma.space.findMany({
    where: { isPublished: true },
  });
}
```

**特徴**:

- 明示的なオプトインキャッシュ
- `cacheLife()`でキャッシュ期間を制御
- `cacheTag()`で無効化用タグを設定
- シリアライズ可能な値を返す必要あり

#### 2. `cacheLife()` - キャッシュ期間

**プロファイル一覧**:

| プロファイル | stale | revalidate | expire | 用途             |
| ------------ | ----- | ---------- | ------ | ---------------- |
| `'seconds'`  | -     | 1秒        | 1分    | 高頻度更新データ |
| `'minutes'`  | 5分   | 1分        | 1時間  | 中頻度更新データ |
| `'hours'`    | 5分   | 1時間      | 1日    | 低頻度更新データ |
| `'days'`     | 5分   | 1日        | 1週間  | 準静的データ     |
| `'weeks'`    | 5分   | 1週間      | 1ヶ月  | 静的データ       |
| `'max'`      | 5分   | 1ヶ月      | 無期限 | 永続データ       |

```typescript
async function getSettings() {
  "use cache";
  cacheLife("hours"); // 1時間ごとに再検証
  // ...
}
```

#### 3. `cacheTag()` - キャッシュタグ

**用途**: 複数のタグでキャッシュをグループ化し、選択的に無効化

```typescript
async function getSpaceById(id: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("spaces", `space-${id}`); // 複数タグ

  return await prisma.space.findUnique({ where: { id } });
}
```

#### 4. `connection()` - 動的レンダリングシグナル

**用途**: 動的APIを使用せずにリクエスト時レンダリングを明示的にシグナル

```typescript
import { connection } from 'next/server'

async function UniqueContent() {
  await connection()  // リクエスト時レンダリングをシグナル

  const random = Math.random()
  const now = Date.now()

  return <div>{random} - {now}</div>
}
```

**使用ケース**:

- `Math.random()`, `Date.now()`, `crypto.randomUUID()` などの非決定的操作
- 動的APIを使用せずに動的レンダリングが必要な場合

#### 5. `revalidateTag()` - タグベースのキャッシュ無効化

```typescript
import { revalidateTag } from "next/cache";

// Server Actionでキャッシュを無効化
export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({ where: { id }, data });

  // 即座にキャッシュを無効化
  revalidateTag("spaces", { expire: 0 });

  // または stale-while-revalidate
  revalidateTag("spaces", "max");
}
```

#### 6. `revalidatePath()` - パスベースのキャッシュ無効化

```typescript
import { revalidatePath } from "next/cache";

export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({ where: { id }, data });

  revalidatePath("/spaces");
  revalidatePath(`/spaces/${id}`);
}
```

### レガシーAPI（非推奨）

> **Warning**: 以下のAPIは非推奨です。新規実装では使用しないでください。

| レガシーAPI        | 代替                                     |
| ------------------ | ---------------------------------------- |
| `unstable_cache`   | `'use cache'` + `cacheLife` + `cacheTag` |
| `unstable_noStore` | `connection()` または `<Suspense>`       |

---

## 公式推奨パターン（3つの動的コンテンツタイプ）

### パターン1: キャッシュコンテンツ（`'use cache'`）

**用途**: 全ユーザー共通のデータをキャッシュ

```typescript
// src/lib/data.ts
import { cacheLife, cacheTag } from "next/cache";

export async function getSpaces() {
  "use cache";
  cacheLife("hours");
  cacheTag("spaces");

  return await prisma.space.findMany({
    where: { isPublished: true },
  });
}
```

**特徴**:

- 静的シェルに含まれる
- プリレンダリング時にデータ取得
- 指定期間後に自動再検証

### パターン2: ストリーミング動的コンテンツ（`<Suspense>`）

**用途**: リクエスト時に最新データが必要な場合

```typescript
// src/app/spaces/page.tsx
import { Suspense } from 'react'

async function SpaceResults({ searchParams }) {
  const { q } = await searchParams
  const spaces = await prisma.space.findMany({
    where: { name: { contains: q } },
  })
  return <SpaceList spaces={spaces} />
}

export default function SpacesPage({ searchParams }) {
  return (
    <section>
      {/* 静的シェル */}
      <h1>スペース一覧</h1>

      {/* 動的コンテンツ */}
      <Suspense fallback={<Loading />}>
        <SpaceResults searchParams={searchParams} />
      </Suspense>
    </section>
  )
}
```

**特徴**:

- fallback が静的シェルの一部
- 実際のコンテンツはリクエスト時にストリーミング
- searchParams, cookies, headers などのランタイムデータ用

### パターン3: 非決定的操作（`connection()`）

**用途**: `Date.now()`, `Math.random()` などの非決定的操作

```typescript
import { Suspense } from 'react'
import { connection } from 'next/server'

async function UniqueContent() {
  await connection()  // リクエスト時レンダリングをシグナル

  const timestamp = Date.now()
  const uuid = crypto.randomUUID()

  return <div>{timestamp} - {uuid}</div>
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <UniqueContent />
    </Suspense>
  )
}
```

---

## 実装パターン

### 公開ページ

#### ホームページ（静的シェル + 動的コンテンツ）

```typescript
// src/app/(public)/page.tsx
import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'

// キャッシュされたデータ取得
async function getPopularSpaces() {
  'use cache'
  cacheLife('minutes')
  cacheTag('spaces')

  return await prisma.space.findMany({
    where: { isPublished: true },
    take: 6,
    orderBy: { createdAt: 'desc' },
  })
}

async function SpaceList() {
  const spaces = await getPopularSpaces()
  return <SpaceGrid spaces={spaces} />
}

export default function HomePage() {
  return (
    <div>
      {/* 静的シェル */}
      <Hero />

      {/* キャッシュコンテンツ */}
      <SpaceList />
    </div>
  )
}
```

#### 詳細ページ（動的パラメータ）

```typescript
// src/app/(public)/spaces/[id]/page.tsx
import { cacheLife, cacheTag } from 'next/cache'
import { notFound } from 'next/navigation'

async function getSpaceById(id: string) {
  'use cache'
  cacheLife('hours')
  cacheTag('spaces', `space-${id}`)

  return await prisma.space.findUnique({
    where: { id, isPublished: true },
  })
}

export async function generateStaticParams() {
  'use cache'
  cacheLife('hours')
  cacheTag('spaces')

  const spaces = await prisma.space.findMany({
    where: { isPublished: true },
    select: { id: true },
  })

  // 空の場合はプレースホルダーを返す
  if (spaces.length === 0) {
    return [{ id: '__placeholder__' }]
  }

  return spaces.map(space => ({ id: space.id }))
}

export default async function SpacePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // プレースホルダーの場合は404
  if (id === '__placeholder__') {
    notFound()
  }

  const space = await getSpaceById(id)
  if (!space) notFound()

  return <SpaceDetails space={space} />
}
```

#### 検索結果ページ（searchParams）

```typescript
// src/app/(public)/spaces/page.tsx
import { Suspense } from 'react'

async function SpaceResults({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const { q, page } = await searchParams

  const spaces = await prisma.space.findMany({
    where: q ? { name: { contains: q } } : { isPublished: true },
    skip: ((parseInt(page || '1') - 1) * 10),
    take: 10,
  })

  return <SpaceList spaces={spaces} />
}

export default function SpacesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  return (
    <section>
      <h1>スペース一覧</h1>
      <Suspense fallback={<SpaceListSkeleton />}>
        <SpaceResults searchParams={searchParams} />
      </Suspense>
    </section>
  )
}
```

### 管理画面

#### 管理ページ（動的レンダリング）

```typescript
// src/app/(admin)/admin/settings/page.tsx
import { Suspense } from 'react'
import { connection } from 'next/server'

async function SettingsContent() {
  // 明示的にリクエスト時レンダリングをシグナル
  await connection()

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
  })

  return <SettingsForm settings={settings} />
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsContent />
    </Suspense>
  )
}
```

### Server Actions でのキャッシュ無効化

```typescript
// src/actions/admin/spaces.ts
"use server";

import { revalidatePath, revalidateTag } from "next/cache";

export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({
    where: { id },
    data,
  });

  // タグベースの無効化（即座に）
  revalidateTag("spaces", { expire: 0 });
  revalidateTag(`space-${id}`, { expire: 0 });

  // パスベースの無効化
  revalidatePath("/spaces");
  revalidatePath(`/spaces/${id}`);
  revalidatePath("/");

  return { success: true };
}
```

---

## ランタイムデータとキャッシュの分離

### 重要な制約

> **`'use cache'` 内でランタイムAPI（`cookies()`, `headers()`, `searchParams`）は使用できません。**

### 正しいパターン: 値を抽出して引数として渡す

```typescript
// ❌ 間違い: use cache 内で cookies() を呼び出す
async function getUserData() {
  'use cache'
  const session = await cookies()  // エラー
  return await fetchUserData(session.get('userId'))
}

// ✅ 正しい: 値を抽出して引数として渡す
async function ProfileContent() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('userId')?.value

  return <CachedProfile userId={userId} />
}

async function CachedProfile({ userId }: { userId: string }) {
  'use cache'
  cacheLife('hours')

  // userId がキャッシュキーの一部になる
  const profile = await fetchUserProfile(userId)
  return <ProfileCard profile={profile} />
}
```

---

## キャッシュ階層

| レベル | パターン                               | 用途           | 例                        |
| ------ | -------------------------------------- | -------------- | ------------------------- |
| L1     | 静的                                   | 変更なし       | プライバシーポリシー      |
| L2     | `'use cache'` + `cacheLife('hours')`   | 1時間ごと      | ナビゲーション、設定      |
| L3     | `'use cache'` + `cacheLife('minutes')` | 15分ごと       | スペース一覧              |
| L4     | `<Suspense>`                           | リクエストごと | 検索結果、認証データ      |
| L5     | `connection()`                         | 非決定的操作   | Date.now(), Math.random() |

---

## セキュリティ考慮事項

### 機密情報のキャッシュ回避

```typescript
// ❌ ユーザー固有のデータをキャッシュ
async function getUserReservations(userId: string) {
  "use cache"; // 危険: 他のユーザーに見える可能性
  return await prisma.reservation.findMany({ where: { userId } });
}

// ✅ ユーザー固有のデータはキャッシュしない
async function getUserReservations(userId: string) {
  // キャッシュなし - 常に最新データ
  return await prisma.reservation.findMany({ where: { userId } });
}
```

### チェックリスト

- [ ] 機密情報をキャッシュキーに含めていないか
- [ ] ユーザー固有のデータは `'use cache'` を使用していないか
- [ ] 認証が必要なデータは適切に保護されているか
- [ ] 公開データと非公開データのキャッシュを分離しているか

---

## トラブルシューティング

### `new Date()` エラー

**エラー**: `Route used 'new Date()' before accessing uncached data`

**解決策**:

1. `'use cache'` でラップ（キャッシュされた日付を使用）
2. `<Suspense>` 内で使用（動的レンダリング）
3. `connection()` でシグナル（非決定的操作）

### キャッシュが無効化されない

**解決策**:

```typescript
// タグとパスの両方を無効化
revalidateTag("spaces", { expire: 0 });
revalidatePath("/spaces");
```

---

## 参考資料

### プロジェクトドキュメント

- [`CLAUDE.md`](../../CLAUDE.md) - プロジェクト全体の仕様書
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - システムアーキテクチャ

### 外部リソース

- [Next.js Cache Components](https://nextjs.org/docs/app/getting-started/cache-components)
- [Next.js `use cache` Directive](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [Next.js `connection()`](https://nextjs.org/docs/app/api-reference/functions/connection)
- [Next.js `cacheLife`](https://nextjs.org/docs/app/api-reference/functions/cacheLife)
- [Next.js `cacheTag`](https://nextjs.org/docs/app/api-reference/functions/cacheTag)

---

## 更新履歴

- **2026-01-12**: Next.js 16 cacheComponents の公式ベストプラクティスに全面改訂
  - `'use cache'` ディレクティブを推奨パターンとして追加
  - `connection()` の使用方法を追加
  - 公式推奨の3つのパターンを明確化
  - レガシーAPI（`unstable_cache`, `unstable_noStore`）を非推奨として明記
  - 実装例を全て最新パターンに更新
- **2026-01-08**: stale-while-revalidate semantics の説明を強化
- **2026-01-07**: PPR/Cache Components セクション追加
- **2026-01-06**: 初版作成
