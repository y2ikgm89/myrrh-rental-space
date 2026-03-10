# 035: パフォーマンス最適化・保守性向上計画

**作成日**: 2026-01-16
**ステータス**: 計画中

## 概要

プロジェクト全体の分析に基づき、パフォーマンス・保守性・高速化の改善点を優先度順に整理。

## 問題分析サマリー

| カテゴリ         | Critical | High | Medium |
| ---------------- | -------- | ---- | ------ |
| パフォーマンス   | 3        | 3    | 3      |
| データベース     | 2        | 3    | 1      |
| Next.js最適化    | 4        | 2    | 1      |
| 保守性           | 3        | 4    | 2      |
| ビルド・バンドル | 1        | 2    | 1      |

---

## Priority 1: 即効性の高い修正（各30分程度）

### 1.1 データベースインデックス追加

**影響**: クエリ速度30-50%向上

```prisma
// prisma/schema.prisma に追加

// BlogComment - ソフトデリート用
@@index([isDeleted])
@@index([isDeleted, createdAt(sort: Desc)])

// Reservation - カレンダー/空き確認クエリ用
@@index([spaceId, startTime, endTime])

// BlogPost - 公開記事取得用
@@index([status, publishedAt])
```

### 1.2 コネクションプール調整

**ファイル**: `src/lib/prisma.ts`
**影響**: 高負荷時のタイムアウト防止

```typescript
const pool = new Pool({
  max: process.env.NODE_ENV === "production" ? 20 : 5,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 10000,
});
```

### 1.3 ダッシュボード集計ループ最適化

**ファイル**: `src/actions/admin/dashboard.ts` (Line 282+)
**影響**: ダッシュボード統計10倍高速化

**現状**: インメモリで売上集計

```typescript
for (const r of reservations) {
  const dateStr = r.createdAt.toISOString().split("T")[0];
  // ループ内で集計...
}
```

**改善**: DBの `groupBy` 使用

```typescript
const dailyStats = await prisma.reservation.groupBy({
  by: ["createdAt"],
  _sum: { totalPrice: true },
  _count: { id: true },
  where: { status: "CONFIRMED" },
});
```

### 1.4 画像priority属性追加

**ファイル**: 公開ページの画像コンポーネント
**影響**: LCP 500-1000ms改善

```tsx
// src/app/(public)/blog/page.tsx, spaces/page.tsx
<Image
  src={post.thumbnailUrl}
  alt={post.title}
  fill
  priority={index < 2} // 最初の2つに追加
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
/>
```

---

## Priority 2: 重要な最適化（各1時間程度）

### 2.1 統一エラーバウンダリ戦略

**対象**: 管理画面の各ページ

```typescript
// src/app/(admin)/admin/(dashboard)/reservations/error.tsx
'use client'

export default function ReservationsError({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="p-4 bg-destructive/10 border border-destructive rounded">
      <h2>予約一覧の読み込みに失敗しました</h2>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="mt-2 btn btn-primary">
        再試行
      </button>
    </div>
  )
}
```

### 2.2 Lexical エディタ動的インポート

**ファイル**: `src/components/admin/editor/lexical/LexicalEditor.tsx`
**影響**: 管理画面の初期ロード500KB削減

```typescript
// 現在: 直接インポート（500KB+）
import { LexicalComposer } from '@lexical/react/LexicalComposer'

// 改善: 動的インポート
const LexicalEditor = dynamic(
  () => import('./LexicalEditorInner'),
  {
    ssr: false,
    loading: () => <EditorSkeleton />
  }
)
```

### 2.3 粒度の細かいrevalidation

**影響**: キャッシュ効率20-30%向上

```typescript
// 現在: パス全体を無効化
revalidatePath("/admin/blog");
revalidatePath("/blog");

// 改善: タグベース
revalidateTag(`blog-${id}`);
revalidateTag("blog-list");
```

### 2.4 Prisma型変換ミドルウェア

**ファイル**: `src/lib/prisma.ts`
**影響**: 50箇所以上の手動変換を削除

```typescript
prisma.$extends({
  result: {
    reservation: {
      totalPrice: {
        needs: { totalPrice: true },
        compute(reservation) {
          return reservation.totalPrice ? Number(reservation.totalPrice) : null;
        },
      },
    },
  },
});
```

---

## Priority 3: リファクタリング（各2時間程度）

### 3.1 Lexicalコンポーネント分割

**現状**: 280行以上の単一コンポーネント
**改善**: プラグインレジストリパターン

```typescript
// src/components/admin/editor/lexical/plugins/registry.ts
export const pluginRegistry = {
  image: {
    Plugin: ImagePlugin,
    Dialog: ImageDialog,
  },
  youtube: {
    Plugin: YouTubePlugin,
    Dialog: YouTubeDialog,
  },
  // ...
};
```

### 3.2 バリデーションスキーマ集約

**影響**: 重複コード削減、型安全性向上

```typescript
// src/lib/validations/shared.ts
export const statusUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED"]),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
```

### 3.3 レスポンスキャッシュ層実装

**対象**: 頻繁にアクセスされるデータ

```typescript
// src/lib/cache.ts
const cache = new Map<string, { data: unknown; expires: number }>();

export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 5 * 60 * 1000,
): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.data as T;
  }

  const data = await fetcher();
  cache.set(key, { data, expires: Date.now() + ttlMs });
  return data;
}
```

### 3.4 未使用依存関係削除

**確認対象**:

- `@pixi/react`, `pixi.js` - 使用箇所なし
- `@react-three/drei`, `@react-three/fiber` - 遅延ロード化
- `recharts` - ダッシュボードのみ、遅延ロード化

---

## Next.js設定最適化

### next.config.ts 追加設定

```typescript
experimental: {
  optimizePackageImports: [
    'lucide-react',
    'date-fns',
    '@radix-ui/react-dialog',
    '@radix-ui/react-dropdown-menu',
    '@radix-ui/react-select',
    '@radix-ui/react-switch',
    '@radix-ui/react-tabs',
    '@radix-ui/react-tooltip',
    'recharts',  // 追加
  ],
},
```

### ルートセグメント設定追加

```typescript
// src/app/(public)/spaces/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 300; // 5分ISR
export const maxDuration = 60;

// src/app/(public)/blog/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 300;
```

---

## 監視メトリクス

実装後に追跡すべき指標:

| メトリクス         | 目標値  | 計測方法              |
| ------------------ | ------- | --------------------- |
| LCP                | < 2.5s  | Web Vitals            |
| FID                | < 100ms | Web Vitals            |
| 管理画面初期ロード | < 3s    | DevTools              |
| ダッシュボード表示 | < 1s    | Server Action実行時間 |
| DBクエリ平均       | < 50ms  | Prisma Logging        |

---

## 実装順序

1. **Phase 1** (即効性): 1.1 → 1.2 → 1.3 → 1.4
2. **Phase 2** (重要): 2.2 → 2.4 → 2.3 → 2.1
3. **Phase 3** (リファクタ): 3.4 → 3.2 → 3.3 → 3.1

## 関連ファイル

- `prisma/schema.prisma`
- `src/lib/prisma.ts`
- `src/actions/admin/dashboard.ts`
- `src/components/admin/editor/lexical/LexicalEditor.tsx`
- `next.config.ts`
- `package.json`
