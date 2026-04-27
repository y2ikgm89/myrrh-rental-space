---
name: use-server-audit
description: `"use server"` ファイルが Next.js 16 公式の export 契約（async 関数のみ export 可）に準拠しているかを横断スキャンする。型・interface・class・非 async const・default 非関数 export を検出し、Turbopack silent bug（`ReferenceError: X is not defined`）の事前防止に使う。Server Action ファイル編集後・大規模 refactor 後に実行。
paths:
  - src/**/actions.ts
  - src/**/mutations.ts
  - src/**/queries.ts
  - src/**/server-actions/**
---

# Use-Server Export Audit

Next.js 16 の [server-actions ドキュメント](https://nextjs.org/docs/app/api-reference/directives/use-server) と CLAUDE.md §「`"use server"` ファイルの export 契約」に基づき、リポジトリ全体の `"use server"` ファイルを監査する。

## 検出対象

ファイルレベル `"use server"` ディレクティブを持つファイルから以下を検出:

1. **型・interface・class の export** — `export type X = ...` / `export interface X` / `export class X`
2. **let / var の export** — `export let X` / `export var X`
3. **非 async const の export** — `export const X = ...`（右辺が `async ...` で始まらないもの）
4. **default 非関数 export** — `export default <非 async>`
5. **逆方向の consumer 違反** — `"use server"` ファイルから `type X` を import している UI / Client Component

すべて Turbopack の server-actions bundler が型/値識別子を runtime 参照化することによる silent `ReferenceError`。

## 実行手順

### 1. `"use server"` ファイルを列挙

```bash
grep -rl '^"use server"' src/ --include="*.ts" --include="*.tsx" 2>/dev/null
```

### 2. 各ファイルで forward 違反を検出

```bash
for f in $(grep -rl '^"use server"' src/ --include="*.ts" --include="*.tsx"); do
  # 型/interface/class/let/var
  grep -nE '^export (type |interface |class |let |var )' "$f" | sed "s|^|$f:|"
  # 非 async const
  grep -nE '^export const [A-Za-z_]+\s*=' "$f" | grep -vE '=\s*async ' | sed "s|^|$f:|"
  # default 非関数
  grep -nE '^export default ' "$f" | grep -vE 'export default async ' | sed "s|^|$f:|"
done
```

### 3. 逆方向（consumer）違反を検出

各 `"use server"` ファイルパスを `@/...` alias 形式に変換し、UI から `type X` import していないかをチェック:

```bash
for f in $(grep -rl '^"use server"' src/ --include="*.ts"); do
  modpath=$(echo "$f" | sed 's|^src/|@/|; s|\.ts$||; s|/index$||')
  grep -rnE "^\s*type [A-Z][A-Za-z]+,?\s*$" src/ --include="*.tsx" --include="*.ts" 2>/dev/null \
    | grep "from \"$modpath\"" \
    | sed "s|^|⚠ consumer:|"
done
```

### 4. レポート出力

```
## "use server" Export Audit

対象ファイル数: N 件

### 違反検出 (M 件)

#### Forward 違反（"use server" ファイル内の禁止 export）
- src/app/(admin)/.../actions/foo.ts:12: export type Bar = ...
- src/app/(admin)/.../actions/baz.ts:5: export const HELPERS = { ... }

#### Consumer 違反（UI が "use server" から型 import）
- src/app/(admin)/.../components/X.tsx:3: import type { Bar } from "@/admin/actions/foo"

### 推奨対応

1. 型は `<file>-types.ts` に退避（参照実装: `space-form-submit-types.ts` / `page-section-types.ts`）
2. 定数・helper は別 module（`import "server-only"`）に分離
3. consumer は新しい types ファイルから import
```

違反ゼロなら「クリーン: N 件すべて契約準拠」と報告。

## 例外

以下は対象外（intentional）:

- `__tests__/` 配下のテストファイル
- `generated/` 配下の自動生成ファイル
- `.d.ts` ファイル

## 参考

- CLAUDE.md §「`"use server"` ファイルの export 契約」
- `.claude/rules/server-actions.md` §検出 grep
- 参照実装: `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section-types.ts`（型分離パターン）
- 公式: [Next.js 16 use-server directive](https://nextjs.org/docs/app/api-reference/directives/use-server)
