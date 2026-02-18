# server-only パターンルール

> Next.js Data Access Layer / ビルド時サーバー境界強制

## `server-only` の役割

`import 'server-only'` は webpack/Turbopack の `browser` 条件を使い、
クライアントバンドルに含まれた場合に**ビルド時エラー**を発生させる。

| 方式 | 境界制御 | 保護レベル |
|------|---------|-----------|
| `import 'server-only'` | バンドラーレベル（ビルド時） | **最強**：クライアント混入をビルドで検出 |
| `'use server'` | ランタイム（RPC 境界） | 関数を Server Action に変換（DB保護ではない） |
| `'use cache'` | ランタイム（キャッシュ境界） | キャッシュ関数（DB保護ではない） |

`'use server'` / `'use cache'` はランタイム境界を制御するが、
**`server-only` はバンドラーレベルでクライアントへの混入を物理的に防ぐ**。

## 追加対象ファイル（Data Access Layer）

以下のファイルはシークレット・DB接続・権限定義を含むため `server-only` が必須:

| ファイル | 理由 |
|---------|------|
| `src/shared/lib/prisma.ts` | DB 接続文字列・PrismaClient |
| `src/shared/lib/auth.ts` | OAuth シークレット・Better Auth 設定 |
| `src/shared/lib/errors/logger.ts` | サーバー専用構造化ロガー |
| `src/app/(admin)/.../_shared/lib/action-auth.ts` | 権限チェック関数群 |
| `src/app/(admin)/.../_shared/lib/permissions.ts` | ROLE_PERMISSIONS 定義 |
| `src/app/(admin)/.../_shared/lib/audit.ts` | 監査ログ記録関数 |

## 追加不要なファイル

| ファイル | 理由 |
|---------|------|
| `src/shared/lib/logger.ts` | クライアントコンポーネントでも使用する汎用ロガー |
| `src/app/(admin)/.../actions/*.ts` | `'use server'` ディレクティブで境界制御済み |
| `src/app/(public)/_shared/actions/*.ts` | `'use cache'` ディレクティブで境界制御済み |

## 実装パターン

```typescript
// NG: 独自実装（ランタイムチェックのみ → バンドルには含まれる）
if (typeof window !== 'undefined') throw new Error('server only')

// OK: npm パッケージ（ビルド時にクライアントバンドルへの混入を防ぐ）
import 'server-only'

// ファイル先頭に1行追加（JSDocコメントの後、最初のimportの前）
import 'server-only'

import { PrismaClient } from '...'
```

## 追加方法

```bash
# インストール（既にインストール済み）
bun add server-only

# 各ファイル先頭の最初の import の前に1行追加
import 'server-only'
```

## 禁止事項

1. **独自 `server-only` 実装禁止**
   - `typeof window` チェック等はランタイムのみ → バンドル保護にならない
   - npm `server-only` パッケージを使用する

2. **`server-only` ファイルをクライアントコンポーネントに import 禁止**
   - `'use client'` ファイルから import するとビルドエラー（これが目的）
   - クライアントで必要なロジックは `server-only` なしの別ファイルに切り出す

3. **`server-only` 対象ファイルに誤ってクライアントコードを追加禁止**
   - `use client` hooks（`useState`, `useEffect` 等）はクライアント限定 → 別ファイルに
