# アーキテクチャ改善設計

**日付**: 2026-02-18
**スコープ**: 包括的アーキテクチャ改善（破壊的変更許可）
**対象スタック**: Next.js 16.1.6 / React 19.2.4 / TypeScript 6.0-beta / Prisma 7.4 / Bun 1.3.x
**現状スコア**: 91/100 → **目標: 97/100**

---

## 調査サマリー

### すでに優秀な実装（改善不要）

調査の結果、以下の項目は完璧に実装済みであることが確認された:

| 項目                                                       | 状態                              |
| ---------------------------------------------------------- | --------------------------------- |
| error.tsx / global-error.tsx / not-found.tsx / loading.tsx | ✅ 全ルートで実装済み             |
| useActionState / useOptimistic / useTransition             | ✅ 適切に使用                     |
| Suspense バウンダリ（PPR 対応）                            | ✅ Root Layout で完璧             |
| updateTag() による全 Server Actions のキャッシュ無効化     | ✅ 全33ファイル準拠               |
| 'use cache' + cacheTag() + cacheLife() カバレッジ          | ✅ 全公開アクション完璧           |
| PixiJS 型安全性                                            | ✅ 型アサーションなし             |
| SectionType 型安全性                                       | ✅ isValidSectionType() 実装済み  |
| console.\* 除去                                            | ✅ プロダクションコードで完全除去 |
| any 型                                                     | ✅ プロダクションコードで完全除去 |
| バレルエクスポート設計                                     | ✅ tree-shaking 対応              |

### 残存する改善項目（6項目）

---

## 改善項目 1: `server-only` パッケージ採用

**カテゴリ**: セキュリティ
**優先度**: P0
**スコア寄与**: +3点

### 背景

Next.js 公式 [Data Access Layer](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#keeping-server-only-code-out-of-the-client-environment) ドキュメントは、サーバー専用モジュールに `import 'server-only'` を付けることを必須推奨している。

`'use server'` / `'use cache'` ディレクティブはランタイム境界を制御するが、`server-only` はバンドラーレベルでクライアントバンドルへの混入を**ビルド時エラー**で防ぐ。これにより:

- DB 接続情報がクライアントバンドルに含まれるリスクをゼロにする
- 誤って import した場合にビルドが即座に失敗する（サイレント漏洩を防ぐ）

### 対象ファイル（最小精確ターゲット）

```
src/shared/lib/prisma.ts          — DB クライアント + シークレット
src/shared/lib/auth.ts            — Better Auth 設定（OAuth シークレット等）
src/shared/lib/errors/logger.ts   — サーバー専用構造化ロガー
src/admin/lib/action-auth.ts      — 権限チェック関数群
src/admin/lib/permissions.ts      — 権限定義マップ（ROLE_PERMISSIONS 等）
src/admin/lib/audit.ts            — 監査ログ記録関数
```

### 実装方法

```bash
# パッケージインストール
bun add server-only
```

```typescript
// 各ファイル先頭に追加（1行のみ）
import "server-only";

// 例: src/shared/lib/prisma.ts
import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
// ...
```

### 除外対象

以下のファイルは `'use server'` / `'use cache'` で境界制御されているため `server-only` 不要:

- `src/app/(admin)/.../actions/*.ts` — `'use server'` ディレクティブあり
- `src/app/(public)/_shared/actions/*.ts` — `'use cache'` ディレクティブあり

---

## 改善項目 2: Route Handler キャッシュ無効化

**カテゴリ**: キャッシュ正確性
**優先度**: P1
**スコア寄与**: +2点

### 背景

CRON Job と Webhook Route Handler がカレンダー同期後にキャッシュを無効化していない。結果として、同期完了後もユーザーには古いキャッシュデータが返され続ける。

`updateTag()` は Server Actions 専用（read-your-own-writes）。Route Handlers では `revalidateTag()` を使用する。

### 対象ファイル

```
src/app/api/cron/calendar-sync/route.ts      — syncFromCalendar() 後にタグ無効化なし
src/app/api/webhooks/google-calendar/route.ts — 同上
```

### 実装方法

```typescript
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";

// Route Handler 内（syncFromCalendar() 後に追加）
await syncFromCalendar();
revalidateTag(CACHE_TAGS.RESERVATIONS);
// 必要に応じて: revalidateTag(CACHE_TAGS.RESERVATION_SLOTS)
```

---

## 改善項目 3: Turbopack ファイルシステムキャッシュ有効化

**カテゴリ**: 開発体験
**優先度**: P2
**スコア寄与**: +1点

### 背景

Next.js 16 の Turbopack experimental 機能。開発サーバー再起動後もビルドキャッシュをファイルシステムに永続化し、コールドスタート時間を大幅短縮する。現在の `next.config.ts` には設定なし。

### 実装方法

```typescript
// next.config.ts の experimental セクションに追加
experimental: {
  turbopackFileSystemCacheForDev: true,  // 追加
  optimizePackageImports: [...],          // 既存（変更なし）
}
```

### 注意事項

- `.next/cache/` はすでに `.gitignore` で除外済み
- Windows + Turbopack 環境での互換性を初回起動時に確認する

---

## 改善項目 4: `useFormStatus` 採用

**カテゴリ**: React 19 パターン
**優先度**: P2
**スコア寄与**: +0.5点

### 背景

現在、管理画面フォームの Submit ボタンコンポーネントに `isPending` を props 経由で渡している。React 19 の `useFormStatus` を使えば props なしでフォームの送信状態にアクセスでき、不要な props ドリリングを排除できる。

### 実装方法

```typescript
// Before: props で isPending を受け取る Submit ボタン
function SubmitButton({ isPending, children }: { isPending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" disabled={isPending}>
      {isPending ? '保存中...' : children}
    </Button>
  )
}

// After: useFormStatus で自律的に状態取得
import { useFormStatus } from 'react-dom'

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? '保存中...' : children}
    </Button>
  )
}
```

### 適用範囲

`useActionState` + FormData パターンを使用しているフォーム（`CustomerForm`, `CouponForm` 等）の Submit ボタン。
React Hook Form + `useTransition` パターンでは不要（`isPending` が既にロカールスコープで利用可能）。

---

## 改善項目 5: `global.d.ts` 型改善

**カテゴリ**: 型安全性
**優先度**: P3
**スコア寄与**: +0.5点

### 背景

`src/shared/types/global.d.ts` の `gtag` が `(...args: any[]) => void` 型。

```typescript
// 現状
declare global {
  var gtag: ((...args: any[]) => void) | undefined;
}
```

### 実装方法

`@next/third-parties` が提供する `gtag` の実際のシグネチャに合わせた厳密な型定義に変更:

```typescript
// 改善後
type GtagCommand = "config" | "event" | "get" | "set" | "consent";
type GtagParams = Record<string, string | number | boolean | null | undefined>;

declare global {
  var gtag:
    | ((command: GtagCommand, target: string, params?: GtagParams) => void)
    | undefined;
}
```

---

## 改善項目 6: ルールファイル更新

**カテゴリ**: ドキュメント整合性
**優先度**: P3
**スコア寄与**: 品質向上（点数外）

### 変更内容

#### `.claude/rules/server-actions.md`

- Route Handler での `revalidateTag()` 使用例を実際のファイルパターンに合わせて更新
- `server-only` と `revalidateTag()` の使い分けを補完

#### `.claude/rules/` への追加（新規ファイル）

`server-only-patterns.md` を追加:

- `server-only` が必要なファイルの判断基準
- `'use server'` / `'use cache'` との違い
- 対象ファイルリスト

---

## 実装フェーズ計画

### Phase 1: セキュリティ（即時）

1. `bun add server-only`
2. 6ファイルに `import 'server-only'` 追加
3. ビルド確認 + 型チェック

### Phase 2: キャッシュ正確性（即時）

1. `calendar-sync/route.ts` に `revalidateTag()` 追加
2. `google-calendar/route.ts` に `revalidateTag()` 追加
3. 既存 `CACHE_TAGS.RESERVATIONS` 定数の確認

### Phase 3: 開発体験（設定変更1行）

1. `next.config.ts` に `turbopackFileSystemCacheForDev: true` 追加

### Phase 4: React 19 パターン

1. Submit ボタンコンポーネントの特定
2. `useFormStatus` への変更
3. 不要になった `isPending` props の削除

### Phase 5: 型安全性 + ドキュメント

1. `global.d.ts` の gtag 型改善
2. ルールファイル更新

---

## 期待される最終状態

| 指標               | 改善前     | 改善後     |
| ------------------ | ---------- | ---------- |
| セキュリティスコア | 88/100     | 95/100     |
| キャッシュ正確性   | 85/100     | 97/100     |
| 型安全性           | 94/100     | 97/100     |
| 開発体験           | 90/100     | 95/100     |
| **総合スコア**     | **91/100** | **97/100** |

---

## 参考資料

- [Next.js Data Access Layer](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#keeping-server-only-code-out-of-the-client-environment)
- [Next.js Cache Invalidation](https://nextjs.org/docs/app/building-your-application/caching#invalidating-1)
- [React 19 useFormStatus](https://react.dev/reference/react-dom/hooks/useFormStatus)
- [Turbopack Configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack)
