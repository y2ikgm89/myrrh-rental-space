---
name: split-action-file
description: >
  大きな Server Action ファイル（500行超）を queries.ts + mutations.ts + index.ts（barrel）に分割する。
  get* 系は queries.ts、create*/update*/delete*/publish*/toggle*/restore*/archive* 系は mutations.ts に振り分ける。
  barrel の index.ts で既存 import パスを変えずに透過する。
argument-hint: <action-file-path>
---

# split-action-file スキル

## 目的

`_shared/actions/<name>.ts`（500行超）を以下の 3 ファイルに分割する:

```
actions/<name>/
├── queries.ts    # "use server" + get* 系関数・Public 型・ヘルパー定数
├── mutations.ts  # "use server" + create*/update*/delete*/publish*/toggle*/restore*/archive* 系
└── index.ts      # barrel: export * from './queries'; export * from './mutations'
```

## 手順

### Step 1: 元ファイルを Read して全体を把握

対象ファイルを Read し、以下を特定する:

- import 文（どちらのファイルが必要か）
- 関数一覧（get\* 系 vs mutation 系）
- 共有定数・型・ヘルパー関数（どちらに置くか）

**注意: MINGW64 制約** — `()` を含むパスはシェルに渡さず、Read/Edit/Grep ツールを使用。

### Step 2: 振り分け基準

| queries.ts                            | mutations.ts                            |
| ------------------------------------- | --------------------------------------- |
| `get*`, `getPublic*`, `getActive*` 系 | `create*`, `update*`, `delete*` 系      |
| 読み取り権限チェック（該当時）        | `publish*`, `archive*`, `toggle*` 系    |
| Public 型（`PublicPost` 等）          | `restore*`, `reorder*` 系               |
| `ITEMS_PER_PAGE` 等の定数             | `executeAdminMutationResult` を使う関数 |

### Step 3: queries.ts を作成

```typescript
"use server";

import { prisma } from "@/shared/lib/prisma";
// ... 必要な import のみ

export async function get<Resource>(...) { ... }
```

### Step 4: mutations.ts を作成

```typescript
"use server";

import { prisma } from "@/shared/lib/prisma";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
// ... 必要な import のみ

export async function create<Resource>(...): Promise<MutationResult<{ id: string }>> {
  return executeAdminMutationResult({
    resource: "<resource>",
    action: "create",
    execute: async () => { ... },
    afterSuccess: () => { updateTag(CACHE_TAGS.<RESOURCES>); },
    resolveAuditResourceId: (data) => data.id,
  });
}
```

### Step 5: index.ts（barrel）を作成

```typescript
export * from "./queries";
export * from "./mutations";
```

**barrel には `"use server"` は不要。**

### Step 6: 元ファイルを削除

```bash
git rm src/app/(admin)/admin/(dashboard)/_shared/actions/<name>.ts
```

### Step 7: 型チェック・コミット

```bash
bun run type-check
git add ... && git commit -m "refactor(actions): split <name>.ts into queries/mutations modules"
```

## プロジェクト固有の注意点

- 読み取り系はレイアウトの認証ガードに依存（個別の権限チェック不要）
- mutations.ts 内の関数はすべて `executeAdminMutationResult` 経由
- 両ファイルで使う型は queries.ts で export（mutations.ts は queries.ts から import 可）
- `toPlainObject` / `toPlainArray` は必ず使う（Prisma オブジェクトを直接 return 禁止）
- helpers が必要な場合（shared 型ガード等）は `helpers.ts` に抽出（`"use server"` なし）

## 分割優先ファイル（2026-03-06 時点）

| ファイル            | 行数 | 優先度 |
| ------------------- | ---- | ------ |
| `page.ts`           | 732L | 🔴 高  |
| `editor-comment.ts` | 645L | 🟡 中  |
| `faq.ts`            | 640L | 🟡 中  |
| `space.ts`          | 632L | 🟡 中  |
