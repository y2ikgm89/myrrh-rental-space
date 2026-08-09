---
paths:
  - "src/**"
---

# src/ の境界

ほとんどが gate で機械強制されている。ここに書くのは**書く前に知っていれば
pre-push の往復を 1 回減らせる**ものだけ。詳細は各 gate の冒頭 JSDoc が正本。

## surface の分割

- `src/app/(admin)/**` と `src/app/(public)/**` は**相互 import 禁止**。
  共有したいものは `src/shared/` へ出すしかない。
  強制: `__tests__/unit/architecture/cross-surface-import-gate.test.ts`
- 2 つは Multiple Root Layouts で、それぞれ独自の `<html>` を持つ。
  surface をまたぐ遷移はフルリロードになる。

## Prisma

- `@/shared/db/prisma` を import してよいのは `src/shared/db/` と
  `src/shared/domain/` だけ。import するファイルは先頭に `import "server-only";`。
  強制: `__tests__/unit/architecture/prisma-import-boundary.test.ts`
- Prisma の enum 値・`Prisma` 名前空間の型は
  `src/shared/lib/validations/enums/prisma-types.ts` 経由で参照する。
  `@generated/prisma/*` の直 import が許されるのは `shared/db` /
  `shared/domain` / gateway 自身のディレクトリのみで、しかも `shared/domain` から
  `@generated/prisma/enums` を直に引くのは 0 件強制。

## 環境変数

`src/shared/lib/env/server.ts` / `client.ts`（t3-oss + Zod）経由で読む。
`process.env` を直に触っているのは env モジュール自身・instrumentation・logger 等の
基盤だけで、新しいコードでこれを増やさない。env を足したら env モジュール側も直す。

## 死んだコードを残さない

App Router のエントリーポイントから到達しないモジュールは違反で、**allowlist は空**。
`scripts/` `prisma/seed.ts` `e2e/` `__tests__/` からしか到達しないモジュールも
orphan 扱いになる — つまり「テストだけが生かしているコード」は落ちる。
消し忘れた re-export / barrel / 未配線の新規モジュールは pre-push で落ちる。
強制: `__tests__/unit/architecture/module-reachability.test.ts`

## キャッシュ

producer は 3 点セット。`"use cache"` → `cacheLife(CACHE_LIFE.X)` →
`cacheTag(CACHE_TAGS.X, ...)`。`cacheLife` / `cacheTag` の import 元は `next/cache`。
tag のリテラル直書きは ESLint と gate が拒否する。

## gate が自動では追えないもの（手で守る）

- **公開フォームの Server Action を新設したら**、guard の順序契約を検査する
  `__tests__/unit/architecture/public-mutation-guard-order.test.ts` の SSoT 配列にも
  追加する。追加しないと新しい action は検査対象に入らず、gate は素通りする。
- 管理ページの認可 helper は **新規ページにだけ効く ratchet**。既存ページの多くは
  allowlist に凍結済みなので、周りを真似ると違反になる。新しい `page.tsx` は
  本体（default export）で `requireAdmin*Page` 系を呼ぶ。
  強制: `__tests__/unit/architecture/admin-page-auth-before-suspense.test.ts`
- コメントに裸の `<name>.md` を書くと、その名前の tracked file が実在しない限り
  落ちる。規約を指したいなら、その場に 1〜2 文書くか、gate を名指しする。
  強制: `__tests__/unit/architecture/src-doc-pointers-resolve.test.ts`

path alias の SSoT は `tsconfig.json` の `paths`（5 本）。
